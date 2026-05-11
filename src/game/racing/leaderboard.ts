const SAVE_KEY = 'slingshot.racing.save.v1';
const PLAYER_KEY = 'slingshot.racing.playerName';
const SAVE_VERSION = 1;
const MAX_RECENT_RUNS = 12;
const MAX_GHOST_SAMPLES = 3600;
const REMOTE_LEADERBOARD_LIMIT = 10;

export interface GhostSample {
  readonly t: number;
  readonly p: [number, number, number];
  readonly q: [number, number, number, number];
  readonly speed: number;
  readonly checkpointIndex: number;
}

export interface GhostRun {
  readonly courseId: string;
  readonly timeSec: number;
  readonly splits: number[];
  readonly samples: GhostSample[];
}

export interface RaceRunSummary {
  readonly courseId: string;
  readonly timeSec: number;
  readonly splits: number[];
  readonly completedAt: string;
  readonly playerName?: string;
  readonly source?: 'local' | 'supabase';
}

export interface RaceLeaderboardEntry extends RaceRunSummary {
  readonly rank: number;
}

export interface CourseRecord {
  readonly courseId: string;
  readonly bestTimeSec: number;
  readonly bestSplits: number[];
  readonly bestGhost: GhostRun;
  readonly recentRuns: RaceRunSummary[];
  readonly playerName?: string;
  readonly source?: 'local' | 'supabase';
}

export interface RacingSaveData {
  readonly version: number;
  readonly selectedCourseId: string;
  readonly records: Record<string, CourseRecord>;
}

export interface SubmitResult {
  readonly save: RacingSaveData;
  readonly record: CourseRecord;
  readonly isPersonalBest: boolean;
  readonly isGlobalBest?: boolean;
  readonly remoteError?: string;
}

export interface LeaderboardProvider {
  load(): Promise<RacingSaveData>;
  setSelectedCourse(courseId: string): Promise<RacingSaveData>;
  getRecord(courseId: string): CourseRecord | null;
  refreshCourse(courseId: string): Promise<CourseRecord | null>;
  submitRun(run: GhostRun): Promise<SubmitResult>;
  getPlayerName(): string;
  setPlayerName(name: string): Promise<void>;
  getCourseEntries(courseId: string): readonly RaceLeaderboardEntry[];
  isRemoteEnabled(): boolean;
  getLastRemoteError(): string | null;
}

interface SupabaseRaceRow {
  id?: string;
  course_id: string;
  player_name: string;
  time_sec: number;
  splits: number[];
  created_at?: string;
}

interface SupabaseRaceGhostRow extends SupabaseRaceRow {
  ghost: GhostRun;
}

function emptySave(): RacingSaveData {
  return { version: SAVE_VERSION, selectedCourseId: 'claim-shakedown', records: {} };
}

function sanitizeGhost(run: GhostRun): GhostRun {
  if (run.samples.length <= MAX_GHOST_SAMPLES) return run;
  const stride = Math.ceil(run.samples.length / MAX_GHOST_SAMPLES);
  return {
    ...run,
    samples: run.samples.filter((_, index) => index % stride === 0),
  };
}

function recordFromRun(run: GhostRun, recentRuns: RaceRunSummary[], source: CourseRecord['source'], playerName?: string): CourseRecord {
  const record: CourseRecord = {
    courseId: run.courseId,
    bestTimeSec: run.timeSec,
    bestSplits: run.splits,
    bestGhost: run,
    recentRuns,
  };
  if (playerName) Object.assign(record, { playerName });
  if (source) Object.assign(record, { source });
  return record;
}

function normalizePlayerName(): string {
  const fromEnv = import.meta.env.VITE_SLINGSHOT_PLAYER_NAME;
  const fromLocal = safeLocalStorageGet(PLAYER_KEY);
  return sanitizePlayerName(fromLocal || fromEnv || 'Anonymous Pilot');
}

function sanitizePlayerName(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  return cleaned || 'Anonymous Pilot';
}

function safeLocalStorageGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('[racing] failed to persist local setting', err);
  }
}

export class LocalLeaderboardProvider implements LeaderboardProvider {
  protected data: RacingSaveData = emptySave();
  protected entries: Record<string, RaceLeaderboardEntry[]> = {};
  protected playerName = normalizePlayerName();

