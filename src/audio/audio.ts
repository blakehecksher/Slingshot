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
  RUMBLE_VOLUME: 0.9,
  RUMBLE_REF_PULL: 18.0,
  RUMBLE_CURVE: 1.4,
  // Creak: clearance + pull driven. Close rocks provide the stress shape, but
  // weak far-field gravity should not keep the metal loop audible.
  CREAK_VOLUME: 0.85,
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
  SFX_LASER_VOLUME: 0.22,
  SFX_HIT_VOLUME: 0.4,
  SFX_DESTROY_VOLUME: 0.55,
  SFX_PICKUP_VOLUME: 0.32,
  SFX_DEPOSIT_VOLUME: 0.45,
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
  private rumble?: Loop;
  private creak?: Loop;
  private cargoHum?: { gain: GainNode; osc: OscillatorNode; sub: OscillatorNode; subGain: GainNode; current: number } | undefined;
  private unlocked = false;
  private starting = false;
  private baseUrl: string;

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

    try {
      const [rumbleBuf, creakBuf] = await Promise.all([
        this.loadBuffer('sounds/gravity-rumble.mp3'),
        this.loadBuffer('sounds/hull-creak.mp3'),
      ]);
      this.rumble = this.makeLoop(rumbleBuf);
      this.creak = this.makeLoop(creakBuf);
    } catch (err) {
      console.warn('[audio] failed to load sound buffers', err);
    }

    this.cargoHum = this.makeCargoHum();
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

  setMasterVolume(v: number): void {
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, v));
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
}
