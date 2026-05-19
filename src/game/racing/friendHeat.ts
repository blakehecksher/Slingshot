import type { GhostRun } from './leaderboard';

const POLL_LOBBY_MS = 3000;
const POLL_HEAT_MS = 6000;
const INVITE_CODE_LENGTH = 6;
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type FriendLobbyStatus = 'lobby' | 'active' | 'closed';

export interface FriendLobby {
  readonly id: string;
  readonly inviteCode: string;
  readonly courseId: string;
  readonly hostName: string;
  readonly heatDurationSec: number;
  readonly status: FriendLobbyStatus;
  readonly heatStartsAt: string | null;
  readonly heatEndsAt: string | null;
}

export interface FriendParticipant {
  readonly playerName: string;
  readonly ready: boolean;
  readonly joinedAt: string;
}

export interface FriendRun {
  readonly id: string;
  readonly playerName: string;
  readonly courseId: string;
  readonly timeSec: number;
  readonly splits: number[];
  readonly finishedAt: string;
}

export interface FriendHeatSnapshot {
  readonly lobby: FriendLobby;
  readonly participants: FriendParticipant[];
  readonly runs: FriendRun[];
  readonly lobbyBest: FriendRun | null;
  readonly lobbyBestGhost: GhostRun | null;
  readonly fetchedAtMs: number;
}

export interface FriendHeatConfig {
  readonly url: string;
  readonly publishableKey: string;
  readonly playerName: string;
}

export type FriendHeatListener = (snapshot: FriendHeatSnapshot | null) => void;

interface LobbyRow {
  id: string;
  invite_code: string;
  course_id: string;
  host_name: string;
  heat_duration_sec: number;
  status: FriendLobbyStatus;
  heat_starts_at: string | null;
  heat_ends_at: string | null;
}

interface ParticipantRow {
  player_name: string;
  ready: boolean;
  joined_at: string;
}

interface RunRow {
  id: string;
  player_name: string;
  course_id: string;
  time_sec: number;
  splits: number[];
  finished_at: string;
}

interface RunGhostRow extends RunRow {
  ghost: GhostRun;
}

export class FriendHeatClient {
  private config: FriendHeatConfig;
  private snapshot: FriendHeatSnapshot | null = null;
  private listeners = new Set<FriendHeatListener>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private lastError: string | null = null;

  constructor(config: FriendHeatConfig) {
    this.config = config;
  }

  get current(): FriendHeatSnapshot | null { return this.snapshot; }
  get error(): string | null { return this.lastError; }

  setPlayerName(name: string): void {
    this.config = { ...this.config, playerName: name };
  }

  getPlayerName(): string {
    return this.config.playerName;
  }