  async load(): Promise<RacingSaveData> {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        this.data = emptySave();
        return this.data;
      }
      const parsed = JSON.parse(raw) as Partial<RacingSaveData>;
      if (parsed.version !== SAVE_VERSION || !parsed.records) {
        this.data = emptySave();
        return this.data;
      }
      this.data = {
        version: SAVE_VERSION,
        selectedCourseId: typeof parsed.selectedCourseId === 'string' ? parsed.selectedCourseId : 'claim-shakedown',
        records: parsed.records,
      };
    } catch (err) {
      console.warn('[racing] failed to load leaderboard save', err);
      this.data = emptySave();
    }
    return this.data;
  }

  async setSelectedCourse(courseId: string): Promise<RacingSaveData> {
    this.data = { ...this.data, selectedCourseId: courseId };
    this.persist();
    return this.data;
  }

  getRecord(courseId: string): CourseRecord | null {
    return this.data.records[courseId] ?? null;
  }

  async refreshCourse(courseId: string): Promise<CourseRecord | null> {
    return this.getRecord(courseId);
  }

  async submitRun(run: GhostRun): Promise<SubmitResult> {
    const sanitized = sanitizeGhost(run);
    const previous = this.getRecord(run.courseId);
    const isPersonalBest = !previous || sanitized.timeSec < previous.bestTimeSec;
    const summary: RaceRunSummary = {
      courseId: sanitized.courseId,
      timeSec: sanitized.timeSec,
      splits: sanitized.splits,
      completedAt: new Date().toISOString(),
      playerName: this.playerName,
      source: 'local',
    };
    const recentRuns = [summary, ...(previous?.recentRuns ?? [])].slice(0, MAX_RECENT_RUNS);
    const record = isPersonalBest
      ? recordFromRun(sanitized, recentRuns, 'local', summary.playerName)
      : { ...previous, recentRuns };
    this.entries = {
      ...this.entries,
      [sanitized.courseId]: this.localEntriesForCourse(sanitized.courseId, record),
    };
    this.data = {
      ...this.data,
      selectedCourseId: sanitized.courseId,
      records: { ...this.data.records, [sanitized.courseId]: record },
    };
    this.persist();
    return { save: this.data, record, isPersonalBest };
  }

  protected setRecord(record: CourseRecord): void {
    this.data = {
      ...this.data,
      selectedCourseId: record.courseId,
      records: { ...this.data.records, [record.courseId]: record },
    };
    this.persist();
  }

  getPlayerName(): string {
    return this.playerName;
  }

  async setPlayerName(name: string): Promise<void> {
    this.playerName = sanitizePlayerName(name);
    safeLocalStorageSet(PLAYER_KEY, this.playerName);
  }

  getCourseEntries(courseId: string): readonly RaceLeaderboardEntry[] {
    return this.entries[courseId] ?? this.localEntriesForCourse(courseId, this.getRecord(courseId));
  }

  isRemoteEnabled(): boolean {
    return false;
  }

  getLastRemoteError(): string | null {
    return null;
  }

  protected persist(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[racing] failed to persist leaderboard save', err);
    }
  }

  private localEntriesForCourse(courseId: string, record: CourseRecord | null): RaceLeaderboardEntry[] {
    if (!record) return [];
    return [{
      rank: 1,
      courseId,
      timeSec: record.bestTimeSec,
      splits: record.bestSplits,
      completedAt: record.recentRuns[0]?.completedAt ?? new Date().toISOString(),
      playerName: record.playerName ?? this.playerName,
      source: record.source ?? 'local',
    }];
  }
}

export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
  readonly playerName: string;
}

export class SupabaseLeaderboardProvider extends LocalLeaderboardProvider {
  private config: SupabaseConfig;
  private lastRemoteError: string | null = null;

  constructor(config: SupabaseConfig) {
    super();
    this.config = config;
    this.playerName = config.playerName;
  }

  override async load(): Promise<RacingSaveData> {
    const save = await super.load();
    await this.refreshCourse(save.selectedCourseId);
    return this.data;
  }

  override async setSelectedCourse(courseId: string): Promise<RacingSaveData> {
    await super.setSelectedCourse(courseId);
    await this.refreshCourse(courseId);
    return this.data;
  }

  override async refreshCourse(courseId: string): Promise<CourseRecord | null> {
    try {
      const [rows, topRun] = await Promise.all([
        this.fetchLeaderboard(courseId, REMOTE_LEADERBOARD_LIMIT),
        this.fetchTopRun(courseId),
      ]);
      this.lastRemoteError = null;
      this.entries = { ...this.entries, [courseId]: rows.map(rowToEntry) };
      const row = topRun ?? null;
      if (!row) return this.getRecord(courseId);
      const existing = this.getRecord(courseId);
      const record = recordFromRun(row.ghost, existing?.recentRuns ?? [], 'supabase', row.player_name);
      this.setRecord(record);
      return record;
    } catch (err) {
      this.lastRemoteError = errorMessage(err);
      console.warn('[racing] remote leaderboard fetch failed', err);
      return this.getRecord(courseId);
    }
  }

