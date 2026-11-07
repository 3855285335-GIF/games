// 音效：起跳、落地、接板用真实录音拼成（见下面 REAL）；其他的用"物理建模"合成一批采样（板子木头的共振、金属支架的高频、轮子胶的闷响、地面的颗粒感），
// 播放时每次随机挑一个、音高和音量稍微变一下，不会每次一模一样；再加一点室外的短混响。背景节拍保留。
const rnd = (a, b) => a + Math.random() * (b - a);
// 起跳、落地、接板用真实录音拼成（tools/mksfx.py；原始录音是 Kenney 的 CC0 公共领域录音）；其他的还是合成的
import P1 from '../assets/sfx_pop1.mp3'; import P2 from '../assets/sfx_pop2.mp3'; import P3 from '../assets/sfx_pop3.mp3';
import L1 from '../assets/sfx_land1.mp3'; import L2 from '../assets/sfx_land2.mp3'; import L3 from '../assets/sfx_land3.mp3';
import C1 from '../assets/sfx_catch1.mp3'; import C2 from '../assets/sfx_catch2.mp3'; import C3 from '../assets/sfx_catch3.mp3';
const REAL = { pop: [P1, P2, P3], land: [L1, L2, L3], catch: [C1, C2, C3] };

// 一段采样：modes = [[频率, 衰减时间, 音量], …]（衰减的正弦，模拟木板 / 金属的共振），noise = 起始的瞬间噪声
function synth(sr, len, parts) {
  const n = Math.floor(sr * len), out = new Float32Array(n);
  for (const p of parts) {
    const t0 = Math.floor((p.at || 0) * sr);
    if (p.modes) for (const [f0, dec, amp] of p.modes) {
      const f = f0 * rnd(0.97, 1.03), w = (2 * Math.PI * f) / sr, k = Math.exp(-1 / (dec * sr)), ph = Math.random() * 6.28;
      // 衰减的正弦用递推算：y[n] = 2k·cos(w)·y[n-1] − k²·y[n-2]（结果一样，比每个采样都算一次 sin 快好几倍）
      const e0 = amp * (p.gain || 1), c2 = 2 * k * Math.cos(w), k2 = k * k;
      let ym = e0 * Math.sin(ph), y = e0 * k * Math.sin(w + ph), e = e0;
      if (t0 < n) out[t0] += ym;
      for (let i = t0 + 1; i < n && e > 1e-5; i++) { out[i] += y; const yn = c2 * y - k2 * ym; ym = y; y = yn; e *= k; }
    }
    if (p.noise) {
      // 瞬间噪声：一阶低通 / 高通 + 指数衰减
      const { dur, lp = 0, hp = 0, amp } = p.noise, m = Math.floor(dur * sr), k = Math.exp(-5 / m);
      const al = lp ? Math.exp((-2 * Math.PI * lp) / sr) : 0, ah = hp ? Math.exp((-2 * Math.PI * hp) / sr) : 0;
      let e = amp * (p.gain || 1), yl = 0, yh = 0, xp = 0;
      for (let i = 0; i < m && t0 + i < n; i++) {
        const x = Math.random() * 2 - 1;
        yl = lp ? (1 - al) * x + al * yl : x;
        yh = hp ? ah * (yh + yl - xp) : yl; xp = yl;
        out[t0 + i] += e * yh; e *= k;
      }
    }
  }
  // 防削波
  let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(out[i]));
  if (mx > 0.98) for (let i = 0; i < n; i++) out[i] *= 0.98 / mx;
  return out;
}
// 滑板板面（7 层枫木）大致的共振频率；支架（铝）和螺丝的高频
const DECK = () => [[rnd(160, 190), 0.05, 0.5], [rnd(380, 430), 0.04, 0.55], [rnd(720, 800), 0.03, 0.4], [rnd(1150, 1300), 0.022, 0.3], [rnd(1900, 2150), 0.016, 0.22], [rnd(2900, 3300), 0.01, 0.14]];
const TRUCK = () => [[rnd(2500, 2800), 0.035, 0.12], [rnd(3900, 4300), 0.03, 0.1], [rnd(5600, 6100), 0.022, 0.07], [rnd(7600, 8200), 0.015, 0.05]];

