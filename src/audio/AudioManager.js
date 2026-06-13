import { CONFIG } from '../config/gameConfig.js';

// Fully procedural audio via Web Audio API — zero asset files. Ambient drone,
// proximity heartbeat, footsteps, and one-shot stingers are all synthesised.
export class AudioManager {
  constructor(bus) {
    this.bus = bus;
    this.ctx = null;
    this.ready = false;
    this.danger = 0;       // 0..1, set by Game from Granny proximity/state
    this._beatT = 0;
    this._ambientNodes = null;

    this.bus.on('sfx', (e) => this.play(e.name, e));
    this.bus.on('granny:spotted', () => this.sting('spotted'));
    this.bus.on('granny:alert', () => this.play('creak'));
  }

  // Must be called from a user gesture (Start button) to satisfy autoplay rules.
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.masterVolume;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = CONFIG.audio.musicVolume;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = CONFIG.audio.sfxVolume;
    this.sfxGain.connect(this.master);

    this.ready = true;
    this._startAmbient();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  setDanger(d) { this.danger = Math.max(0, Math.min(1, d)); }

  // ---- Ambient bed: two detuned low oscillators through a slow LFO filter ----
  _startAmbient() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0.18; g.connect(this.musicGain);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; filter.connect(g);

    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 41.2;
    o1.connect(filter); o2.connect(filter);

    // Slow filter wobble for unease.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);

    o1.start(); o2.start(); lfo.start();
    this._ambientNodes = { o1, o2, lfo, g, filter };
  }

  // ---- Per-frame: schedule heartbeat based on danger ----
  update(dt) {
    if (!this.ready) return;
    if (this.danger > 0.04) {
      this._beatT -= dt;
      const interval = 0.95 - this.danger * 0.62; // faster when closer
      if (this._beatT <= 0) {
        this._beatT = interval;
        this._heartbeat(0.25 + this.danger * 0.6);
      }
    } else {
      this._beatT = 0;
    }
  }

  _heartbeat(vol) {
    const ctx = this.ctx, t = this.t;
    const thump = (at, v) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, at); o.frequency.exponentialRampToValueAtTime(36, at + 0.14);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      o.connect(g); g.connect(this.sfxGain); o.start(at); o.stop(at + 0.22);
    };
    thump(t, vol); thump(t + 0.22, vol * 0.7);
  }

  // ---- Noise helper ----
  _noiseBurst(dur = 0.12, { type = 'lowpass', freq = 1200, q = 1, vol = 0.4, attack = 0.002 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = this.t;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur);
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, glideTo = null, delay = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = this.t + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---- One-shots ----
  play(name, opts = {}) {
    if (!this.ready) return;
    switch (name) {
      case 'step':
        this._noiseBurst(opts.crouch ? 0.06 : 0.09, { freq: opts.sprint ? 900 : 520, q: 1.2, vol: opts.crouch ? 0.07 : opts.sprint ? 0.22 : 0.14 });
        break;
      case 'bump': this._noiseBurst(0.1, { freq: 220, q: 0.8, vol: 0.22 }); break;
      case 'drawer': this._noiseBurst(0.22, { freq: 700, q: 0.7, vol: 0.3 }); this._tone(180, 0.18, { type: 'sawtooth', vol: 0.12, glideTo: 120 }); break;
      case 'door': this._tone(160, 0.4, { type: 'sawtooth', vol: 0.16, glideTo: 90 }); this._noiseBurst(0.3, { freq: 400, vol: 0.12 }); break;
      case 'doorOpen': this._tone(120, 0.8, { type: 'sawtooth', vol: 0.2, glideTo: 60 }); break;
      case 'unlock': this._tone(880, 0.08, { type: 'square', vol: 0.18 }); this._tone(1320, 0.12, { type: 'square', vol: 0.14, delay: 0.08 }); this._noiseBurst(0.06, { freq: 3000, vol: 0.1 }); break;
      case 'lockedRattle': for (let i = 0; i < 3; i++) this._noiseBurst(0.05, { freq: 1600, q: 2, vol: 0.16 }); this._tone(140, 0.1, { vol: 0.1 }); break;
      case 'pickup': this._tone(660, 0.08, { type: 'triangle', vol: 0.2 }); this._tone(990, 0.1, { type: 'triangle', vol: 0.16, delay: 0.07 }); break;
      case 'creak': this._tone(420, 0.5, { type: 'sawtooth', vol: 0.08, glideTo: 380 }); break;
      default: break;
    }
  }

  // ---- Stingers / sequences ----
  sting(kind) {
    if (!this.ready) return;
    if (kind === 'spotted') {
      // Sharp violent screech.
      this._tone(1200, 0.5, { type: 'sawtooth', vol: 0.3, glideTo: 300 });
      this._noiseBurst(0.5, { type: 'highpass', freq: 2000, vol: 0.25 });
    } else if (kind === 'jumpscare') {
      this._tone(2000, 0.7, { type: 'sawtooth', vol: 0.45, glideTo: 80 });
      this._noiseBurst(0.7, { type: 'bandpass', freq: 1500, q: 0.5, vol: 0.4 });
      this._tone(60, 0.9, { type: 'square', vol: 0.3 });
    } else if (kind === 'win') {
      [392, 523, 659, 784].forEach((f, i) => this._tone(f, 0.5, { type: 'triangle', vol: 0.22, delay: i * 0.16 }));
    } else if (kind === 'lose') {
      [330, 262, 208, 165].forEach((f, i) => this._tone(f, 0.6, { type: 'sawtooth', vol: 0.22, delay: i * 0.22 }));
    } else if (kind === 'newday') {
      this._tone(523, 0.4, { type: 'sine', vol: 0.18 });
      this._tone(659, 0.5, { type: 'sine', vol: 0.16, delay: 0.18 });
    }
  }
}
