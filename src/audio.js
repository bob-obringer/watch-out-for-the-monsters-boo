// All sound is synthesized live with Web Audio — no audio files.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.danger = 0; // 0..1, makes the music creepier during waves
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const rv = ctx.createGain(); rv.gain.value = 0.55;
    this.reverb.connect(rv).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.startAmbience();
    this.musicBox();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
    if (m) window.speechSynthesis?.cancel();
  }

  impulse(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }
  makeNoise(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  out(node, wet = 0.3) {
    node.connect(this.master);
    if (wet > 0) {
      const g = this.ctx.createGain(); g.gain.value = wet;
      node.connect(g).connect(this.reverb);
    }
  }
  osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
  env(peak, t, a, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  noise(t, dur) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.start(t, Math.random()); s.stop(t + dur);
    return s;
  }

  startAmbience() {
    const ctx = this.ctx, t = ctx.currentTime;
    // low drone
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 3;
    const lfo = this.osc('sine', 0.06), lfoG = ctx.createGain(); lfoG.gain.value = 110;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    const dg = ctx.createGain(); dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.07, t + 4);
    for (const f of [55, 55.35, 82.6]) { const o = this.osc(f > 80 ? 'triangle' : 'sawtooth', f); o.connect(lp); o.start(); }
    lp.connect(dg); this.out(dg, 0.4);
    this.droneGain = dg;
    // wind
    const ws = ctx.createBufferSource(); ws.buffer = this.noiseBuf; ws.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 1.2;
    const wl = this.osc('sine', 0.045), wlg = ctx.createGain(); wlg.gain.value = 320; wl.connect(wlg).connect(bp.frequency); wl.start();
    const wg = ctx.createGain(); wg.gain.value = 0.035;
    const wl2 = this.osc('sine', 0.11), wl2g = ctx.createGain(); wl2g.gain.value = 0.02; wl2.connect(wl2g).connect(wg.gain); wl2.start();
    ws.connect(bp).connect(wg); this.out(wg, 0.5); ws.start();
  }

  // creepy, slightly out-of-tune music box
  musicBox() {
    const scale = [57, 60, 62, 63, 64, 67, 68, 69, 72, 74, 75, 76, 79];
    const tick = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      const n = 1 + (Math.random() < 0.3 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const base = this.danger > 0.5 ? -12 : 0;
        const midi = scale[Math.floor(Math.random() * scale.length)] + base;
        this.bell(440 * Math.pow(2, (midi - 69) / 12) * (1 + (Math.random() - 0.5) * 0.012), t + k * 0.18, 0.045);
      }
      const gap = this.danger > 0.5 ? 300 + Math.random() * 500 : 900 + Math.random() * 1800;
      setTimeout(tick, gap);
    };
    setTimeout(tick, 1500);
  }
  bell(f, t, vol) {
    for (const [mul, v] of [[1, 1], [2.01, 0.35], [3.98, 0.12]]) {
      const o = this.osc(mul === 1 ? 'triangle' : 'sine', f * mul);
      const g = this.env(vol * v, t, 0.005, 1.6 / mul);
      o.connect(g); this.out(g, 0.8);
      o.start(t); o.stop(t + 2);
    }
  }

  setDanger(d) {
    this.danger = d;
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.07 + d * 0.08, this.ctx.currentTime, 1.0);
  }

  /* ---- effects ---- */
  pop() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.osc('sine', 500); o.frequency.exponentialRampToValueAtTime(1300, t + 0.1);
    const g = this.env(0.22, t, 0.005, 0.14); o.connect(g); this.out(g, 0.15); o.start(t); o.stop(t + 0.2);
  }
  collect(n = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const notes = n > 4 ? [1047, 1319, 1568, 2093] : [988, 1319];
    notes.forEach((f, i) => {
      const o = this.osc('triangle', f); const g = this.env(0.13, t + i * 0.06, 0.004, 0.22);
      o.connect(g); this.out(g, 0.35); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.3);
    });
  }
  build() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.osc('sine', 180); o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const g = this.env(0.5, t, 0.005, 0.4); o.connect(g); this.out(g, 0.2); o.start(t); o.stop(t + 0.5);
    const n = this.noise(t, 0.25); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = this.env(0.25, t, 0.003, 0.2); n.connect(lp).connect(ng); this.out(ng, 0.2);
    [523, 659, 784].forEach((f, i) => this.bell(f, t + 0.12 + i * 0.08, 0.06));
  }
  buy() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [392, 523, 659, 784, 1047].forEach((f, i) => {
      const o = this.osc('triangle', f); const g = this.env(0.12, t + i * 0.05, 0.004, 0.25);
      o.connect(g); this.out(g, 0.4); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.35);
    });
  }
  nope() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [0, 0.14].forEach((d) => {
      const o = this.osc('square', 150); const g = this.env(0.06, t + d, 0.005, 0.1);
      const lp = this.ctx.createBiquadFilter(); lp.frequency.value = 800;
      o.connect(lp).connect(g); this.out(g, 0.05); o.start(t + d); o.stop(t + d + 0.15);
    });
  }
  growl(pitch = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', 75 * pitch); o.frequency.exponentialRampToValueAtTime(42 * pitch, t + 1.2);
    const vib = this.osc('sine', 19), vg = this.ctx.createGain(); vg.gain.value = 14 * pitch; vib.connect(vg).connect(o.frequency);
    const ws = this.ctx.createWaveShaper(); const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 4); } ws.curve = curve;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = this.env(0.16, t, 0.15, 1.1);
    o.connect(ws).connect(lp).connect(g); this.out(g, 0.6);
    o.start(t); vib.start(t); o.stop(t + 1.4); vib.stop(t + 1.4);
  }
  munch() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = this.noise(t + i * 0.09, 0.06);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 900; bp.Q.value = 2;
      const g = this.env(0.3, t + i * 0.09, 0.003, 0.06); n.connect(bp).connect(g); this.out(g, 0.1);
    }
  }
  boo() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    // whoosh
    const n = this.noise(t, 0.5);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
    const g = this.env(0.35, t, 0.05, 0.4); n.connect(bp).connect(g); this.out(g, 0.4);
    // spooky "ooo"
    const o = this.osc('sine', 330); o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(260, t + 0.6);
    const vib = this.osc('sine', 6), vg = this.ctx.createGain(); vg.gain.value = 10; vib.connect(vg).connect(o.frequency);
    const og = this.env(0.15, t, 0.06, 0.6); o.connect(og); this.out(og, 0.6);
    o.start(t); vib.start(t); o.stop(t + 0.8); vib.stop(t + 0.8);
  }
  squeal() {
    if (!this.ctx) return; const t = this.ctx.currentTime + 0.12;
    const o = this.osc('square', 500); o.frequency.exponentialRampToValueAtTime(1600, t + 0.15); o.frequency.exponentialRampToValueAtTime(700, t + 0.45);
    const vib = this.osc('sine', 28), vg = this.ctx.createGain(); vg.gain.value = 60; vib.connect(vg).connect(o.frequency);
    const lp = this.ctx.createBiquadFilter(); lp.frequency.value = 2500;
    const g = this.env(0.07, t, 0.01, 0.45); o.connect(lp).connect(g); this.out(g, 0.3);
    o.start(t); vib.start(t); o.stop(t + 0.6); vib.stop(t + 0.6);
  }
  wave() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    for (const [f, v] of [[55, 0.35], [110, 0.25], [164.8, 0.12], [233, 0.08], [311, 0.05]]) {
      const o = this.osc('sine', f); const g = this.env(v, t, 0.02, 4.0); o.connect(g); this.out(g, 0.7); o.start(t); o.stop(t + 4.2);
    }
  }
  claim() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => {
      const o = this.osc('triangle', f); const g = this.env(0.1, t + i * 0.045, 0.003, 0.35);
      o.connect(g); this.out(g, 0.5); o.start(t + i * 0.045); o.stop(t + i * 0.045 + 0.45);
    });
  }

  zap() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = this.noise(t, 0.35);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = this.env(0.4, t, 0.002, 0.3); n.connect(hp).connect(g); this.out(g, 0.4);
    const o = this.osc('sawtooth', 1800); o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const og = this.env(0.12, t, 0.002, 0.3); o.connect(og); this.out(og, 0.3); o.start(t); o.stop(t + 0.4);
  }
  heartbeat() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [0, 0.22].forEach((d, i) => {
      const o = this.osc('sine', 62); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.15);
      const g = this.env(i ? 0.35 : 0.5, t + d, 0.01, 0.18); o.connect(g); this.out(g, 0.1); o.start(t + d); o.stop(t + d + 0.3);
    });
  }
  thunder() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = this.noise(t, 2.0);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.4); g.gain.exponentialRampToValueAtTime(0.4, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    n.connect(lp).connect(g); this.out(g, 0.6);
  }
  vanish() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [1568, 1175, 880, 659, 523].forEach((f, i) => {
      const o = this.osc('sine', f); const g = this.env(0.08, t + i * 0.06, 0.01, 0.5);
      o.connect(g); this.out(g, 0.9); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.6);
    });
  }
  creepy() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) { // distant moan
      const o = this.osc('triangle', 210); o.frequency.linearRampToValueAtTime(150, t + 2.2);
      const vib = this.osc('sine', 5), vg = this.ctx.createGain(); vg.gain.value = 8; vib.connect(vg).connect(o.frequency);
      const lp = this.ctx.createBiquadFilter(); lp.frequency.value = 700;
      const g = this.env(0.06, t, 0.6, 1.8); o.connect(lp).connect(g); this.out(g, 1.0);
      o.start(t); vib.start(t); o.stop(t + 2.6); vib.stop(t + 2.6);
    } else if (kind === 1) { // creaky door
      const o = this.osc('sawtooth', 90);
      const lfo = this.osc('sine', 7), lg = this.ctx.createGain(); lg.gain.value = 35; lfo.connect(lg).connect(o.frequency);
      o.frequency.linearRampToValueAtTime(160, t + 1.4);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6;
      const g = this.env(0.1, t, 0.2, 1.3); o.connect(bp).connect(g); this.out(g, 0.6);
      o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
    } else { // crow
      [0, 0.32].forEach((d) => {
        const o = this.osc('square', 520); o.frequency.exponentialRampToValueAtTime(380, t + d + 0.22);
        const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 3;
        const g = this.env(0.05, t + d, 0.01, 0.22); o.connect(bp).connect(g); this.out(g, 0.8);
        o.start(t + d); o.stop(t + d + 0.3);
      });
    }
  }

  whirr() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', 140); o.frequency.linearRampToValueAtTime(260, t + 0.5);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
    const g = this.env(0.06, t, 0.05, 0.5); o.connect(bp).connect(g); this.out(g, 0.2); o.start(t); o.stop(t + 0.7);
  }
  stomp() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.osc('sine', 70); o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    const g = this.env(0.45, t, 0.005, 0.35); o.connect(g); this.out(g, 0.3); o.start(t); o.stop(t + 0.45);
    const n = this.noise(t, 0.12); const hp = this.ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2500;
    const ng = this.env(0.12, t, 0.002, 0.1); n.connect(hp).connect(ng); this.out(ng, 0.2);
  }
  yarn() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = this.noise(t, 0.4); const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1;
    bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
    const g = this.env(0.2, t, 0.03, 0.3); n.connect(bp).connect(g); this.out(g, 0.3);
    [784, 988].forEach((f, i) => { const o = this.osc('triangle', f); const og = this.env(0.1, t + 0.15 + i * 0.08, 0.004, 0.2); o.connect(og); this.out(og, 0.4); o.start(t + 0.15 + i * 0.08); o.stop(t + 0.5 + i * 0.08); });
  }

  speak(text, { pitch = 1, rate = 1 } = {}) {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = pitch; u.rate = rate; u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }
}
