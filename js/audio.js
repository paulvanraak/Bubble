// Fully procedural audio - no external sound files. Web Audio API only.

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0]; // C major pentatonic, two octaves

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientGain = null;
    this.muted = false;
    this.started = false;
    this._ambientTimer = null;
    this._comboLayerGains = [];
  }

  // Must be called from a user gesture (click/tap) per browser autoplay policy.
  ensureStarted() {
    if (this.started) return;
    this.started = true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  _startAmbient() {
    const ctx = this.ctx;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.05;
    this.ambientGain.connect(this.master);

    const notes = [130.81, 164.81, 196.0]; // soft C-major triad, low
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.02;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 3;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      const g = ctx.createGain();
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(this.ambientGain);
      osc.start();
    });
  }

  duckAmbient(amount, seconds) {
    if (!this.ambientGain) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.setTargetAtTime(0.05 * (1 - amount), t, 0.05);
    this.ambientGain.gain.setTargetAtTime(0.05, t + seconds, 0.3);
  }

  // Layered pop: short noise transient + pitched tone blip, pitch/velocity randomized.
  playPop({ pitch = 1, size = 1, comboLevel = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const baseFreq = (420 + Math.random() * 90) * pitch / Math.sqrt(size);

    // Noise transient (the "pop" click)
    const noiseBuf = this._noiseBuffer(0.04);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800 * pitch;
    noiseFilter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(t);
    noise.stop(t + 0.05);

    // Tonal blip (the "body" of the pop)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, t + 0.09);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.exponentialRampToValueAtTime(0.35 * Math.min(1.6, size), t + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14 + size * 0.02);
    osc.connect(oscGain);
    oscGain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2 + size * 0.02);

    if (comboLevel > 0) this._playComboPercussion(comboLevel);
    this.duckAmbient(0.4, 0.15);
  }

  _playComboPercussion(level) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const layers = Math.min(4, level);
    for (let i = 0; i < layers; i++) {
      const noise = ctx.createBufferSource();
      noise.buffer = this._noiseBuffer(0.02);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 4000 + i * 1500;
      const g = ctx.createGain();
      const delay = i * 0.015;
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.04);
      noise.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      noise.start(t + delay);
      noise.stop(t + delay + 0.05);
    }
  }

  playDud() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.45);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 22;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 15;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(t);
    vibrato.stop(t + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.45);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  playMusicalNote(scaleIndex) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const freq = PENTATONIC[scaleIndex % PENTATONIC.length];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const g2 = ctx.createGain();
    g2.gain.value = 0.08;
    osc.connect(g);
    osc2.connect(g2);
    g2.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.6);
    osc2.stop(t + 0.6);
  }

  playAchievement() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [0, 4, 7, 12].forEach((semi, i) => {
      const freq = 440 * Math.pow(2, semi / 12);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = t + i * 0.06;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  // Sparkly ascending arpeggio for discovering a new special bubble type.
  playSpecialCollected() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [0, 3, 7, 10, 14].forEach((semi, i) => {
      const freq = 523.25 * Math.pow(2, semi / 12);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = t + i * 0.045;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }

  // A quick descending-then-rising synth riff to kick off disco mode.
  playDisco() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [0, -2, 3, 7, 12, 7, 3, 7];
    notes.forEach((semi, i) => {
      const freq = 349.23 * Math.pow(2, semi / 12);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const g = ctx.createGain();
      const start = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  }

  _noiseBuffer(duration) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }
}