// 采样提前算好：打开游戏后趁空闲分几次算（不需要声音设备），点开始时只要把数据装进去，进入游戏更快。
// 按 48000 采样率算（iPhone 一般就是这个）；声音设备的采样率不一样也没关系，浏览器播放时会自动换算
const SR = 48000;
const BANK = {
  // 起跳：板尾砸地（又硬又脆的"啪"）+ 板子木头的共振 + 很短的板尾擦地
  pop: () => synth(SR, 0.35, [
    { noise: { dur: 0.012, hp: 900, amp: 0.9 } },
    { noise: { dur: 0.05, lp: 5000, hp: 400, amp: 0.35 }, at: 0.002 },
    { modes: DECK(), gain: 1.1, at: 0.001 },
    { modes: [[rnd(85, 100), 0.06, 0.6]], at: 0.002 },
    { modes: TRUCK(), gain: 0.8, at: 0.004 },
  ]),
  // 落地：后轮、前轮先后着地（相差十几毫秒）：轮子的闷响 + 支架的金属声 + 板子的共振
  land: () => { const dt = rnd(0.008, 0.022); return synth(SR, 0.45, [
    { modes: [[rnd(60, 75), 0.09, 0.9], [rnd(120, 140), 0.05, 0.4]] },
    { noise: { dur: 0.03, lp: 1800, amp: 0.55 } },
    { modes: TRUCK(), gain: 1 }, { modes: DECK(), gain: 0.7 },
    { modes: [[rnd(60, 75), 0.08, 0.7]], at: dt }, { noise: { dur: 0.025, lp: 1800, amp: 0.4 }, at: dt },
    { modes: TRUCK(), gain: 0.8, at: dt }, { modes: DECK(), gain: 0.5, at: dt },
  ]); },
  // 压过地缝：轮子"咔哒"一下（前后轮各一下）
  clack: () => synth(SR, 0.18, [
    { modes: [[rnd(70, 90), 0.03, 0.5]] }, { noise: { dur: 0.008, lp: 3000, amp: 0.4 } }, { modes: TRUCK(), gain: 0.35 },
    { modes: [[rnd(70, 90), 0.03, 0.4]], at: 0.06 }, { noise: { dur: 0.008, lp: 3000, amp: 0.3 }, at: 0.06 },
  ]),
  // 拨板：手指擦过砂纸（沙沙一下）
  flick: () => synth(SR, 0.12, [{ noise: { dur: 0.09, lp: 7000, hp: 1800, amp: 0.45 } }]),
  // 接板：脚踩回板上：闷的木头声
  catch: () => synth(SR, 0.15, [{ noise: { dur: 0.015, lp: 1200, amp: 0.5 } }, { modes: DECK().slice(0, 3), gain: 0.6 }, { modes: [[rnd(110, 130), 0.03, 0.4]] }]),
  // 上杆：金属一声"叮"
  grindOn: () => synth(SR, 0.4, [{ noise: { dur: 0.01, hp: 1500, amp: 0.5 } }, { modes: [[rnd(1150, 1250), 0.12, 0.25], [rnd(2300, 2400), 0.1, 0.2], [rnd(3650, 3800), 0.07, 0.15], [rnd(5100, 5300), 0.05, 0.1]] }, { modes: TRUCK(), gain: 0.7 }]),
  // 板子撞到东西：木头 + 一点金属
  impact: () => synth(SR, 0.3, [{ noise: { dur: 0.02, lp: 2500, amp: 0.7 } }, { modes: DECK(), gain: 0.9 }, { modes: [[rnd(90, 110), 0.05, 0.5]] }, { modes: TRUCK(), gain: 0.4 }]),
  // 摔：板子翻滚着砸地，几下乱响
  tumble: () => synth(SR, 0.25, [{ noise: { dur: 0.02, lp: 3000, amp: 0.6 } }, { modes: DECK(), gain: rnd(0.6, 1) }, { modes: TRUCK(), gain: rnd(0.3, 0.8) }]),
  // Kickturn：前轮砸回地面
  kick: () => synth(SR, 0.2, [{ modes: [[rnd(70, 85), 0.05, 0.5]] }, { noise: { dur: 0.015, lp: 2000, amp: 0.35 } }, { modes: TRUCK(), gain: 0.5 }]),
};
// 持续的声音要用的噪声，和室外的短混响
const NOISE = {
  // 粉红噪声（比白噪声更像真实的摩擦声）
  nb: () => {
    const d = new Float32Array(SR * 2); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    return [d];
  },
  wb: () => { const d = new Float32Array(SR * 2); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return [d]; },
};
// 混响的冲激响应：必须按声音设备自己的采样率做（混响器不接受采样率不一样的数据，会直接报错、整个声音都起不来）
const makeIR = (sr) => [0, 1].map(() => { const a = new Float32Array(Math.floor(sr * 0.45)); for (let i = 0; i < a.length; i++) { const t = i / sr; a[i] = (Math.random() * 2 - 1) * Math.exp(-t * 11) * (t < 0.012 ? t / 0.012 : 1); } return a; });
const PRE = { smp: {}, noise: {}, real: {}, realP: null, todo: [...Object.keys(NOISE).map((k) => ['n', k]), ...Object.keys(BANK).map((k) => ['s', k])], timer: 0 };
// 把真实录音解出来（不需要声音设备，打开游戏后就能做）：去掉 MP3 开头那一小段空白，起跳声才不会慢半拍
function decodeReal() {
  if (PRE.realP) return PRE.realP;
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let oc = null; try { oc = OC && new OC(1, 1, SR); } catch (e) { oc = null; }
  if (!oc) return (PRE.realP = Promise.resolve());
  const trim = (x) => { let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); let i0 = 0; while (i0 < x.length && Math.abs(x[i0]) < pk * 0.02) i0++; return x.slice(Math.max(0, i0 - 48)); };
  const one = (u) => {
    const b = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Promise((res, rej) => { const p = oc.decodeAudioData(a.buffer, res, rej); if (p && p.then) p.then(res, rej); }).then((ab) => trim(ab.getChannelData(0)));
  };
  PRE.realP = Promise.all(Object.keys(REAL).map((k) => Promise.all(REAL[k].map(one)).then((arr) => { PRE.real[k] = arr; if (Aud.ctx) Aud._useReal(); })))
    .catch(() => { /* 解不出来就继续用合成的声音 */ });
  return PRE.realP;
}
function preStep() { // 算一种声音（4 个版本）
  const j = PRE.todo.shift(); if (!j) return false;
  if (j[0] === 'n') PRE.noise[j[1]] = NOISE[j[1]](); else PRE.smp[j[1]] = [0, 1, 2, 3].map(() => BANK[j[1]]());
  return true;
}

