// 双指操控（手指必须踩在板上）：
//  · 手指要按在板子上才算「踩上板」；踩上之后滑出板边一圈之内都还算（推板、转弯不容易掉），滑太远才脱板
//  · 两指同时按下并按住不动 = 长按：附近有杆子 / 台边 / 坡顶就自动跳上去磨，松手跳下来
//  · 压在板子左/右半边 = 转弯；两指旋转也能转
//  · 两指往板头方向推 = 蹬地；推出板头自然脱板，抬起来再放回去
//  · 只用一根手指按住板尾 / 板头 = Manual / Nose Manual
//  · 后指快速往下划出板尾 = 起跳；前指侧着划出板边 = 翻板；后指侧划 = 转板；两指一起横甩 = Powerslide
import { clamp } from './util.js';

export class Input {
  constructor(el, opts) {
    this.el = el; this.opts = opts || {};
    this.ptrs = new Map(); this.events = []; this.pend = []; this.trails = [];
    this.keys = {}; this.kbT = -99; this.geo = null; this.inAir = false; this.enabled = false;
    this.anchor = null;
    const o = { passive: false };
    el.addEventListener('pointerdown', (e) => this._down(e), o);
    el.addEventListener('pointermove', (e) => this._move(e), o);
    el.addEventListener('pointerup', (e) => this._up(e), o);
    el.addEventListener('pointercancel', (e) => this._up(e, true), o);
    el.addEventListener('lostpointercapture', (e) => { if (this.ptrs.has(e.pointerId)) this._up(e, true); });
    addEventListener('blur', () => this.clear());
    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));
    for (const ev of ['gesturestart', 'gesturechange', 'touchmove']) document.addEventListener(ev, (e) => { if (this.enabled) e.preventDefault(); }, o);
  }
  get scale() { return Math.max(0.75, Math.min(innerWidth, innerHeight) / 390); }
  now() { return performance.now() / 1000; }
  ts(e) { const now = this.now(), x = e && e.timeStamp; return x > 1 && Math.abs(x / 1000 - now) < 1 ? x / 1000 : now; }
  clear() { this.ptrs.clear(); this.anchor = null; this.pend = []; this.opts.onDots && this.opts.onDots(this.ptrs); }
  // 屏幕坐标 → 板子坐标：along -1 = 板尾（后）+1 = 板头（前）；across ±1 = 板子左右边（+ 为右）
  local(x, y) {
    const g = this.geo; if (!g) return null;
    let ux = g.fx - g.rx, uy = g.fy - g.ry; const L = Math.hypot(ux, uy); if (L < 4) return null;
    ux /= L; uy /= L;
    const dx = x - (g.rx + g.fx) / 2, dy = y - (g.ry + g.fy) / 2;
    return { along: (dx * ux + dy * uy) / (L / 2), across: (dx * -uy + dy * ux) / Math.max(6, g.halfW), half: L / 2, ux, uy };
  }
  // board = 板子本身加一点余量（手指按下 / 重新踩回板上时用）；zone = 已经踩上板的手指能活动的范围（板外大约一个板宽）
  onBoard(x, y, zone) {
    const l = this.local(x, y); if (!l) return false;
    const g = this.geo;
    const mW = zone ? 1.1 + 30 / g.halfW : Math.max(0.35, 18 / g.halfW), mL = zone ? 0.6 + 30 / l.half : Math.max(0.12, 20 / l.half);
    return Math.abs(l.across) <= 1 + mW && Math.abs(l.along) <= 1 + mL;
  }
  // 每帧 / 每次移动更新手指是否还踩着板：踩着的在 zone 里就一直算；出了 zone 就松开，要重新按回板上才算
  _contact(p, t) {
    if (p.ghost) return;
    if (p.cap) { if (!this.onBoard(p.x, p.y, true)) p.cap = false; }
    else if (this.onBoard(p.x, p.y, this.inAir)) { p.cap = true; p.capT = t; p.sx = p.x; p.sy = p.y; p.stillT = t; p.lp = false; }
    p.on = p.cap;
    if (p.on) p.lastOnT = t;
  }
  _down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch (_) {}
    const t = this.ts(e), x = e.clientX, y = e.clientY;
    const ghost = !this.onBoard(x, y, this.inAir);
    // sx/sy/stillT：按下后没怎么动的起点和时间（判断长按用）；lp = 这次按下有没有一直不动
    // capT = 这根手指这一次踩上板的时刻（拨板之后重新踩上板 = 接住板）
    const p = { id: e.pointerId, x, y, x0: x, y0: y, px: x, py: y, t0: t, hist: [[t, x, y]], armed: true, flicked: false, flickT: 0, role: null, ghost, cap: !ghost, capT: ghost ? -9 : t, on: !ghost, lastOnT: ghost ? -9 : t, vt: t, sx: x, sy: y, stillT: t, lp: true };
    this.ptrs.set(e.pointerId, p);
    if (!ghost) this.trails.push(p.trail = { pts: [[x, y, t]], kind: null, end: 0 });
    this._roles(); this.anchor = null;
    this.opts.onTouch && this.opts.onTouch(ghost);
    this.opts.onDots && this.opts.onDots(this.ptrs);
  }
  _move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const t = this.ts(e);
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (evs && evs.length > 1) for (const c of evs) p.hist.push([Math.min(t, this.ts(c)), c.clientX, c.clientY]);
    else p.hist.push([t, e.clientX, e.clientY]);
    p.vt = t; p.x = e.clientX; p.y = e.clientY;
    while (p.hist.length > 2 && t - p.hist[0][0] > 0.12) p.hist.shift();
    if (!p.ghost) {
      this._contact(p, t);
      if (p.lp && Math.hypot(p.x - p.sx, p.y - p.sy) > 12 * this.scale) p.lp = false; // 动了就不算长按
      if (p.trail) { p.trail.pts.push([p.x, p.y, t]); if (p.trail.pts.length > 24) p.trail.pts.shift(); }
    }
    this.opts.onDots && this.opts.onDots(this.ptrs);
  }
  _up(e, cancel) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    if (!cancel && !p.ghost) { p.x = e.clientX; p.y = e.clientY; p.hist.push([this.ts(e), p.x, p.y]); this._flickCheck(p, this.ts(e)); }
    if (p.trail) p.trail.end = this.now();
    this.ptrs.delete(e.pointerId);
    this._roles(); this.anchor = null;
    this.opts.onDots && this.opts.onDots(this.ptrs);
  }
  _roles() {
    const arr = [...this.ptrs.values()].filter((p) => !p.ghost);
    const al = (p) => { const l = this.local(p.x, p.y); return l ? l.along : -(p.y); };
    if (arr.length >= 2) { arr.sort((a, b) => al(a) - al(b)); arr[0].role = 'back'; for (let i = 1; i < arr.length; i++) arr[i].role = 'front'; }
    else if (arr.length === 1) arr[0].role = al(arr[0]) < 0 ? 'back' : 'front';
  }
  _vel(p, t) {
    let o = p.hist[0];
    for (let i = p.hist.length - 1; i >= 0; i--) { o = p.hist[i]; if (t - p.hist[i][0] >= 0.07) break; }
    const dt = Math.max(0.008, t - o[0]);
    return [(p.x - o[1]) / dt, (p.y - o[2]) / dt, Math.hypot(p.x - o[1], p.y - o[2])];
  }
  _flickCheck(p, t) {
    const [vx, vy, dist] = this._vel(p, t), sp = Math.hypot(vx, vy), S = this.scale;
    const sens = (this.opts.sens && this.opts.sens().flick) || 1;
    const TH = 640 * S * sens;
    if (!p.armed) { if (sp < 240 * S) p.armed = true; return; }
    if (sp < TH || dist < 14 * S) return;
    if (!p.role) this._roles();
    // 两指朝相反方向绕着转 = 旋转手势，不算划板
    for (const o of this.ptrs.values()) {
      if (o === p || o.ghost) continue;
      const ov = this._vel(o, Math.max(t, o.vt || 0)), osp = Math.hypot(ov[0], ov[1]);
      let lx = p.x - o.x, ly = p.y - o.y; const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
      const rx = vx - ov[0], ry = vy - ov[1], along = Math.abs(rx * lx + ry * ly), perp = Math.abs(-rx * ly + ry * lx);
      if (osp > 0.45 * TH && perp > along * 1.4 && vx * ov[0] + vy * ov[1] < 0) return;
    }
    // 用板子方向判断“往后划”还是“侧划”
    const l = this.local(p.x, p.y);
    const ux = l ? l.ux : 0, uy = l ? l.uy : -1;
    const back = -(vx * ux + vy * uy), side = vx * -uy + vy * ux;
    // 起跳：朝板尾方向（±55°）或者朝屏幕下方（±40°）快速划
    const cb = back / sp, cd = vy / sp;
    // 力度 k：刚过门槛 = 0，门槛的 3.3 倍以上 = 1（越快跳得越高 / 转得越快）
    const k = clamp((sp / TH - 1) / 2.3, 0, 1);
    if (cb > 0.57 || (cd > 0.77 && cb > 0.2)) {
      if (this.inAir) return; // 空中往后划没有意义
      this.events.push({ type: 'pop', kind: p.role === 'front' ? 'nose' : 'tail', k });
      if (p.trail) p.trail.kind = 'pop';
    } else if (Math.abs(side) / sp > 0.64) {
      const ev = { type: 'flick', which: p.role === 'front' ? 'front' : 'back', dir: side > 0 ? 1 : -1, id: p.id, t, k };
      if (this.inAir) this.events.push(ev); else this.pend.push(ev);
      p.flickT = t;
      if (p.trail) p.trail.kind = ev.which === 'front' ? 'flip' : 'shove';
    } else return;
    p.armed = false; p.flicked = true;
    p.x0 = p.x; p.y0 = p.y;
    this.anchor = null;
  }
  _key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    if (!this.enabled) { this.keys[k] = false; return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (down && e.repeat) return;
    this.keys[k] = down;
    if (!down) return;
    this.kbT = this.now();
    const ev = { Space: { type: 'pop', kind: 'tail', k: 0.6 }, KeyN: { type: 'pop', kind: 'nose', k: 0.6 },
      KeyJ: { type: 'flick', which: 'front', dir: -1 }, KeyL: { type: 'flick', which: 'front', dir: 1 },
      KeyK: { type: 'flick', which: 'back', dir: -1 }, KeyI: { type: 'flick', which: 'back', dir: 1 },
      KeyX: { type: 'powerslide', dir: 1 }, KeyR: { type: 'reset' } }[k];
    if (ev) this.events.push(Object.assign({}, ev));
  }
  // 每帧调用一次
  update(dt, onGround) {
    const tn = this.now(), S = this.scale;
    this.inAir = !onGround;
    const all = [...this.ptrs.values()], real = all.filter((p) => !p.ghost);
    for (const p of real) this._contact(p, tn);
    this._roles();
    for (const p of real) this._flickCheck(p, Math.max(tn, p.vt || 0));
    // 地面上两指同时同向横甩 = Powerslide；单独的侧划延迟一点再交给物理（等起跳）
    if (this.pend.length >= 2) {
      for (let i = 0; i < this.pend.length; i++) for (let j = i + 1; j < this.pend.length; j++) {
        const a = this.pend[i], b = this.pend[j];
        if (a && b && a.id !== b.id && a.dir === b.dir && Math.abs(a.t - b.t) < 0.09) { this.events.push({ type: 'powerslide', dir: a.dir }); this.pend[i] = this.pend[j] = null; }
      }
      this.pend = this.pend.filter(Boolean);
    }
    this.pend = this.pend.filter((e) => { if (tn - e.t > 0.07 || this.inAir) { this.events.push(e); return false; } return true; });
    const act = real.filter((p) => p.on);
    const sens = (this.opts.sens && this.opts.sens().steer) || 1;
    let lean = 0, push = 0, brake = 0, manual = 0, twist = 0, pump = false, kick = 0;
    const recent = (q) => q.flickT && tn - q.flickT < 0.2;
    if (act.length) {
      const use = act.filter((p) => !recent(p));
      const L = (use.length ? use : act).map((p) => this.local(p.x, p.y)).filter(Boolean);
      if (L.length) {
        // 两指取平均（板子在屏幕上转动时两端偏移会互相抵消，很稳）；单指越靠近两端转向越弱，避免越转越歪
        // 偏到板边外面算转到底（不会因为手指出了板边就突然不转）
        let ac = 0; for (const l of L) ac += clamp(l.across, -1.1, 1.1); ac /= L.length;
        if (L.length === 1) ac *= clamp(1.15 - Math.abs(L[0].along), 0.15, 1);
        const dz = 0.12, m = Math.abs(ac) < dz ? 0 : (ac - Math.sign(ac) * dz) / (1 - dz);
        // 中间细、两边足：小偏移转得柔一点，好微调；偏到边上转得最急
        const mc = Math.sign(m) * Math.min(1.1, 0.45 * Math.abs(m) + 0.55 * m * m);
        lean = mc * 1.15 * sens;
      }
    }
    // 两指旋转（空中只要是踩过板的两根手指就算，不要求一直压在板上）
    const tw = this.inAir ? real : act;
    if (tw.length >= 2) {
      {
        const ids = tw.slice().sort((a, b) => a.id - b.id), A = ids[0], B = ids[1];
        const ang = Math.atan2(B.y - A.y, B.x - A.x), sig = A.id + ',' + B.id;
        if (!this.anchor || this.anchor.sig !== sig) this.anchor = { sig, ang, prev: ang };
        let d = ang - this.anchor.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        let dd = ang - this.anchor.prev; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        this.anchor.prev = ang;
        lean += d * 1.5 * sens;
        const sp = [A, B].map((q) => { const v = this._vel(q, Math.max(tn, q.vt || 0)); return Math.hypot(v[0], v[1]); });
        const hi = Math.max(sp[0], sp[1]), lo = Math.min(sp[0], sp[1]);
        const notFlick = !(hi > 380 * S && lo < hi * 0.35) && !tw.some(recent);
        if (notFlick) twist = -dd * 1.25;
        // Kickturn（地面上）：两指都在板上，手指是横着绕着转（不是往前推）；转过 4° 以后才开始跟手，免得推板时手抖也转
        if (!this.inAir && act.length === 2 && real.length === 2 && notFlick) {
          // 判断「绕着转」：动的手指主要是垂直于两指连线移动（推板时是沿连线 / 两指平行移动，连线角度基本不变）
          let lx = B.x - A.x, ly = B.y - A.y; const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
          let rot = true;
          for (const q of [A, B]) { const mx = q.x - q.px, my = q.y - q.py, rad = Math.abs(mx * lx + my * ly), per = Math.abs(-mx * ly + my * lx); if (rad > per * 0.9 + 0.6) rot = false; }
          if (Math.abs(d) > 0.07) this.anchor.kick = true;
          if (rot && this.anchor.kick) kick = -dd;
        }
        if (!act.length) lean = 0;
      }
    } else this.anchor = null;
    if (act.length) {
      // 沿板子方向的移动：往前 = 蹬地，往后慢慢拉 = 刹车
      let fwd = 0, n = 0, csp = 0;
      for (const p of act) {
        const l = this.local(p.x, p.y); if (!l) continue;
        const mx = p.x - p.px, my = p.y - p.py;
        fwd += mx * l.ux + my * l.uy; n++;
        csp += Math.hypot(mx, my) / Math.max(dt, 1e-3);
      }
      if (n) {
        fwd /= n; csp /= n;
        if (fwd > 0) push = Math.min(1.2, fwd / (70 * S)) * (act.length >= 2 ? 1 : 0.7);
        else if (fwd < 0 && act.length >= 2 && -fwd / Math.max(dt, 1e-3) < 600 * S) brake = clamp(-fwd / Math.max(dt, 1e-3) / (300 * S), 0, 1);
        pump = act.length >= 2 && csp < 350 * S;
      }
      // 单指按在板尾 / 板头 = Manual
      if (act.length === 1 && real.length === 1) {
        const l = this.local(act[0].x, act[0].y);
        if (l && l.along <= -0.55) manual = 0.3 + (-l.along - 0.55) * 1.22;
        else if (l && l.along >= 0.55) manual = -(0.3 + (l.along - 0.55) * 1.22);
      }
    }
    let hold = false;
    // 长按要是「刚按下」的手指：按下后 0.35～2 秒内有效（一直按着滑的手指不算，免得路过杆子被吸上去）
    const lps = act.filter((p) => p.lp && tn - p.stillT >= 0.35 && tn - p.stillT <= 2);
    if (lps.length >= 2) {
      lps.sort((a, b) => a.stillT - b.stillT);
      hold = lps[lps.length - 1].stillT - lps[0].stillT <= 0.3;
    }
    for (const p of all) { p.px = p.x; p.py = p.y; }
    // 键盘
    const K = this.keys;
    const kl = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    if (kl) lean = kl;
    if (K.KeyW || K.ArrowUp) { push += 3.2 * dt; pump = true; }
    if (K.KeyS || K.ArrowDown) brake = 1;
    if (K.KeyM) manual = 0.6; if (K.KeyB) manual = -0.6;
    if (K.KeyG) hold = true; // 键盘：按住 G = 长按磨杆
    const spinRate = (K.KeyQ ? 6.5 : 0) - (K.KeyE ? 6.5 : 0);
    const auto = tn - this.kbT < 4 || !!(this.opts.easy && this.opts.easy()); // 键盘 / 简单模式：自动接板
    const caught = act.length > 0 || real.some((p) => tn - p.lastOnT < 0.2) || auto;
    let capT = -9; for (const p of act) if (p.capT > capT) capT = p.capT;
    const fb = act.length === 1 ? (act[0].role === 'back' ? 1 : -1) : 0;
    // 清理旧光迹
    this.trails = this.trails.filter((tr) => !tr.end || tn - tr.end < 0.4);
    // 键盘：Z / C = Kickturn 左 / 右
    if (K.KeyZ) kick += 4 * dt; if (K.KeyC) kick -= 4 * dt;
    return { lean: clamp(lean, -1.25, 1.25), push, brake, manual: clamp(manual, -1.4, 1.4), twist, spinRate, fingers: act.length, touching: real.length, caught, capT, auto, fb, pump, hold, kick: clamp(kick, -0.5, 0.5) };
  }
  drain() { const e = this.events; this.events = []; return e; }
}
