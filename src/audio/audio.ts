// Gravity-driven audio bed. Two looping samples cross-mixed by gravity pull
// + clearance signal:
//   - gravity-rumble.mp3: subsonic rumble that rises with overall pull
//   - hull-creak.mp3:     metal-stress sound that rises when close to a rock
//
// Web Audio API: AudioContext starts suspended until a user gesture (browser
// autoplay policy). Call `unlock()` from any click/keydown handler.

export const AUDIO_TUNING = {
  MASTER_VOLUME: 0.85,
  // Rumble: grows with gravity pull magnitude. REF_PULL is the pull value
  // at which rumble approaches full volume. Pulled higher + curve raised
  // above 1 so baseline far-field pull stays silent and only big nearby
  // wells produce audible rumble.
  RUMBLE_VOLUME: 0.42,
  RUMBLE_REF_PULL: 18.0,
  RUMBLE_CURVE: 1.4,
  // Creak: clearance + pull driven. Close rocks provide the stress shape, but
  // weak far-field gravity should not keep the metal loop audible.
  CREAK_VOLUME: 0.34,
  CREAK_NEAR: 30,   // m — full volume at or below this clearance
  CREAK_FAR: 180,   // m — silent at or beyond this clearance
  CREAK_PULL_MIN: 2.0,
  CREAK_PULL_FULL: 8.0,
  // Smoothing time-constant (sec). Bigger = slower fades. Felt-out value;
  // ~0.25s feels physical without being mushy.
  FADE_TAU: 0.22,
  // Pitch shift on creak as pull rises — subtle feel boost. 1.0 = no shift.
  CREAK_PITCH_LOW: 0.93,
  CREAK_PITCH_HIGH: 1.08,
  // Cargo pod hum: rises with cargo fraction. Synthesized.
  CARGO_HUM_VOLUME: 0.22,
  CARGO_HUM_PITCH_LOW: 80,
  CARGO_HUM_PITCH_HIGH: 220,
  // SFX volumes.
  SFX_LASER_VOLUME: 0.1,
  SFX_HIT_VOLUME: 0.12,
  SFX_DESTROY_VOLUME: 0.18,
  SFX_PICKUP_VOLUME: 0.12,
  SFX_DEPOSIT_VOLUME: 0.16,
  SFX_MENU_VOLUME: 0.12,
  SFX_BOOST_VOLUME: 0.12,
  SFX_DUST_VOLUME: 0.09,
  SFX_SLINGSHOT_VOLUME: 0.16,
  THRUST_VOLUME: 0,
  BOOST_LOOP_VOLUME: 0.06,
  MUSIC_VOLUME: 0.35,
};

interface Loop {
  gain: GainNode;
  source: AudioBufferSourceNode;
  currentVolume: number;
  buffer: AudioBuffer;
}

