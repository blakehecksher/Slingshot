// Gravity-driven audio bed. Two looping samples cross-mixed by gravity pull
// + clearance signal:
//   - gravity-rumble.mp3: subsonic rumble that rises with overall pull
//   - hull-creak.mp3:     metal-stress sound that rises when close to a rock
//
// Web Audio API: AudioContext starts suspended until a user gesture (browser
// autoplay policy). Call `unlock()` from any click/keydown handler.

export const AUDIO_TUNING = {
  MASTER_VOLUME: 0.85,
  // Rumble: grows with gravity pull magnitude. Tune REF_PULL for the pull
  // value at which rumble approaches full volume. Curve raised to <1 power
  // so quiet wells already make sound — gives the loop more presence.
  RUMBLE_VOLUME: 0.9,
  RUMBLE_REF_PULL: 3.0,
  RUMBLE_CURVE: 0.7,
  // Creak: clearance-driven. Below CREAK_NEAR clearance, creak ramps in;
  // at CREAK_FAR (or further) silent. Inverted lerp.
  CREAK_VOLUME: 0.85,
  CREAK_NEAR: 30,   // m — full volume at or below this clearance
  CREAK_FAR: 280,   // m — silent at or beyond this clearance
  // Smoothing time-constant (sec). Bigger = slower fades. Felt-out value;
  // ~0.25s feels physical without being mushy.
  FADE_TAU: 0.22,
  // Pitch shift on creak as pull rises — subtle feel boost. 1.0 = no shift.
  CREAK_PITCH_LOW: 0.93,
  CREAK_PITCH_HIGH: 1.08,
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
  private rumble?: Loop;
  private creak?: Loop;
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
  }

  /** Resume the AudioContext + start the looping sources. Call from a user
   *  gesture handler (click/keydown). Multiple calls are safe. */
  unlock(): void {
    if (!this.ctx || this.unlocked || this.starting) return;
    this.starting = true;
    void this.ctx.resume().then(() => {
      if (this.rumble) this.rumble.source.start(0);
      if (this.creak) this.creak.source.start(0);
      this.unlocked = true;
      this.starting = false;
    }).catch((err) => {
      console.warn('[audio] resume failed', err);
      this.starting = false;
    });
  }

  /** Per render frame. Drives the gain envelopes from gravity signals. */
  update(pull: number, clearance: number, dt: number): void {
    if (!this.ctx || !this.unlocked) return;

    const rumbleTarget = AUDIO_TUNING.RUMBLE_VOLUME * Math.pow(
      Math.min(1, Math.max(0, pull / AUDIO_TUNING.RUMBLE_REF_PULL)),
      AUDIO_TUNING.RUMBLE_CURVE,
    );

    let creakTarget = 0;
    if (Number.isFinite(clearance) && clearance < AUDIO_TUNING.CREAK_FAR) {
      const t = (AUDIO_TUNING.CREAK_FAR - clearance) / (AUDIO_TUNING.CREAK_FAR - AUDIO_TUNING.CREAK_NEAR);
      creakTarget = AUDIO_TUNING.CREAK_VOLUME * Math.min(1, Math.max(0, t));
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