  subscribe(listener: FriendHeatListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

  async createLobby(courseId: string, heatDurationSec: number): Promise<FriendHeatSnapshot> {
    const code = generateInviteCode();
    const rows = await this.request<LobbyRow[]>(`${this.config.url}/rest/v1/friend_heat_lobbies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        invite_code: code,
        course_id: courseId,
        host_name: this.config.playerName,
        heat_duration_sec: heatDurationSec,
      }),
    });
    const lobby = lobbyFromRow(rows[0]);
    await this.joinParticipant(lobby.id, this.config.playerName);
    await this.refresh(lobby.id);
    this.startPolling(lobby.id);
    return this.snapshot!;
  }

  async joinLobby(inviteCode: string): Promise<FriendHeatSnapshot> {
    const code = inviteCode.trim().toUpperCase();
    if (!code) throw new Error('Invite code required');
    const url = new URL(`${this.config.url}/rest/v1/friend_heat_lobbies`);
    url.searchParams.set('invite_code', `eq.${code}`);
    url.searchParams.set('select', '*');
    url.searchParams.set('limit', '1');
    const rows = await this.request<LobbyRow[]>(url.toString(), { method: 'GET' });
    if (!rows[0]) throw new Error(`No lobby for code ${code}`);
    const lobby = lobbyFromRow(rows[0]);
    if (lobby.status === 'closed') throw new Error('Lobby closed');
    await this.joinParticipant(lobby.id, this.config.playerName);
    await this.refresh(lobby.id);
    this.startPolling(lobby.id);
    return this.snapshot!;
  }

  async leaveLobby(): Promise<void> {
    const snap = this.snapshot;
    this.stopPolling();
    this.snapshot = null;
    this.emit();
    if (!snap) return;
    const url = new URL(`${this.config.url}/rest/v1/friend_heat_participants`);
    url.searchParams.set('lobby_id', `eq.${snap.lobby.id}`);
    url.searchParams.set('player_name', `eq.${this.config.playerName}`);
    try {
      await this.request<unknown>(url.toString(), { method: 'DELETE' });
    } catch (err) {
      console.warn('[friend-heat] leave failed', err);
    }
  }

  async setReady(ready: boolean): Promise<void> {
    const snap = this.snapshot;
    if (!snap) return;
    const url = new URL(`${this.config.url}/rest/v1/friend_heat_participants`);
    url.searchParams.set('lobby_id', `eq.${snap.lobby.id}`);
    url.searchParams.set('player_name', `eq.${this.config.playerName}`);
    await this.request<unknown>(url.toString(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ready }),
    });
    await this.refresh(snap.lobby.id);
  }

  async startHeat(): Promise<void> {
    const snap = this.snapshot;
    if (!snap) return;
    const now = new Date();
    const ends = new Date(now.getTime() + snap.lobby.heatDurationSec * 1000);
    const url = new URL(`${this.config.url}/rest/v1/friend_heat_lobbies`);
    url.searchParams.set('id', `eq.${snap.lobby.id}`);
    await this.request<unknown>(url.toString(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'active',
        heat_starts_at: now.toISOString(),
        heat_ends_at: ends.toISOString(),
      }),
    });
    await this.refresh(snap.lobby.id);
  }

  async closeHeat(): Promise<void> {
    const snap = this.snapshot;
    if (!snap) return;
    const url = new URL(`${this.config.url}/rest/v1/friend_heat_lobbies`);
    url.searchParams.set('id', `eq.${snap.lobby.id}`);
    await this.request<unknown>(url.toString(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'closed' }),
    });
    await this.refresh(snap.lobby.id);
  }

  async submitRun(run: GhostRun): Promise<void> {
    const snap = this.snapshot;
    if (!snap) return;
    const row = {
      lobby_id: snap.lobby.id,
      course_id: run.courseId,
      player_name: this.config.playerName,
      time_sec: run.timeSec,
      splits: run.splits,
      ghost: run,
    };
    await this.request<unknown>(`${this.config.url}/rest/v1/friend_heat_runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    await this.refresh(snap.lobby.id);
  }

  async refresh(lobbyId?: string): Promise<void> {
    if (this.inFlight) return;
    const id = lobbyId ?? this.snapshot?.lobby.id;
    if (!id) return;
    this.inFlight = true;
    try {
      const [lobbyRows, participantRows, runRows, bestRows] = await Promise.all([
        this.request<LobbyRow[]>(`${this.config.url}/rest/v1/friend_heat_lobbies?id=eq.${id}&select=*&limit=1`, { method: 'GET' }),
        this.request<ParticipantRow[]>(`${this.config.url}/rest/v1/friend_heat_participants?lobby_id=eq.${id}&select=player_name,ready,joined_at&order=joined_at.asc`, { method: 'GET' }),
        this.request<RunRow[]>(`${this.config.url}/rest/v1/friend_heat_runs?lobby_id=eq.${id}&select=id,player_name,course_id,time_sec,splits,finished_at&order=time_sec.asc,finished_at.asc&limit=10`, { method: 'GET' }),
        this.request<RunGhostRow[]>(`${this.config.url}/rest/v1/friend_heat_runs?lobby_id=eq.${id}&select=id,player_name,course_id,time_sec,splits,ghost,finished_at&order=time_sec.asc,finished_at.asc&limit=1`, { method: 'GET' }),
      ]);
      const row = lobbyRows[0];
      if (!row) {
        this.snapshot = null;
        this.lastError = 'Lobby no longer exists';
        this.emit();
        return;
      }
      const lobby = lobbyFromRow(row);
      const best = bestRows[0] ?? null;
      this.snapshot = {
        lobby,
        participants: participantRows.map(participantFromRow),
        runs: runRows.map(runFromRow),
        lobbyBest: best ? runFromRow(best) : null,
        lobbyBestGhost: best?.ghost ?? null,
        fetchedAtMs: Date.now(),
      };
      this.lastError = null;
      this.emit();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.warn('[friend-heat] refresh failed', err);
    } finally {
      this.inFlight = false;
    }
  }

  remainingSec(): number {
    const snap = this.snapshot;
    if (!snap) return 0;
    if (snap.lobby.status === 'lobby') return snap.lobby.heatDurationSec;
    if (snap.lobby.status === 'closed') return 0;
    if (!snap.lobby.heatEndsAt) return snap.lobby.heatDurationSec;
    const endMs = Date.parse(snap.lobby.heatEndsAt);
    return Math.max(0, (endMs - Date.now()) / 1000);
  }

  canStartAttempt(): boolean {
    const snap = this.snapshot;
    if (!snap) return false;
    if (snap.lobby.status !== 'active') return false;
    return this.remainingSec() > 0;
  }

  isHost(): boolean {
    const snap = this.snapshot;
    return !!snap && snap.lobby.hostName === this.config.playerName;
  }

  private emit(): void {
    this.listeners.forEach((l) => l(this.snapshot));
  }

  private startPolling(lobbyId: string): void {
    this.stopPolling();
    const tick = (): void => {
      void this.refresh(lobbyId).finally(() => {
        if (!this.snapshot) return;
        const inHeat = this.snapshot.lobby.status === 'active';
        const delay = inHeat ? POLL_HEAT_MS : POLL_LOBBY_MS;
        this.pollTimer = setTimeout(tick, delay);
      });
    };
    this.pollTimer = setTimeout(tick, POLL_LOBBY_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async joinParticipant(lobbyId: string, playerName: string): Promise<void> {
    await this.request<unknown>(`${this.config.url}/rest/v1/friend_heat_participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify({ lobby_id: lobbyId, player_name: playerName, ready: false }),
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

function lobbyFromRow(row: LobbyRow): FriendLobby {
  return {
    id: row.id,
    inviteCode: row.invite_code,
    courseId: row.course_id,
    hostName: row.host_name,
    heatDurationSec: row.heat_duration_sec,
    status: row.status,
    heatStartsAt: row.heat_starts_at,
    heatEndsAt: row.heat_ends_at,
  };
}

function participantFromRow(row: ParticipantRow): FriendParticipant {
  return {
    playerName: row.player_name,
    ready: row.ready,
    joinedAt: row.joined_at,
  };
}

function runFromRow(row: RunRow): FriendRun {
  return {
    id: row.id,
    playerName: row.player_name,
    courseId: row.course_id,
    timeSec: row.time_sec,
    splits: row.splits,
    finishedAt: row.finished_at,
  };
}

function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return out;
}

export function createFriendHeatClient(playerName: string): FriendHeatClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || ''
  ).trim();
  if (!url || !publishableKey || publishableKey.includes('_or_anon_key_here')) return null;
  return new FriendHeatClient({
    url: url.replace(/\/$/, ''),
    publishableKey,
    playerName,
  });
}

export function formatHeatRemaining(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
