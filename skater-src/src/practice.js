// 练习模式：一步一步带着做，每步有手指动画示范
const STEPS = [
  { t: '把两根手指放在滑板上', s: '下面那根是后脚（板尾），上面那根是前脚（板头）。放在板子外面的手指不算。', demo: 'place' },
  { t: '两指往板头方向推', s: '推出板头手指就离开板子了，抬起来放回板尾，再推。推到 11 km/h。', demo: 'push' },
  { t: '压板转弯', s: '手指往板子右半边压，板面往右倾，就往右拐；压左边往左拐。滑得越快弯越大，停着压板不会转。转一大圈。', demo: 'steer' },
  { t: '原地转 Kickturn', s: '慢下来或停住，一根手指按住板尾不动，另一根手指往旁边拨，板子就跟着手指原地转。转 90° 以上。', demo: 'kick' },
  { t: '起跳 Ollie', s: '后指快速往下划出板尾：划得越快跳得越高。落地前把手指放回板上接住板。', demo: 'ollie' },
  { t: '翻板 Kickflip / Heelflip', s: '起跳后，前指从板子侧边拨出去：拨得越重，板子转得越多、越快，转完自己会慢下来。拨到正好一圈，等它转完再把手指按回板上接住。拨轻了转不够；拨重了要在转到一圈、黄圈亮的时候接。', demo: 'flip' },
  { t: '转板 Shove-it', s: '起跳后，后指侧着拨出去，板子在脚下平着转：拨得越重转得越多。转到半圈、黄圈亮的时候把手指按回板上接住。', demo: 'shove' },
  { t: 'Manual 翘板滑', s: '只用一根手指按住板尾。越靠板尾翘得越高，让右边的指针停在绿色区，坚持 1.5 秒。', demo: 'manual' },
  { t: '磨杆', s: '前面的杆子亮起来时，两根手指同时按住不动，板子会自己跳上去磨；松开就跳下来。也可以自己起跳落到杆上。', demo: 'grind' },
];
const $ = (id) => document.getElementById(id);

