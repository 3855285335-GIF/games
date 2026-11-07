// 练习模式：一步一步带着做，每步有手指动画示范
// 2026-11-07 第 5 版：先划再松——起跳在后指松手的那一刻；翻板、转板在起跳前拨好，起跳时一起出；板子每次转完整的圈
const STEPS = [
  { t: '把两根手指放在滑板上', s: '下面那根是后脚（板尾），上面那根是前脚（板头）。放在板子外面的手指不算。', demo: 'place' },
  { t: '两指往板头方向推', s: '推出板头手指就离开板子了，抬起来放回板尾，再推。推到 11 km/h。', demo: 'push' },
  { t: '压板转弯', s: '手指往板子右半边压，板面往右倾，就往右拐；压左边往左拐。滑得越快弯越大，停着压板不会转。转一大圈。', demo: 'steer' },
  { t: '原地转 Kickturn', s: '慢下来或停住，一根手指按住板尾不动，另一根手指往旁边拨，板子就跟着手指原地转。转 90° 以上。', demo: 'kick' },
  { t: '轻轻一划：小跳', s: '后指慢一点往板尾划，松手的那一刻起跳，跳得低（不到 0.65 米）。落地前把手指放回板上。', demo: 'ollie' },
  { t: '用力一划：大跳', s: '这次后指又快又长地划出板尾再松手，跳得高（超过 0.85 米）。划得越快，跳得越高。', demo: 'ollie2' },
  { t: '先拨再跳：Kickflip', s: '前指先从板子侧边轻轻拨出去（板子先不动），紧接着后指往板尾一划、松手：起跳的同时翻一圈。板子转完停在正的位置，落地前把手指按回板上。', demo: 'flip' },
  { t: '后指侧划：Pop Shove-it', s: '后指侧着划出板边再松手：起跳的同时，板子在脚下平着转半圈。转完把手指按回板上。', demo: 'shove' },
  { t: '用力侧划：360 Shove-it', s: '后指侧着又快又重地划出去，板子转一整圈。划得越重转得越多。', demo: 'shove2' },
  { t: '用力拨：Double Kickflip', s: '前指拨得又快又重，后指也用力划、跳高一点：板子翻两圈。跳得越高、拨得越重，圈数越多。等它转完再接。', demo: 'flip2' },
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
    const d = STEPS[this.i].demo, a = info.air, nf = info.flips.length, ns = info.shoves.length;
    const plain = a.popped && !nf && !ns;
    if (d === 'ollie' && plain && info.height < 0.65) this.next();
    else if (d === 'ollie' && plain) this.h.tip && this.h.tip('跳高了（' + info.height.toFixed(2) + ' 米）：划得再轻一点、慢一点');
    else if (d === 'ollie2' && plain && info.height >= 0.85) this.next();
    else if (d === 'ollie2' && plain) this.h.tip && this.h.tip('才 ' + info.height.toFixed(2) + ' 米：划得再快一点、长一点');
    else if (d === 'flip' && nf === 1 && !ns) this.next();
    else if (d === 'flip' && ns && !nf) this.h.tip && this.h.tip('这是转板：翻板要用前指（板头那根）往侧边拨');
    else if (d === 'shove' && ns === 1 && !nf) this.next();
    else if (d === 'shove' && nf && !ns) this.h.tip && this.h.tip('这是翻板：转板要用后指（板尾那根）侧着划');
    else if (d === 'shove2' && ns === 2 && !nf) this.next();
    else if (d === 'shove2' && ns === 1 && !nf) this.h.tip && this.h.tip('只转了半圈：侧划得再快、再重一点');
    else if (d === 'flip2' && nf >= 2 && !ns) this.next();
    else if (d === 'flip2' && nf === 1 && !ns) this.h.tip && this.h.tip('翻了一圈：前指拨得再重一点，后指也划快一点跳高些');
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
    else if (d === 'ollie') { const k = t < 0.3 ? 0 : e(Math.min(1, (t - 0.3) / 0.28)); A = t < 0.8 ? at(-0.6 - k * 0.6, 0) : at(-0.45, 0); oa = t < 0.62 ? 1 : t < 0.8 ? 0 : 1; } // 慢、短
    else if (d === 'ollie2') { const k = t < 0.35 ? 0 : e(Math.min(1, (t - 0.35) / 0.1)); A = t < 0.8 ? at(-0.6 - k * 1.3, 0) : at(-0.45, 0); oa = t < 0.5 ? 1 : t < 0.8 ? 0 : 1; } // 快、长
    else if (d === 'flip' || d === 'flip2') { // 前指先侧拨（板子不动），后指再往板尾划、松手 = 起跳 + 翻板
      const f2 = d === 'flip2', k1 = t < 0.2 ? 0 : e(Math.min(1, (t - 0.2) / (f2 ? 0.07 : 0.14))), k2 = t < 0.4 ? 0 : e(Math.min(1, (t - 0.4) / (f2 ? 0.08 : 0.12)));
      B = t < 0.8 ? at(0.55, -k1 * (f2 ? 3 : 1.8)) : at(0.45, 0); ob = t < 0.36 ? 1 : t < 0.8 ? 0 : 1;
      A = t < 0.8 ? at(-0.6 - k2 * (f2 ? 1.3 : 0.9), 0) : at(-0.45, 0); oa = t < 0.54 ? 1 : t < 0.8 ? 0 : 1; }
    else if (d === 'shove' || d === 'shove2') { // 后指侧着划出去、松手 = 起跳 + 转板
      const s2 = d === 'shove2', k1 = t < 0.3 ? 0 : e(Math.min(1, (t - 0.3) / (s2 ? 0.07 : 0.14)));
      A = t < 0.8 ? at(-0.6, k1 * (s2 ? 3 : 1.8)) : at(-0.45, 0); oa = t < 0.48 ? 1 : t < 0.8 ? 0 : 1; ob = t < 0.45 ? 1 : t < 0.8 ? 0 : 1; }
    else if (d === 'manual') { A = at(-0.82, 0); ob = 0; oa = 1; }
    else if (d === 'kick') { const k = Math.sin(t * 6.283); A = at(-0.6, 0); const a2 = k * 0.6; B = at(-0.6 + 1.15 * Math.cos(a2), 1.15 * Math.sin(a2) * 2.2); }
    const da = $('demoA'), db = $('demoB');
    da.style.transform = `translate(${A[0]}px,${A[1]}px)`; da.style.opacity = oa;
    db.style.transform = `translate(${B[0]}px,${B[1]}px)`; db.style.opacity = ob;
  }
}