export class GameAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private rumble?: Loop;
  private creak?: Loop;
  private cargoHum?: { gain: GainNode; osc: OscillatorNode; sub: OscillatorNode; subGain: GainNode; current: number } | undefined;
  private boostHum: { gain: GainNode; osc: OscillatorNode; current: number } | undefined;
  private musicDrone: { gain: GainNode; osc: OscillatorNode; current: number; target: number } | undefined;
  private musicLoops: Partial<Record<'menu' | 'race' | 'results', Loop>> = {};
  private uiBuffers: Partial<Record<'move' | 'confirm' | 'back' | 'error', AudioBuffer>> = {};
  private musicState: 'menu' | 'race' | 'results' | 'silent' = 'menu';
  private unlocked = false;
  private starting = false;
  private baseUrl: string;
  // Menu navigation can repeat faster than the move click feels good.
  private lastMenuMoveAt = -Infinity;
  private lastWellWarningAt = -Infinity;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** Start AudioContext + load buffers. Idempotent; safe to call multiple
   *  times. Does NOT start playback — that needs unlock() from a user
   *  gesture per browser autoplay policy. */
  async init(): Promise<void> {
    if (this.ctx) return;
    const Ctx: typeof AudioContext = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) {
      console.warn('[audio] AudioContext unavailable; audio disabled');
      return;
    }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = AUDIO_TUNING.MASTER_VOLUME;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = AUDIO_TUNING.MUSIC_VOLUME;
    this.musicGain.connect(this.master);

    try {
      const [rumbleBuf, creakBuf] = await Promise.all([
        this.loadBuffer('sounds/gravity-rumble.mp3'),
        this.loadBuffer('sounds/hull-creak.mp3'),
      ]);
      this.rumble = this.makeLoop(rumbleBuf);
      this.creak = this.makeLoop(creakBuf);
    } catch (err) {
      console.warn('[audio] failed to load gravity sound buffers', err);
    }

    this.cargoHum = this.makeCargoHum();
    this.boostHum = this.makeBoostHum();
    this.musicDrone = undefined;
    void this.loadMusicLoops();
    void this.loadUiBuffers();
  }

  private makeCargoHum() {
    if (!this.ctx || !this.master) return undefined;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = AUDIO_TUNING.CARGO_HUM_PITCH_LOW;
    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 0.4;
    osc.connect(oscGain).connect(gain);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = AUDIO_TUNING.CARGO_HUM_PITCH_LOW * 0.5;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.6;
    sub.connect(subGain).connect(gain);

    return { gain, osc, sub, subGain, current: 0 };
  }

  /** Resume the AudioContext + start the looping sources. Call from a user
   *  gesture handler (click/keydown). Multiple calls are safe. */
  unlock(): void {
    if (!this.ctx || this.unlocked || this.starting) return;
    this.starting = true;
    void this.ctx.resume().then(() => {
      if (this.rumble) this.rumble.source.start(0);
      if (this.creak) this.creak.source.start(0);
      if (this.cargoHum) {
        try {
          this.cargoHum.osc.start(0);
          this.cargoHum.sub.start(0);
          this.boostHum?.osc.start(0);
          this.musicDrone?.osc.start(0);
          Object.values(this.musicLoops).forEach((loop) => {
            try { loop?.source.start(0); } catch { /* already started */ }
          });
        } catch {
          // already started
        }
      }
      this.unlocked = true;
      this.starting = false;
    }).catch((err) => {
      console.warn('[audio] resume failed', err);
      this.starting = false;
    });
  }

  /** Per render frame. Drives the gain envelopes from gravity signals. */
  update(pull: number, clearance: number, dt: number, cargoFraction = 0): void {
    if (!this.ctx || !this.unlocked) return;

    const rumbleTarget = AUDIO_TUNING.RUMBLE_VOLUME * Math.pow(
      Math.min(1, Math.max(0, pull / AUDIO_TUNING.RUMBLE_REF_PULL)),
      AUDIO_TUNING.RUMBLE_CURVE,
    );

    let creakTarget = 0;
    if (Number.isFinite(clearance) && clearance < AUDIO_TUNING.CREAK_FAR) {
      const nearT = (AUDIO_TUNING.CREAK_FAR - clearance) / (AUDIO_TUNING.CREAK_FAR - AUDIO_TUNING.CREAK_NEAR);
      const pullRange = Math.max(0.0001, AUDIO_TUNING.CREAK_PULL_FULL - AUDIO_TUNING.CREAK_PULL_MIN);
      const pullT = Math.max(0, Math.min(1, (pull - AUDIO_TUNING.CREAK_PULL_MIN) / pullRange));
      const pullGate = pullT * pullT * (3 - 2 * pullT);
      creakTarget = AUDIO_TUNING.CREAK_VOLUME * Math.min(1, Math.max(0, nearT)) * pullGate;
    }

    const k = 1 - Math.exp(-dt / AUDIO_TUNING.FADE_TAU);
    if (this.rumble) {
      this.rumble.currentVolume += (rumbleTarget - this.rumble.currentVolume) * k;
      this.rumble.gain.gain.value = this.rumble.currentVolume;
    }
    if (this.creak) {
      this.creak.currentVolume += (creakTarget - this.creak.currentVolume) * k;
      this.creak.gain.gain.value = this.creak.currentVolume;
      // Subtle pitch shift on creak with gravity pull. Crossfading happens
      // via gain — pitch is a polish layer.
      const pullN = Math.min(1, Math.max(0, pull / AUDIO_TUNING.RUMBLE_REF_PULL));
      const rate = AUDIO_TUNING.CREAK_PITCH_LOW + (AUDIO_TUNING.CREAK_PITCH_HIGH - AUDIO_TUNING.CREAK_PITCH_LOW) * pullN;
      this.creak.source.playbackRate.value = rate;
    }
    if (this.cargoHum) {
      const cargoT = Math.max(0, Math.min(1, cargoFraction));
      const targetVol = AUDIO_TUNING.CARGO_HUM_VOLUME * cargoT * cargoT;
      this.cargoHum.current += (targetVol - this.cargoHum.current) * k;
      this.cargoHum.gain.gain.value = this.cargoHum.current;
      const pitch = AUDIO_TUNING.CARGO_HUM_PITCH_LOW
        + (AUDIO_TUNING.CARGO_HUM_PITCH_HIGH - AUDIO_TUNING.CARGO_HUM_PITCH_LOW) * cargoT;
      this.cargoHum.osc.frequency.setTargetAtTime(pitch, this.ctx!.currentTime, 0.05);
      this.cargoHum.sub.frequency.setTargetAtTime(pitch * 0.5, this.ctx!.currentTime, 0.05);
    }
    this.updateMusic(dt);
  }

  updateFlight(thrustDemand: number, boost: number, dt: number): void {
    if (!this.ctx || !this.unlocked) return;
    const k = 1 - Math.exp(-dt / 0.12);
    if (this.boostHum) {
      const target = AUDIO_TUNING.BOOST_LOOP_VOLUME * Math.max(0, Math.min(1, boost * thrustDemand));
      this.boostHum.current += (target - this.boostHum.current) * k;
      this.boostHum.gain.gain.value = this.boostHum.current;
      this.boostHum.osc.frequency.setTargetAtTime(150 + boost * 110, this.ctx.currentTime, 0.04);
    }
  }

  silence(): void {
    if (this.rumble) {
      this.rumble.currentVolume = 0;
      this.rumble.gain.gain.value = 0;
    }
    if (this.creak) {
      this.creak.currentVolume = 0;
      this.creak.gain.gain.value = 0;
    }
    if (this.cargoHum) {
      this.cargoHum.current = 0;
      this.cargoHum.gain.gain.value = 0;
    }
    if (this.boostHum) {
      this.boostHum.current = 0;
      this.boostHum.gain.gain.value = 0;
    }
  }

  // ----- One-shot SFX synthesizers. Chosen to be cheap, distinct, and
  // tonally consistent with the existing rumble/creak palette.

  laser(): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(AUDIO_TUNING.SFX_LASER_VOLUME, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.22);
  }

  hit(): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(AUDIO_TUNING.SFX_HIT_VOLUME, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.2);
  }

  destroy(): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 1.6);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.7);
    const g = ctx.createGain();
    g.gain.value = AUDIO_TUNING.SFX_DESTROY_VOLUME;
    src.connect(lp).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.85);
  }

  pickupChime(): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const tones = [880, 1320];
    tones.forEach((f, idx) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + idx * 0.04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + idx * 0.04);
      g.gain.exponentialRampToValueAtTime(AUDIO_TUNING.SFX_PICKUP_VOLUME, t + idx * 0.04 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.04 + 0.2);
      o.connect(g).connect(this.sfxGain!);
      o.start(t + idx * 0.04);
      o.stop(t + idx * 0.04 + 0.22);
    });
  }

  deposit(): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(AUDIO_TUNING.SFX_DEPOSIT_VOLUME, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.62);
  }

  menuMove(): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const now = this.ctx.currentTime;
    if (now - this.lastMenuMoveAt < 0.18) return;
    this.lastMenuMoveAt = now;
    this.playUi('move', 0.32) || this.blip(180, 230, 0.045, AUDIO_TUNING.SFX_MENU_VOLUME * 0.28, 'sine');
  }
  menuConfirm(): void { this.playUi('confirm', 0.38) || this.blip(210, 300, 0.075, AUDIO_TUNING.SFX_MENU_VOLUME * 0.38, 'sine'); }
  menuBack(): void { this.playUi('back', 0.34) || this.blip(200, 135, 0.09, AUDIO_TUNING.SFX_MENU_VOLUME * 0.34, 'sine'); }
  pauseTone(): void { this.playUi('back', 0.24) || this.blip(155, 120, 0.1, AUDIO_TUNING.SFX_MENU_VOLUME * 0.25, 'sine'); }
  resumeTone(): void { this.playUi('move', 0.25) || this.blip(130, 190, 0.09, AUDIO_TUNING.SFX_MENU_VOLUME * 0.25, 'sine'); }
  raceStart(): void { this.blip(120, 260, 0.18, AUDIO_TUNING.SFX_BOOST_VOLUME * 0.45, 'sine'); }
  countdownTick(): void { this.blip(170, 135, 0.08, AUDIO_TUNING.SFX_MENU_VOLUME * 0.22, 'square'); }
  goSignal(): void { this.blip(120, 340, 0.22, AUDIO_TUNING.SFX_BOOST_VOLUME * 0.62, 'sawtooth'); }
  gatePass(goodSplit = true): void {
    if (goodSplit) {
      this.playUi('confirm', 0.28) || this.blip(260, 430, 0.1, AUDIO_TUNING.SFX_MENU_VOLUME * 0.28, 'sine');
    } else {
      this.blip(220, 175, 0.1, AUDIO_TUNING.SFX_MENU_VOLUME * 0.22, 'sine');
    }
  }
  finishTone(): void { this.playUi('confirm', 0.45) || this.blip(220, 360, 0.18, AUDIO_TUNING.SFX_MENU_VOLUME * 0.45, 'sine'); }
  personalBestTone(): void {
    this.finishTone();
    this.blip(300, 520, 0.2, AUDIO_TUNING.SFX_MENU_VOLUME * 0.34, 'sine');
  }
  invalidTone(): void { this.playUi('error', 0.3) || this.blip(130, 85, 0.16, AUDIO_TUNING.SFX_HIT_VOLUME * 0.35, 'sine'); }
  boostKick(): void { this.blip(80, 140, 0.13, AUDIO_TUNING.SFX_BOOST_VOLUME * 0.35, 'sine'); }
  slingshotWhoosh(intensity: number): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const level = Math.max(0.25, Math.min(1, intensity));
    const duration = 0.42;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const phase = i / data.length;
      const envelope = Math.sin(Math.PI * phase) * (1 - phase * 0.35);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(320, t);
    band.frequency.exponentialRampToValueAtTime(1650, t + duration);
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = AUDIO_TUNING.SFX_SLINGSHOT_VOLUME * level;
    source.connect(band).connect(gain).connect(this.sfxGain);
    source.start(t);
    source.stop(t + duration);
    this.blip(105, 280, 0.2, AUDIO_TUNING.SFX_SLINGSHOT_VOLUME * 0.28 * level, 'sine');
  }
  wreckTone(): void {
    this.invalidTone();
    this.dustImpact(1.2);
  }

  closeWellWarning(intensity: number): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWellWarningAt < 1.25) return;
    this.lastWellWarningAt = now;
    const level = Math.max(0.25, Math.min(1, intensity));
    this.blip(92 + level * 36, 72, 0.18, AUDIO_TUNING.SFX_HIT_VOLUME * 0.22 * level, 'square');
  }

  dustImpact(intensity = 1): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const duration = 0.16;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 2.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 520;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.value = AUDIO_TUNING.SFX_DUST_VOLUME * Math.max(0.15, Math.min(0.7, intensity));
    src.connect(hp).connect(lp).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + duration);
  }

  setMusicState(state: 'menu' | 'race' | 'results' | 'silent'): void {
    this.musicState = state;
  }

  setMasterVolume(v: number): void {
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  setSfxVolume(v: number): void {
    if (!this.sfxGain) return;
    this.sfxGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setMusicVolume(v: number): void {
    AUDIO_TUNING.MUSIC_VOLUME = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = AUDIO_TUNING.MUSIC_VOLUME;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  private async loadBuffer(relPath: string): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error('audio context not ready');
    const url = this.baseUrl + relPath;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const data = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(data);
  }

  private async loadBufferOptional(relPath: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const url = this.baseUrl + relPath;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }

  private async loadMusicLoops(): Promise<void> {
    if (!this.ctx) return;
    const [menu, race, results] = await Promise.all([
      this.loadBufferOptional('music/menu.mp3'),
      this.loadBufferOptional('music/race.mp3'),
      this.loadBufferOptional('music/results.mp3'),
    ]);
    if (menu) this.musicLoops.menu = this.makeMusicLoop(menu);
    if (race) this.musicLoops.race = this.makeMusicLoop(race);
    if (results) this.musicLoops.results = this.makeMusicLoop(results);
    if (this.unlocked) {
      Object.values(this.musicLoops).forEach((loop) => {
        try { loop?.source.start(0); } catch { /* already started */ }
      });
    }
  }

  private async loadUiBuffers(): Promise<void> {
    const [move, confirm, back, error] = await Promise.all([
      this.loadBufferOptional('sounds/ui/move.ogg'),
      this.loadBufferOptional('sounds/ui/confirm.ogg'),
      this.loadBufferOptional('sounds/ui/back.ogg'),
      this.loadBufferOptional('sounds/ui/error.ogg'),
    ]);
    this.uiBuffers = {
      ...(move ? { move } : {}),
      ...(confirm ? { confirm } : {}),
      ...(back ? { back } : {}),
      ...(error ? { error } : {}),
    };
  }

  private makeLoop(buffer: AudioBuffer): Loop {
    if (!this.ctx || !this.master) throw new Error('audio context not ready');
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.master);
    return { source, gain, currentVolume: 0, buffer };
  }

  private makeMusicLoop(buffer: AudioBuffer): Loop {
    if (!this.ctx || !this.musicGain) throw new Error('audio context not ready');
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.musicGain);
    return { source, gain, currentVolume: 0, buffer };
  }

  private playUi(key: 'move' | 'confirm' | 'back' | 'error', volume: number): boolean {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return false;
    const buffer = this.uiBuffers[key];
    if (!buffer) return false;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    const gain = this.ctx.createGain();
    gain.gain.value = AUDIO_TUNING.SFX_MENU_VOLUME * volume;
    src.connect(lp).connect(gain).connect(this.sfxGain);
    src.start(t);
    src.stop(t + Math.min(buffer.duration, 0.7));
    return true;
  }

  private makeBoostHum() {
    if (!this.ctx || !this.sfxGain) return undefined;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.sfxGain);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    osc.connect(lp).connect(gain);
    return { gain, osc, current: 0 };
  }

  private updateMusic(dt: number): void {
    if (!this.ctx || !this.unlocked) return;
    const k = 1 - Math.exp(-dt / 0.9);
    for (const [state, loop] of Object.entries(this.musicLoops) as Array<['menu' | 'race' | 'results', Loop | undefined]>) {
      if (!loop) continue;
      const target = this.musicState === state ? 0.85 : 0;
      loop.currentVolume += (target - loop.currentVolume) * k;
      loop.gain.gain.value = loop.currentVolume;
    }
    if (this.musicDrone) {
      const hasLoop = this.musicState !== 'silent' && !!this.musicLoops[this.musicState];
      const target = this.musicState === 'silent' || hasLoop ? 0 : 0;
      this.musicDrone.current += (target - this.musicDrone.current) * k;
      this.musicDrone.gain.gain.value = this.musicDrone.current;
      const pitch = this.musicState === 'race' ? 56 : this.musicState === 'results' ? 64 : 42;
      this.musicDrone.osc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.2);
    }
  }

  private blip(startHz: number, endHz: number, duration: number, volume: number, type: OscillatorType): void {
    if (!this.ctx || !this.sfxGain || !this.unlocked) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(startHz, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(lp).connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
}