export class Practice {
  constructor(hooks) { this.h = hooks; this.on = false; }
  start() {
    this.on = true; this.i = -1; this.next();
    $('prac').classList.remove('hide');
  }
  stop() { this.on = false; $('prac').classList.add('hide'); $('demo').classList.add('hide'); }
  next() {
    this.i++; this.hold = 0; this.turn = 0; this.lastH = null; this.ph = 0;
    if (this.i >= STEPS.length) { this.done(); return; }
    const S = STEPS[this.i];
    $('pracN').textContent = '练习 ' + (this.i + 1) + ' / ' + STEPS.length;
    $('pracT').textContent = S.t; $('pracS').textContent = S.s;
    $('pracDots').innerHTML = STEPS.map((_, k) => `<i class="${k < this.i ? 'ok' : k === this.i ? 'cur' : ''}"></i>`).join('');
    if (S.demo === 'grind') this.h.teleport('grind');
    if (this.i > 0) this.h.good();
  }
  done() {
    this.on = false; this.h.finish();
    $('pracN').textContent = '练习完成'; $('pracT').textContent = '全部学会了！'; $('pracS').textContent = '可以去自由滑、挑战，或者叫朋友来同一个房间一起滑。';
    $('pracDots').innerHTML = STEPS.map(() => '<i class="ok"></i>').join('');
    $('demo').classList.add('hide');
    setTimeout(() => $('prac').classList.add('hide'), 4000);
  }
  // 游戏事件
  land(info) {
    if (!this.on) return;
    const d = STEPS[this.i].demo;
    if (d === 'ollie' && info.air.popped) this.next();
    else if (d === 'flip' && info.flips.length) this.next();
    else if (d === 'shove' && info.shoves.length) this.next();
  }
  manual(t) { if (this.on && STEPS[this.i].demo === 'manual' && t >= 1.5) this.next(); }
  grind(t) { if (this.on && STEPS[this.i].demo === 'grind' && t >= 0.4) this.next(); }
  update(dt, sk, I, geo) {
    if (!this.on) return;
    const d = STEPS[this.i].demo;
    if (d === 'place') { this.hold = I.fingers >= 2 ? this.hold + dt : 0; if (this.hold > 0.6) this.next(); }
    else if (d === 'push') { if (sk.speed() * 3.6 >= 11) this.next(); }
    else if (d === 'steer') {
      if (this.lastH != null && sk.mode === 'ground' && sk.s > 0.8) { let dh = sk.heading - this.lastH; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.turn += Math.abs(dh); }
      this.lastH = sk.heading;
      if (this.turn > 4.5) this.next();
    } else if (d === 'kick') { if (sk.kickAcc > 1.4) this.next(); }
    else if (d === 'manual' && sk.manual && sk.manual.t >= 1.5) this.next();
    else if (d === 'grind' && sk.mode === 'grind' && sk.grind && sk.grind.t >= 0.4) this.next();
    this.demo(dt, I, geo);
  }
  // 手指动画：只在没有手指按着时显示
  demo(dt, I, geo) {
    const el = $('demo'), d = this.i < STEPS.length ? STEPS[this.i].demo : null;
    if (!geo || I.touching > 0 || !d || d === 'grind') { el.classList.add('hide'); return; }
    el.classList.remove('hide');
    this.ph = (this.ph + dt) % 1.6;
    const t = this.ph / 1.6, ux = geo.fx - geo.rx, uy = geo.fy - geo.ry, L = Math.hypot(ux, uy) || 1, nx = ux / L, ny = uy / L, px = -ny, py = nx;
    const at = (al, ac) => [(geo.rx + geo.fx) / 2 + nx * al * L / 2 + px * ac * geo.halfW, (geo.ry + geo.fy) / 2 + ny * al * L / 2 + py * ac * geo.halfW];
    let A = at(-0.55, 0), B = at(0.55, 0), oa = 1, ob = 1;
    const e = (x) => x * x * (3 - 2 * x);
    if (d === 'place') { oa = ob = 0.5 + 0.5 * Math.sin(t * 6.283); }
    else if (d === 'push') { const k = e(Math.min(1, t * 1.6)); A = at(-0.55 + k * 1.3, 0); B = at(0.55 + k * 1.3, 0); oa = ob = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3; }
    else if (d === 'steer') { const k = 0.75 * Math.max(-1, Math.min(1, Math.sin(t * 6.283) * 1.6)); A = at(-0.5, k); B = at(0.5, k); }
    else if (d === 'ollie') { const k = t < 0.35 ? 0 : e(Math.min(1, (t - 0.35) / 0.15)); A = t < 0.8 ? at(-0.6 - k * 0.9, 0) : at(-0.45, 0); oa = t < 0.58 ? 1 : t < 0.8 ? 0 : 1; }
    else if (d === 'flip') { const k1 = t < 0.25 ? 0 : e(Math.min(1, (t - 0.25) / 0.12)); const k2 = t < 0.42 ? 0 : e(Math.min(1, (t - 0.42) / 0.14)); A = at(-0.6 - k1 * 0.9, 0); B = t < 0.8 ? at(0.55, -k2 * 2.2) : at(0.3, 0); oa = t < 0.4 ? 1 : 0; ob = t < 0.6 ? 1 : t < 0.8 ? 0 : 1; }
    else if (d === 'shove') { const k1 = t < 0.25 ? 0 : e(Math.min(1, (t - 0.25) / 0.12)); const k2 = t < 0.42 ? 0 : e(Math.min(1, (t - 0.42) / 0.14)); A = t < 0.8 ? at(-0.6 - k1 * 0.4, k2 * 2.2) : at(-0.4, 0); oa = t < 0.6 ? 1 : t < 0.8 ? 0 : 1; ob = t < 0.25 ? 1 : 0; }
    else if (d === 'manual') { A = at(-0.82, 0); ob = 0; oa = 1; }
    else if (d === 'kick') { const k = Math.sin(t * 6.283); A = at(-0.6, 0); const a2 = k * 0.6; B = at(-0.6 + 1.15 * Math.cos(a2), 1.15 * Math.sin(a2) * 2.2); }
    const da = $('demoA'), db = $('demoB');
    da.style.transform = `translate(${A[0]}px,${A[1]}px)`; da.style.opacity = oa;
    db.style.transform = `translate(${B[0]}px,${B[1]}px)`; db.style.opacity = ob;
  }
}