  override async submitRun(run: GhostRun): Promise<SubmitResult> {
    const localResult = await super.submitRun(run);
    const sanitized = sanitizeGhost(run);
    let remoteError: string | undefined;
    let isGlobalBest = false;

    try {
      await this.insertRun(sanitized);
      const [rows, topRun] = await Promise.all([
        this.fetchLeaderboard(sanitized.courseId, REMOTE_LEADERBOARD_LIMIT),
        this.fetchTopRun(sanitized.courseId),
      ]);
      this.lastRemoteError = null;
      this.entries = { ...this.entries, [sanitized.courseId]: rows.map(rowToEntry) };
      const row = topRun ?? null;
      if (row) {
        const existing = this.getRecord(sanitized.courseId);
        const record = recordFromRun(row.ghost, existing?.recentRuns ?? [], 'supabase', row.player_name);
        this.setRecord(record);
        isGlobalBest = Math.abs(row.time_sec - sanitized.timeSec) < 0.0005 && row.player_name === this.config.playerName;
        return {
          save: this.data,
          record,
          isPersonalBest: localResult.isPersonalBest,
          isGlobalBest,
        };
      }
    } catch (err) {
      remoteError = errorMessage(err);
      this.lastRemoteError = remoteError;
      console.warn('[racing] remote leaderboard submit failed', err);
    }

    return remoteError ? { ...localResult, remoteError } : localResult;
  }

  override async setPlayerName(name: string): Promise<void> {
    await super.setPlayerName(name);
    this.config = { ...this.config, playerName: this.playerName };
  }

  override isRemoteEnabled(): boolean {
    return true;
  }

  override getLastRemoteError(): string | null {
    return this.lastRemoteError;
  }

  private async fetchLeaderboard(courseId: string, limit: number): Promise<SupabaseRaceRow[]> {
    const url = new URL(`${this.config.url}/rest/v1/race_leaderboard`);
    url.searchParams.set('course_id', `eq.${courseId}`);
    url.searchParams.set('select', 'id,course_id,player_name,time_sec,splits,created_at');
    url.searchParams.set('order', 'time_sec.asc,created_at.asc');
    url.searchParams.set('limit', String(limit));
    return this.request<SupabaseRaceRow[]>(url.toString(), { method: 'GET' });
  }

  private async fetchTopRun(courseId: string): Promise<SupabaseRaceGhostRow | null> {
    const url = new URL(`${this.config.url}/rest/v1/race_leaderboard`);
    url.searchParams.set('course_id', `eq.${courseId}`);
    url.searchParams.set('select', 'id,course_id,player_name,time_sec,splits,ghost,created_at');
    url.searchParams.set('order', 'time_sec.asc,created_at.asc');
    url.searchParams.set('limit', '1');
    const rows = await this.request<SupabaseRaceGhostRow[]>(url.toString(), { method: 'GET' });
    return rows[0] ?? null;
  }

  private async insertRun(run: GhostRun): Promise<void> {
    const row: SupabaseRaceGhostRow = {
      course_id: run.courseId,
      player_name: this.config.playerName,
      time_sec: run.timeSec,
      splits: run.splits,
      ghost: run,
    };
    await this.request<unknown>(`${this.config.url}/rest/v1/race_leaderboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        apikey: this.config.publishableKey,
        Authorization: `Bearer ${this.config.publishableKey}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase ${response.status}: ${text}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text.trim()) return undefined as T;
    return JSON.parse(text) as T;
  }
}

export function createLeaderboardProvider(): LeaderboardProvider {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || ''
  ).trim();
  if (!url || !publishableKey || publishableKey.includes('_or_anon_key_here')) return new LocalLeaderboardProvider();
  return new SupabaseLeaderboardProvider({
    url: url.replace(/\/$/, ''),
    publishableKey,
    playerName: normalizePlayerName(),
  });
}

function rowToEntry(row: SupabaseRaceRow, index: number): RaceLeaderboardEntry {
  return {
    rank: index + 1,
    courseId: row.course_id,
    timeSec: row.time_sec,
    splits: row.splits,
    completedAt: row.created_at ?? '',
    playerName: row.player_name,
    source: 'supabase',
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