export const Aud = {
  ctx: null, sfx: true, music: true, _mus: null, smp: {},
  // 打开游戏后调用：趁空闲一点点把采样算好（每次只算一种，不会卡画面）
  prep(delay) {
    setTimeout(() => decodeReal(), delay || 0);
    if (PRE.timer || !PRE.todo.length) return;
    const run = () => { PRE.timer = 0; if (this.ctx || !preStep()) return; PRE.timer = setTimeout(run, 40); };
    PRE.timer = setTimeout(run, delay || 0);
  },
  init() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = (this.ctx = new C());
      clearTimeout(PRE.timer); PRE.timer = 0; while (preStep()); // 还没算完的现在算完
      const buf = (chs) => { const b = c.createBuffer(chs.length, chs[0].length, SR); chs.forEach((a, i) => b.getChannelData(i).set(a)); return b; };
      const nb = (this.nb = buf(PRE.noise.nb)), wb = (this.wb = buf(PRE.noise.wb));
      this.out = c.createGain(); this.out.gain.value = 0.9; this.out.connect(c.destination);
      // 室外的短混响（周围的墙和地面反射回来一点点）
      this.rev = c.createConvolver();
      { const ir = makeIR(c.sampleRate), b = c.createBuffer(2, ir[0].length, c.sampleRate); ir.forEach((a, i) => b.getChannelData(i).set(a)); this.rev.buffer = b; }
      const wet = c.createGain(); wet.gain.value = 0.22; this.rev.connect(wet); wet.connect(this.out);
      this.fx = c.createGain(); this.fx.gain.value = this.sfx ? 1 : 0; this.fx.connect(this.out); this.fx.connect(this.rev);
      this.mg = c.createGain(); this.mg.gain.value = this.music ? 0.22 : 0; this.mg.connect(this.out);
      for (const k of Object.keys(PRE.smp)) this.smp[k] = PRE.smp[k].map((a) => buf([a]));
      this._buf = buf; decodeReal(); this._useReal(); // 真实录音解好了就换上（还没解好的，解好那一刻再换）
      // 持续的声音：轮子滚（粉红噪声 + 低沉的隆隆声 + 轻微的轴承声）、木头坡的空心声、磨杆、滑板身擦杆、横着蹭地
      const loop = (b, chain) => {
        const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = Math.random(); s.loopEnd = 2;
        let node = s; const fls = chain.map(([type, f, q]) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; node.connect(fl); node = fl; return fl; });
        const g = c.createGain(); g.gain.value = 0; node.connect(g); g.connect(this.fx); s.start(0, Math.random()); return { fl: fls[0], fls, g, s };
      };
      this.roll = loop(nb, [['lowpass', 900, 0.6], ['highpass', 90]]);
      this.grain = loop(wb, [['bandpass', 2400, 0.9]]);                 // 地面颗粒的沙沙声（跟着速度）
      this.rumble = loop(nb, [['lowpass', 120, 0.8]]);
      this.boom = loop(nb, [['bandpass', 190, 6]]);                     // 木头坡的空心共鸣
      this.scrub = loop(wb, [['bandpass', 1700, 1.2]]);
      // 金属磨杆：几个高 Q 的共振叠在一起（不规则的金属声）
      this.grindM = [1180, 2330, 3710, 5150, 7350].map((f, i) => loop(wb, [['bandpass', f, 22 + i * 4]]));
      this.ledge = loop(wb, [['bandpass', 1300, 1.1], ['lowpass', 4000]]); // 台边打蜡的水泥：粗糙的擦声
      this.slide = loop(nb, [['bandpass', 720, 2.2]]);                  // 板身擦杆：木头的闷擦声
      this.bear = c.createOscillator(); this.bear.type = 'sine'; this.bearG = c.createGain(); this.bearG.gain.value = 0;
      this.bear.connect(this.bearG); this.bearG.connect(this.fx); this.bear.start();
      this._startMusic();
    } catch (e) { console.error(e); this.ctx = null; }
  },
  _useReal() {
    if (!this.ctx || !this._buf) return;
    for (const k of Object.keys(PRE.real)) if (!this.smp[k + '_real']) { this.smp[k] = PRE.real[k].map((a) => this._buf([a])); this.smp[k + '_real'] = true; }
  },
  // 播放一个采样：音量 vol，音高随机浮动
  play(name, vol, rate) {
    if (!this.ctx || !this.smp[name]) return;
    const c = this.ctx, b = this.smp[name], s = c.createBufferSource(), g = c.createGain();
    s.buffer = b[(Math.random() * b.length) | 0]; s.playbackRate.value = (rate || 1) * rnd(0.94, 1.06);
    g.gain.value = vol; s.connect(g); g.connect(this.fx); s.start();
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  setSfx(on) { this.sfx = on; if (this.fx) this.fx.gain.value = on ? 1 : 0; },
  setMusic(on) { this.music = on; if (this.mg) this.mg.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2); },
  update(speed, mode, surface, grindType, alat, slip) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, sp = Math.abs(speed), rolling = mode === 'ground';
    const wood = surface === 'wood', set = (p, v, tc) => p.setTargetAtTime(v, t, tc || 0.05);
    // 滚动：速度越快越响、音色越亮；木头坡更"空"
    set(this.roll.g.gain, rolling ? Math.min(0.75, sp * 0.11) : 0, 0.04);
    set(this.roll.fl.frequency, (wood ? 500 : 700) + sp * 260, 0.06);
    set(this.grain.g.gain, rolling ? Math.min(0.09, sp * 0.012) * (wood ? 0.4 : 1) : 0, 0.05);
    set(this.grain.fl.frequency, 1800 + sp * 300, 0.08);
    set(this.rumble.g.gain, rolling ? Math.min(0.8, sp * 0.12) : 0, 0.05);
    set(this.rumble.fl.frequency, 70 + sp * 16, 0.08);
    set(this.boom.g.gain, rolling && wood ? Math.min(0.45, sp * 0.08) : 0, 0.04);
    // 轴承：很轻的一点"嗡"（转速越快音越高）
    set(this.bearG.gain, rolling ? Math.min(0.012, sp * 0.002) : 0, 0.1);
    set(this.bear.frequency, 220 + sp * 95, 0.1);
    const sc = rolling ? Math.min(0.32, Math.max(0, (alat || 0) - 7) * 0.025 + (slip || 0) * 0.14) : 0;
    set(this.scrub.g.gain, sc, 0.03);
    const g = mode === 'grind', metal = g && grindType !== 'slide' && surface !== 'ledge', ledge = g && grindType !== 'slide' && surface === 'ledge';
    const jit = 0.85 + Math.random() * 0.3;
    this.grindM.forEach((l, i) => set(l.g.gain, metal ? (0.13 - i * 0.015) * jit * Math.min(1, 0.4 + sp * 0.15) : 0, 0.03));
    set(this.ledge.g.gain, ledge ? Math.min(0.4, 0.15 + sp * 0.05) * jit : 0, 0.03);
    set(this.slide.g.gain, g && grindType === 'slide' ? Math.min(0.4, 0.18 + sp * 0.05) : 0, 0.03);
  },
  // 下面几个保留原来的接口
  burst(freq, dur, vol, type, q) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.wb;
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
  pop(k) { this.play('pop', 0.85 + 0.3 * (k || 0)); },
  // 落地：越重越响；落得歪还会蹭一下
  land(v, q) {
    const k = Math.min(1.2, 0.35 + Math.abs(v) * 0.12);
    this.play('land', k, Math.abs(v) > 4 ? 0.92 : 1);
    if (q === 'sketchy') this.burst(1100, 0.3, 0.25, 'bandpass', 1.2);
  },
  clack(sp) { this.play('clack', Math.min(0.7, 0.2 + sp * 0.08), 0.9 + Math.min(0.3, sp * 0.04)); },
  kick() { if (this.smp.land_real) this.play('land', 0.3, 1.12); else this.play('kick', 0.5); }, // 原地转身：前轮砸回地面（有真实录音就用落地声，轻一点）
  flick() { this.play('flick', 0.5); },
  catch(perfect) { if (perfect) this.play('catch', 0.85, 1.12); else this.play('catch', 0.6); }, // 踩点：响一点、脆一点
  grindOn() { this.play('grindOn', 0.6); },
  skid() { this.burst(1100, 0.55, 0.4, 'bandpass', 1.2); this.burst(500, 0.4, 0.25, 'bandpass', 1); },
  impact(v) { this.play('impact', Math.min(1, 0.3 + v * 0.12)); },
  bail() { for (let i = 0; i < 4; i++) setTimeout(() => this.play('tumble', rnd(0.4, 0.8), rnd(0.85, 1.15)), i * rnd(70, 130)); },
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
    const noise = (t, f, d, v) => { const s = c.createBufferSource(); s.buffer = this.wb; const fl = c.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(fl); fl.connect(g); g.connect(this.mg); s.start(t, Math.random(), d + 0.05); };
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
