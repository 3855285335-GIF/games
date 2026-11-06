// 程序合成音效 + 轻松的背景节拍（无需音频文件）
export const Aud = {
  ctx: null, sfx: true, music: true, _mus: null,
  init() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = (this.ctx = new C());
      const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.nb = nb;
      this.out = c.createGain(); this.out.gain.value = 0.9; this.out.connect(c.destination);
      this.fx = c.createGain(); this.fx.gain.value = this.sfx ? 1 : 0; this.fx.connect(this.out);
      this.mg = c.createGain(); this.mg.gain.value = this.music ? 0.22 : 0; this.mg.connect(this.out);
      const loop = (type, f, q) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.fx); s.start(); return { fl, g }; };
      this.roll = loop('lowpass', 400); this.roll2 = loop('bandpass', 900, 1.2); this.grind = loop('bandpass', 2600, 6); this.slide = loop('bandpass', 700, 2);
      // 低沉的滚动声（速度越快越响）+ 木头坡面的空心共鸣 + 轮子横着蹭地的沙沙声
      this.rumble = loop('lowpass', 110); this.boom = loop('bandpass', 170, 5); this.scrub = loop('bandpass', 1500, 1.4);
      this._startMusic();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  setSfx(on) { this.sfx = on; if (this.fx) this.fx.gain.value = on ? 1 : 0; },
  setMusic(on) { this.music = on; if (this.mg) this.mg.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2); },
  update(speed, mode, surface, grindType, alat, slip) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, sp = Math.abs(speed), rolling = mode === 'ground';
    const wood = surface === 'wood';
    this.rumble.g.gain.setTargetAtTime(rolling ? Math.min(0.9, sp * 0.13) : 0, t, 0.05);
    this.rumble.fl.frequency.setTargetAtTime(70 + sp * 14, t, 0.08);
    this.boom.g.gain.setTargetAtTime(rolling && wood ? Math.min(0.5, sp * 0.08) : 0, t, 0.04);
    const sc = rolling ? Math.min(0.35, Math.max(0, (alat || 0) - 7) * 0.025 + (slip || 0) * 0.14) : 0;
    this.scrub.g.gain.setTargetAtTime(sc, t, 0.03);
    this.roll.g.gain.setTargetAtTime(rolling ? Math.min(0.5, sp * 0.06) : 0, t, 0.04);
    this.roll.fl.frequency.setTargetAtTime((wood ? 260 : 180) + sp * 90, t, 0.05);
    this.roll2.g.gain.setTargetAtTime(rolling ? Math.min(0.12, sp * 0.015) * (wood ? 1.8 : 1) : 0, t, 0.05);
    this.roll2.fl.frequency.setTargetAtTime((wood ? 600 : 1100) + sp * 60, t, 0.05);
    const g = mode === 'grind';
    this.grind.g.gain.setTargetAtTime(g && grindType !== 'slide' ? 0.22 : 0, t, 0.03);
    this.slide.g.gain.setTargetAtTime(g && grindType === 'slide' ? 0.3 : 0, t, 0.03);
  },
  burst(freq, dur, vol, type, q) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.nb;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.fx); s.start(t, Math.random(), dur + 0.05);
  },
  tone(f0, f1, dur, vol, type, dest) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.fx); o.start(t); o.stop(t + dur + 0.02);
  },
  pop() { this.burst(2500, 0.05, 0.5, 'highpass'); this.tone(180, 60, 0.11, 0.6); this.burst(700, 0.09, 0.35, 'bandpass', 3); },
  // 落地：板子拍地（啪）+ 桥胶压下去（闷响）+ 四个轮子着地；落得歪还会蹭一下
  land(v, q) {
    const k = Math.min(1, 0.25 + Math.abs(v) * 0.09);
    this.burst(260, 0.18, 0.9 * k); this.tone(115, 42, 0.16, 0.6 * k); this.burst(1800, 0.05, 0.3 * k, 'bandpass', 2);
    this.burst(4200, 0.03, 0.18 * k, 'highpass');
    if (q === 'sketchy') this.burst(1100, 0.3, 0.3, 'bandpass', 1.2);
  },
  // 压过地缝：短促的「咔」
  clack(sp) { const k = Math.min(1, 0.3 + sp * 0.12); this.burst(2400, 0.025, 0.22 * k, 'bandpass', 2.5); this.tone(95, 55, 0.05, 0.22 * k); },
  kick() { this.burst(900, 0.08, 0.25, 'bandpass', 2); this.tone(160, 80, 0.07, 0.25); },
  flick() { this.burst(1600, 0.16, 0.12, 'bandpass', 1.5); },
  catch() { this.burst(1300, 0.03, 0.2, 'bandpass', 2); this.tone(140, 85, 0.05, 0.22); }, // 手指接住板：脚踩回板上的一声
  grindOn() { this.burst(3200, 0.12, 0.4, 'bandpass', 4); this.tone(900, 700, 0.1, 0.12, 'triangle'); },
  skid() { this.burst(1100, 0.55, 0.45, 'bandpass', 1.2); this.burst(500, 0.4, 0.3, 'bandpass', 1); },
  impact(v) { this.burst(420, 0.2, Math.min(0.9, 0.2 + v * 0.1)); this.burst(2200, 0.07, 0.25, 'bandpass', 3); },
  bail() { for (let i = 0; i < 4; i++) setTimeout(() => this.burst(300 + Math.random() * 900, 0.14, 0.5, 'bandpass', 2), i * 90); this.tone(140, 45, 0.3, 0.4); },
  bank(m) { const base = 520 + Math.min(6, m) * 40; this.tone(base, base * 1.5, 0.16, 0.18, 'triangle'); setTimeout(() => this.tone(base * 1.5, base * 2, 0.2, 0.15, 'triangle'), 90); },
  lose() { this.tone(300, 150, 0.3, 0.15, 'triangle'); },
  click() { this.tone(880, 660, 0.05, 0.12, 'triangle'); },
  done() { [0, 90, 180].forEach((d, i) => setTimeout(() => this.tone(660 * [1, 1.25, 1.5][i], 660 * [1, 1.25, 1.5][i], 0.18, 0.18, 'triangle'), d)); },
  // 简单的 lo-fi 节拍：鼓 + 贝斯 + 和弦
  _startMusic() {
    const c = this.ctx, bpm = 86, beat = 60 / bpm, step = beat / 2;
    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let next = c.currentTime + 0.1, i = 0;
    const kick = (t) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(this.mg); o.start(t); o.stop(t + 0.3); };
    const noise = (t, f, d, v) => { const s = c.createBufferSource(); s.buffer = this.nb; const fl = c.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(fl); fl.connect(g); g.connect(this.mg); s.start(t, Math.random(), d + 0.05); };
    const pad = (t, notes, d) => { for (const m of notes) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = hz(m); f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f); f.connect(g); g.connect(this.mg); o.start(t); o.stop(t + d + 0.05); } };
    const bass = (t, m, d) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = hz(m - 24); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(this.mg); o.start(t); o.stop(t + d + 0.05); };
    const tick = () => {
      if (!this.ctx) return;
      while (next < c.currentTime + 0.25) {
        const s = i % 16, bar = Math.floor(i / 16) % 4, ch = chords[bar];
        if (this.music) {
          if (s === 0 || s === 7 || s === 10) kick(next);
          if (s === 4 || s === 12) noise(next, 1800, 0.18, 0.35);
          if (s % 2 === 0) noise(next, 7000, 0.05, s % 4 === 2 ? 0.12 : 0.07);
          if (s === 0) pad(next, ch, step * 16);
          if (s === 0 || s === 6 || s === 8 || s === 11) bass(next, ch[0], step * 1.6);
        }
        next += step; i++;
      }
    };
    this._mus = setInterval(tick, 100);
  },
};
