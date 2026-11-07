// 滑板物理：地面滚动 / 空中 / 磨杆 / 摔倒。位置 p 是轮子着地点。
import { Vector3, Quaternion, Matrix4 } from 'three';
import { clamp, TAU, damp } from './util.js';
import { railClosest, railPosts } from './terrain.js';

export const G = 9.81;
// 空中用小一点的重力：滞空更长（像 Touchgrind 一样有时间做动作），跳的高度和以前差不多
export const G_AIR = 5.5;
const G_TRANS = 8.2; // 从四分之一管 / 弧形坡飞出去：用接近真实的重力（不然 1.3 米的坡能飞到 3 米高）
const STEP_TOL = 0.035;          // 能直接滚上去的小坎
// 力度决定结果：划得越快跳得越高；拨得越重，板子转得越多、也转得越快，然后自己慢慢停下（不会一直转很多圈）
const POP_MIN = 2.4, POP_RNG = 1.2;            // 起跳速度 2.4～3.6 m/s（空中重力 5.5：高度约 0.5～1.2 米，滞空约 0.9～1.3 秒）
const popV = (k) => POP_MIN + POP_RNG * clamp(k || 0, 0, 1);
// 翻板 / 转板（2026-11-07 第 5 版。用户："没转够、落地不稳这些那个游戏没有，不够丝滑"，圈数"不要限制"）：
//  · 板子每次都转完整的圈（翻板整圈、转板整半圈），最后轻轻停在正的位置，不会停在半路
//  · 拨得越重圈数越多，没有固定上限；只受滞空时间限制（跳得低转不了那么多圈）。连着再拨还能加
//  · 转的速度按还能飞多久排：大约用掉 72% 的时间转完，剩下的时间留给接板
// 手机上随手一拨的力度大多在 0.1～0.45
const TURN_K0 = 0.18, TURN_K = 0.27;          // 力度 0.45 以下一圈，0.45～0.72 两圈，0.72～0.99 三圈，1 四圈（转板按半圈算）
const SPIN_RATE_MAX = 4;                      // 平均每秒最多转 4 圈（转板 4 个半圈）：滞空不够就少转几圈
const SPIN_FILL = 0.72;                       // 用掉还能飞的时间的 72% 转完
const SPIN_D_MIN = 0.3, SPIN_D_PER = 0.8;     // 转的时间最少 0.3 秒；每圈最多 0.8 秒（飞得很久时转一圈也不会慢得像慢动作）
const SPIN_EASE = 1.8;                        // 先快后慢：一开始的速度约是平均速度的 1.8 倍，最后慢慢停在正的位置
const CATCH_AHEAD = 1 / 3;                    // 离下一个"正"还差 1/3 圈（转板 1/3 个半圈）以内按回板上：脚顺手把板带正（更早按回去 = 把板踩停了，会摔）
const CATCH_BEHIND = 0.09;                    // 刚转过"正"一点点（翻板约 32°，转板约 16°）按回去也算，踩回正的位置
const PERFECT_PRE = 0.15, PERFECT_POST = 0.2; // 踩点：板子转完前 0.15 秒到转完后 0.2 秒之间接住（多给分）
const MIN_SPIN_AIR = 0.3;                     // 离落地不到 0.3 秒再拨就不受理（转不完）
const FLICK_ARM = 0.5;                        // 先拨再起跳：拨完 0.5 秒内起跳都算（起跳的同时出招）
const LAND_TOL = 0.72;                        // 落地时板子离"正"还差 41° 以内才站得住
const spinEase = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), SPIN_EASE);
// 离最近的"正着"差多少（带正负）
const offUp = (a, unit) => a - Math.round(a / unit) * unit;
// 板子轮廓点（板子自己的坐标，原点 = 两个支架下面的地面中点）：板头、板尾、板边、四个轮子底。用来防止板子穿进地面和东西里
const CY = 0.06, TRUCK_Z = 0.18;
const HULL = [
  [0, 0.133, 0.4], [0, 0.133, -0.4],
  [0.105, 0.08, 0.22], [-0.105, 0.08, 0.22], [0.105, 0.08, -0.22], [-0.105, 0.08, -0.22], [0.105, 0.08, 0], [-0.105, 0.08, 0],
  [0.1, 0, 0.18], [-0.1, 0, 0.18], [0.1, 0, -0.18], [-0.1, 0, -0.18],
];
const NW = 8; // 前 8 个点是板子本身，后 4 个是轮子
// 和圆杆、立柱碰撞用的板子形状（板子自己的坐标，中心 x/y/z + 半宽/半高/半长）：板面中段、翘起的板头、板尾、前后支架加轮子
const BOARD_BOX = [
  [0, 0.07, 0, 0.105, 0.013, 0.29], [0, 0.097, 0.345, 0.095, 0.037, 0.058], [0, 0.093, -0.34, 0.095, 0.035, 0.062],
  [0, 0.03, 0.18, 0.105, 0.03, 0.04], [0, 0.03, -0.18, 0.105, 0.03, 0.04],
];
const RL_A = [0, 0, 0], RL_B = [0, 0, 0];
const HP = HULL.map(() => new Vector3());
const PEN = { up: 0, upI: -1, wall: 0, wallI: -1 };
const NOWALL = {}; // 在弧形坡、大斜坡上滑时：只看世界边上的墙（坡顶和平台交界那里，板子的轮子会擦到一点点平台，不算撞墙）
const MAX_PUSH = 7.2;
// 压板转向：手指压哪边，板面就往哪边倾（像桥胶弹簧一样稍微慢一点跟上），倾斜让支架转动 → 板子沿弧线走
// 弯的大小 = 倾斜程度 × 速度：停着几乎不转；滑得快时弯会变大一些（不会急转甩出去）
const ROLL_MAX = 0.24;           // 最大侧倾约 14°
const ROLL_K = 420, ROLL_C = 30; // 侧倾弹簧（越大跟得越快）
const R_MIN = 1.0;               // 压到底时最小转弯半径（米）
const A_LAT = 13;                // 最大侧向加速度（m/s²），限制高速时的急转
const KICK_S0 = 1.0, KICK_S1 = 2.8; // Kickturn：低于 1 m/s 完全跟手，2.8 m/s 以上不起作用
const SLIP_DEC = 10, SLIP_MAX = 2.5; // 落地侧滑：轮子横着蹭地的减速度、最大侧滑速度
const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), XA = new Vector3(1, 0, 0), tvA = new Vector3(), tvB = new Vector3(), tq0 = new Quaternion();
const qA = { h: 0, gx: 0, gz: 0, f: null }, qB = { h: 0, gx: 0, gz: 0, f: null }, qC = { h: 0, gx: 0, gz: 0, f: null }, qD = { h: 0, gx: 0, gz: 0, f: null };
const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), qt = new Quaternion(), m4 = new Matrix4();

const fU = new Vector3(), fF = new Vector3(), fR = new Vector3();
function frameQuat(out, up, fwd) {
  // 用 up 和 forward 建立正交基（forward 投影到 up 的垂直平面）；只用自己的临时变量，避免互相覆盖
  fU.copy(up).normalize();
  fF.copy(fwd).addScaledVector(fU, -fwd.dot(fU));
  if (fF.lengthSq() < 1e-8) { fF.set(0, 0, 1).addScaledVector(fU, -fU.z); if (fF.lengthSq() < 1e-8) fF.set(1, 0, 0).addScaledVector(fU, -fU.x); }
  fF.normalize();
  fR.crossVectors(fU, fF).normalize();
  m4.makeBasis(fR, fU, fF);
  return out.setFromRotationMatrix(m4);
}

export class Skater {
  constructor(T, cb) {
    this.T = T; this.cb = cb || {};
    this.p = new Vector3(); this.v = new Vector3(); this.n = new Vector3(0, 1, 0);
    this.qa = new Quaternion(); this.qv = new Quaternion(); this.bq = new Quaternion(); this.bw = new Vector3();
    this.bakeQ = new Quaternion(); this.baked = false;
    this.fwd = new Vector3(0, 0, 1); this.I = {};
    this.reset(0, 0, 0);
  }
  reset(x, z, yaw) {
    if (!isFinite(yaw)) yaw = 0;
    const q = this.T.query(x, z, qA);
    this.p.set(x, q.h, z); this.v.set(0, 0, 0); this.n.set(-q.gx, 1, -q.gz).normalize();
    this.feat = q.f; this.gx = q.gx; this.gz = q.gz;
    this.mode = 'ground'; this.s = 0; this.heading = yaw; this.fakie = false; this.lean = 0;
    this.roll = 0; this.rollV = 0; this.slip = 0; this.kickAcc = 0; this.kickT = 0; this.kickPitch = 0; this.yawRate = 0; this.gTilt = 0;
    this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.flipW = this.shoveW = 0; this.spin = 0; this.popPitch = 0; this.shoveBaked = 0;
    this.impA = this.impT = this.impW = 0; // Impossible：板子竖着绕后支架翻（翘板方向的整圈）
    this.manual = null; this.manLock = false; this.manPitch = 0; this.manA = 0; this.manReqT = 0; this.slide = null;
    this.air = null; this.grind = null; this.hop = null; this.bailT = 0; this.buf = [];
    this.safe = { x, z, yaw }; this.safeT = 0; this.lastRail = null; this.lastRailT = -9;
    this.wheelRot = 0; this.time = 0; this.impactCD = 0;
    this._groundFrame();
    this._spawnClear();
  }
  // 复活点附近找一个板子整块都不碰东西的位置（最多挪 1.5 米）
  _spawnClear() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const tryAt = (x, z) => {
      const q = this.T.query(x, z, qA); if (q.wall) return false;
      if (Math.abs(q.gx) + Math.abs(q.gz) > 0.02) return false;
      if (!(this._penAt(x, z, this._hull(x, q.h, z, this.qv, 0, 0, 0)).wall <= 0 && PEN.up <= 0.002)) return false;
      return this._rodPen(x, q.h, z, this.qv, 0, 0, 0, null).d <= 0.001; // 也不能压着立柱 / 杆子
    };
    if (tryAt(this.p.x, this.p.z)) return;
    for (let r = 0.15; r <= 1.5; r += 0.15) for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, x = this.p.x + (Math.cos(a) * fz + Math.sin(a) * fx) * r, z = this.p.z + (-Math.cos(a) * fx + Math.sin(a) * fz) * r;
      if (tryAt(x, z)) { const q = this.T.query(x, z, qA); this.p.set(x, q.h, z); this.n.set(-q.gx, 1, -q.gz).normalize(); this.gx = q.gx; this.gz = q.gz; this.feat = q.f; this._groundFrame(); return; }
    }
  }
  speed() { return this.mode === 'ground' ? this.s : this.mode === 'grind' && this.grind ? Math.abs(this.grind.sp) : this.v.length(); }
  // 摄像机跟随的方向（行进方向）
  travelYaw() {
    if (this.mode === 'ground') return this.heading;
    if (this.mode === 'grind' && this.grind) { const r = this.grind.r, k = this.grind.sp >= 0 ? 1 : -1; return Math.atan2(r.dx * k, r.dz * k); }
    const hv = Math.hypot(this.v.x, this.v.z);
    if (hv > 1.2) return Math.atan2(this.v.x, this.v.z);
    v1.copy(Z).applyQuaternion(this.qv);
    return Math.hypot(v1.x, v1.z) > 0.3 ? Math.atan2(v1.x, v1.z) : NaN;
  }
  _tangent(out, heading) {
    const fx = Math.sin(heading), fz = Math.cos(heading), m = this.gx * fx + this.gz * fz;
    return out.set(fx, m, fz).normalize();
  }
  _groundFrame() {
    this._tangent(this.fwd, this.heading);
    if (this.fakie) this.fwd.negate();
    if (this.slide && this.slide.ang) { qt.setFromAxisAngle(this.n, this.slide.ang); this.fwd.applyQuaternion(qt); }
    frameQuat(this.qv, this.n, this.fwd);
  }
  // 横甩急停
  powerslide(dir) {
    if (this.mode !== 'ground' || this.s < 1.6 || this.manual || this.slide) return false;
    this.slide = { t: 0, dir: dir || 1, ang: 0, v0: this.s, scored: false };
    this.cb.onSlide && this.cb.onSlide(true, this.slide);
    return true;
  }
  _slideStep(dt, s) {
    const sl = this.slide; sl.t += dt;
    const active = sl.t < 0.8 && s > 0.7;
    const target = active ? sl.dir * 1.3 : 0;
    sl.ang += (target - sl.ang) * Math.min(1, dt * 14);
    if (active) s = Math.max(0, s - 6.5 * dt);
    else if (!sl.scored) { sl.scored = true; this.cb.onSlide && this.cb.onSlide(false, sl); }
    if (!active && Math.abs(sl.ang) < 0.04) this.slide = null;
    return s;
  }
  // 落地时板子还侧着一点（剩下的翻板角）：以低的那边轮子为支点，板子整体要抬高一点，轮子才不会陷进地里
  // 还有一种：原地转身 / Manual 把一头翘起来，同时另一头的轮子被坡顶起来，两个翘法的支点不在同一头，板子也要抬高一点
  groundLift() {
    if (this.mode !== 'ground') return 0;
    let L = 0;
    const f = this.flipA; if (f) L = Math.max(0, 0.1 * Math.abs(Math.sin(f)) - CY * (1 - Math.cos(f)));
    const g = this.gTilt;
    if (g) { let o = this.manPitch + this.popPitch + this.kickPitch; if (this.fakie) o = -o; if (o * g < 0) L += 2 * TRUCK_Z * Math.sin(Math.min(Math.abs(o), Math.abs(g))); }
    return L;
  }
  // 画面用的翘板角度（按板子自身方向；Fakie 时方向相反）
  visPitch() {
    const fk = this.mode === 'air' ? !!(this.air && this.air.fakie) : this.fakie;
    let p = this.manPitch + this.popPitch + this.kickPitch;
    if (fk) p = -p;
    if (this.mode === 'ground') p += this.gTilt; // 前轮 / 后轮先爬上坡：板子跟着翘（按板子自己的方向算，不用跟着 Fakie 反过来）
    if (this.mode === 'grind' && this.grind) p += this.grind.pitchLocal || 0;
    if (this.mode === 'air') p += this.impA || 0; // Impossible 竖着翻的角度（绕后支架，和翘板同一个轴）
    return p;
  }

  /* ---------------- 手势 ---------------- */
  pop(kind, k) {
    k = clamp(k || 0, 0, 1);
    if (this.mode === 'ground') {
      this._groundVel(v1);
      const pv = popV(k);
      v1.x += this.n.x * 0.6 * pv; v1.z += this.n.z * 0.6 * pv; v1.y += (this.n.y * 0.6 + 0.4) * pv;
      this._toAir(v1, this.feat, this.gx, this.gz, kind);
    } else if (this.mode === 'grind') {
      if (this.time < (this.noPopT || 0)) return false; // 刚在杆上侧划转了 90°：那根手指松开不算起跳
      const g = this.grind, r = g.r;
      v1.set(r.dx, r.dy, r.dz).multiplyScalar(g.sp); v1.y += popV(k) * 0.88;
      // 从杆上起跳：往旁边地势低的一侧带一点（跳下杆，不会又落回同一根杆上）
      if (g.type !== 'stall') { const hl = Math.hypot(r.dx, r.dz) || 1, px = r.dz / hl, pz = -r.dx / hl, side = this.T.height(this.p.x + px * 0.5, this.p.z + pz * 0.5) <= this.T.height(this.p.x - px * 0.5, this.p.z - pz * 0.5) ? 1 : -1; v1.x += px * side * 0.9; v1.z += pz * side * 0.9; }
      if (g.type === 'stall') { v1.x = -g.side[0] * 0.75; v1.z = -g.side[1] * 0.75; v1.y = popV(k) * 0.8; } // Stall 起跳：往边那一头跳上去
      this.lastRail = r; this.lastRailT = this.time;
      this._endGrind('pop');
      this.p.y += 0.04;
      this._toAir(v1, null, 0, 0, kind, true);
    } else if (this.mode === 'air' && this.air && !this.air.popped && this.air.t < 0.12) {
      // 刚离地的一瞬间也允许起跳（土狼时间）
      this.v.y = Math.max(this.v.y, 0) + popV(k) * 0.9;
      this.air.popped = true; this.air.pop = kind; this.popPitch = kind === 'nose' ? -0.45 : 0.45;
      this.cb.onPop && this.cb.onPop(kind);
      for (const b of this.buf) this._applyFlick(b.which, b.dir, b.k, b.clock);
      this.buf.length = 0;
    } else return false;
    return true;
  }
  // k = 拨的力度 0～1（越大转得越快）；clock = 拨的那一刻（输入的时钟）：之后重新按回板上的手指才算接住板
  // 没有 clock（键盘、程序调用）= 自动在合适的时候接板
  flick(which, dir, k, clock) {
    if (this.mode === 'air' && this.air) this._applyFlick(which, dir, k, clock);
    else if (this.mode === 'grind' && which === 'back' && this.grind) { if (this._grindTurn(dir)) this.noPopT = this.time + 0.45; } // 磨杆时后指侧划：板子在杆上转 90°（50-50 ↔ Boardslide），松手不跳
    else if (this.mode !== 'bail') { this.buf.push({ which, dir, k, clock, t: this.time }); if (this.buf.length > 4) this.buf.shift(); }
  }
  // 还能飞多久（秒）：按现在的速度和重力往前推，直到往下掉时碰到下面的地面（落到台子上、坡上也算）
  _airLeft() {
    const a = this.air, g = a && a.fromTrans ? G_TRANS : G_AIR, T = this.T, h = 1 / 60;
    let x = this.p.x, y = this.p.y, z = this.p.z, vy = this.v.y;
    for (let t = h; t < 4; t += h) {
      x += this.v.x * h; z += this.v.z * h; vy -= g * h; y += vy * h;
      if (vy < 0 && y <= T.height(x, z)) return t;
    }
    return 4;
  }
  // 往下掉的路上会不会落到能磨的杆子 / 台边上（这时后指侧划只转 90°，横着落上去 = Boardslide / Lipslide）
  _railAhead() {
    const a = this.air, g = a && a.fromTrans ? G_TRANS : G_AIR, h = 1 / 60, rails = this.T.rails;
    let x = this.p.x, y = this.p.y, z = this.p.z, vy = this.v.y;
    for (let t = h; t < 3; t += h) {
      x += this.v.x * h; z += this.v.z * h; vy -= g * h; y += vy * h;
      if (vy >= 0) continue;
      for (const r of rails) {
        if (x < Math.min(r.ax, r.bx) - 0.4 || x > Math.max(r.ax, r.bx) + 0.4 || z < Math.min(r.az, r.bz) - 0.4 || z > Math.max(r.az, r.bz) + 0.4) continue;
        const c = railClosest(r, x, z);
        if (c.d < 0.3 && y < c.y + 0.3 && y > c.y - 0.12) return r;
      }
      if (y < this.T.height(x, z)) return null;
    }
    return null;
  }
  _applyFlick(which, dir, k, clock) {
    const a = this.air;
    if (!a || a.landed || this.hop) return;
    const left = this._airLeft();
    if (left < MIN_SPIN_AIR) return; // 马上要落地，转不完了
    const auto = clock == null || !!(this.I && this.I.auto);
    k = clamp(k == null ? 0.3 : k, 0, 1);
    const imp = which === 'imp', flip = which === 'front' || imp, key = imp ? 'pI' : flip ? 'pF' : 'pS';
    const live = a.flicked && !a.caught; // 上一下还没接住：接着加圈
    // 转板时下面是杆子 / 台边：只转 90°（半个 Shove-it），横着落上去就是 Boardslide / Lipslide
    const quarter = !flip && !(live && a.pS) && !!this._railAhead();
    const unit = flip ? TAU : quarter ? Math.PI / 2 : Math.PI;
    if (imp) dir = 1; // Impossible 只往一个方向翻（板头往上、从后脚这边绕一圈）
    if (!live) { this._settle(); a.pF = a.pS = a.pI = null; a.flipGoal = this.flipA; a.shoveGoal = this.shoveA; } // 接住以后又拨（同一跳里再做一个招）：重新开始
    const P = a[key], ang = imp ? this.impA : flip ? this.flipA : this.shoveA;
    if (P && P.u < 1 && Math.sign(P.g - P.s) !== dir) return; // 正往一边转的时候往反方向拨：不理
    // 力度 → 圈数（没有固定上限），再按还能飞多久限制：平均每秒最多 4 圈，跳得低就少转几圈，但第一下至少转一圈
    const want = quarter || imp ? 1 : 1 + Math.max(0, Math.floor((k - TURN_K0) / TURN_K + 1e-9)); // Impossible 一次一圈
    const avail = left * SPIN_FILL;
    const base = P ? P.g : Math.round(ang / unit) * unit; // 从现在要停的那个"正"接着往下加
    const rem = Math.abs(base - ang) / unit;
    const n = Math.min(want, Math.max(P ? 0 : 1, Math.floor(avail * SPIN_RATE_MAX - rem + 1e-9)));
    if (n <= 0) return;
    const g = base + dir * n * unit, tot = Math.abs(g - ang) / unit;
    a[key] = { s: ang, g, D: clamp(avail, quarter ? 0.2 : SPIN_D_MIN, tot * (quarter ? 0.5 : SPIN_D_PER)), u: 0, t0: a.t, unit };
    if (imp) a.impGoal = g; else if (flip) { a.flipGoal = g; a.flipDir = dir; } else { a.shoveGoal = g; a.shoveDir = dir; }
    a.flicked = true; a.caught = false; a.guide = null; a.perfect = false; a.autoCatch = auto; a.flickClock = clock == null ? null : clock;
    this.cb.onFlick && this.cb.onFlick(which, dir, k);
  }
  // 按计划转到这一步的角度（先快后慢，最后停在正的位置）
  _planStep(P, dt, ang) {
    if (!P) return ang;
    P.u = Math.min(1, P.u + dt / P.D);
    return P.s + (P.g - P.s) * spinEase(P.u);
  }
  // 现在是不是该接板了：拨过之后，有手指重新按回板上（或自动接板）
  _shouldCatch(I) {
    const a = this.air;
    if (a.autoCatch || I.auto) {
      // 自动接板（键盘 / 简单模式）：转完就接；快落地了也接
      if ((!a.pF || a.pF.u >= 1) && (!a.pS || a.pS.u >= 1) && (!a.pI || a.pI.u >= 1)) return true;
      if (this.v.y < 0) { const hb = this.p.y - this.T.height(this.p.x, this.p.z); if (hb < -this.v.y * 0.09) return true; }
      return false;
    }
    return (I.fingers | 0) > 0 && I.capT != null && a.flickClock != null && I.capT > a.flickClock;
  }
  // 某个方向现在接的话停在哪：离下一个"正"不到 1/3 圈 → 带到那个"正"；刚转过一点点 → 踩回去；都不是 → 踩停在原地（落地会摔）
  _catchPick(ang, P, dir, unit) {
    if (!P) return { t: ang, ok: true, ahead: 0 };
    if (P.unit) unit = P.unit; // 半个 Shove-it（90°）按 90° 算
    const d = dir || Math.sign(P.g - P.s) || 1, x = (ang * d) / unit;
    const nx = Math.ceil(x - 1e-6), pv = Math.floor(x + 1e-6);
    if (nx >= 1 && nx - x <= CATCH_AHEAD) return { t: nx * unit * d, ok: true, ahead: nx - x };
    if (pv >= 1 && x - pv <= CATCH_BEHIND) return { t: pv * unit * d, ok: true, ahead: pv - x };
    return { t: ang, ok: false, ahead: nx - x };
  }
  _catch() {
    const a = this.air; a.caught = true; a.catchT = a.t;
    // 手指按回板上 = 脚踩住：快转到"正"了就顺手带过去（约 0.1 秒，接着原来的转速，不会"啪"一下）；板子刚转起来就按回去 = 踩停了
    const F = this._catchPick(this.flipA, a.pF, a.flipDir, TAU), S = this._catchPick(this.shoveA, a.pS, a.shoveDir, Math.PI), Im = this._catchPick(this.impA, a.pI, 1, TAU);
    this.flipT = F.t; this.shoveT = S.t; this.impT = Im.t;
    const dd = Math.max(Math.abs(F.t - this.flipA) / TAU, Math.abs(S.t - this.shoveA) / Math.PI, Math.abs(Im.t - this.impA) / TAU);
    // 带正用多久：一般约 0.1 秒；板子转得快、离"正"又近时短一点，让它从原来的转速匀匀地减到 0（不会一下子变慢）
    let D = clamp(dd * 0.35, 0.04, 0.14);
    for (const [dp, v] of [[F.t - this.flipA, this.flipW], [S.t - this.shoveA, this.shoveW], [Im.t - this.impA, this.impW]]) if (dp * v > 0) D = Math.min(D, (2 * Math.abs(dp)) / Math.abs(v));
    a.guide = { f0: this.flipA, s0: this.shoveA, i0: this.impA, vf: this.flipW, vs: this.shoveW, vi: this.impW, u: 0, D: Math.max(0.02, D) };
    a.catchErr = Math.max(Math.abs(F.t - this.flipA), Math.abs(S.t - this.shoveA), Math.abs(Im.t - this.impA));
    // 踩点：转到底的那一刻前后接住
    const end = (P) => (P ? P.t0 + P.D : -9), tEnd = Math.max(end(a.pF), end(a.pS), end(a.pI));
    const full = (!a.pF || Math.abs(F.t - a.pF.g) < 1e-3) && (!a.pS || Math.abs(S.t - a.pS.g) < 1e-3) && (!a.pI || Math.abs(Im.t - a.pI.g) < 1e-3);
    a.perfect = !a.autoCatch && !(this.I && this.I.auto) && F.ok && S.ok && Im.ok && full && a.t >= tEnd - PERFECT_PRE && a.t <= tEnd + PERFECT_POST; // 自动接板（键盘 / 简单模式）不算
    const bad = !F.ok ? 'flip' : !S.ok ? 'shove' : !Im.ok ? 'imp' : null;
    a.catchInfo = { which: bad || (a.pF ? 'flip' : 'shove'), kind: bad ? 'early' : a.perfect ? 'perfect' : 'ok',
      deg: bad ? Math.round((bad === 'flip' ? F.ahead * 360 : bad === 'imp' ? Im.ahead * 360 : S.ahead * ((a.pS && a.pS.unit) || Math.PI) * 180 / Math.PI)) : 0 };
    this.flipW = this.shoveW = this.impW = 0;
    this.cb.onCatch && this.cb.onCatch(a.catchErr);
  }
  // 接住后：从接住那一刻的角度和转速，平滑地带到要停的"正"（三次曲线，速度连续）
  _guideStep(dt) {
    const G = this.air && this.air.guide; if (!G || G.u >= 1) return;
    G.u = Math.min(1, G.u + dt / G.D);
    const u = G.u, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2;
    const her = (p0, p1, v0) => {
      const dp = p1 - p0; let m = Math.sign(v0) === Math.sign(dp) ? v0 * G.D : 0;
      if (Math.abs(m) > 2 * Math.abs(dp)) m = 2 * dp; // 不冲过头
      return h00 * p0 + h10 * m + h01 * p1;
    };
    this.flipA = her(G.f0, this.flipT, G.vf); this.shoveA = her(G.s0, this.shoveT, G.vs); this.impA = her(G.i0 || 0, this.impT, G.vi || 0);
  }
  // 落地 / 上杆的那一刻：接住后还在带正的，直接放到正的位置
  _settle() {
    const a = this.air; if (!a || !a.caught || !a.guide) return;
    this.flipA = this.flipT; this.shoveA = this.shoveT; this.impA = this.impT; a.guide.u = 1;
  }
  // 拨过板之后：现在按回板上能不能站住（给提示圈用）。0 = 现在接会摔，越接近 1 越好
  catchHint() {
    const a = this.air; if (this.mode !== 'air' || !a || !a.flicked || a.caught) return 0;
    const one = (ang, P, dir, unit) => {
      if (!P) return 1; // 这个方向没拨
      if (P.unit) unit = P.unit;
      const d = dir || 1, x = (ang * d) / unit, nx = Math.ceil(x - 1e-6), pv = Math.floor(x + 1e-6);
      if (nx >= 1 && nx - x <= CATCH_AHEAD) return 1 - (0.7 * (nx - x)) / CATCH_AHEAD;
      if (pv >= 1 && x - pv <= CATCH_BEHIND) return 0.9;
      return 0;
    };
    return Math.min(one(this.flipA, a.pF, a.flipDir, TAU), one(this.shoveA, a.pS, a.shoveDir, Math.PI), one(this.impA, a.pI, 1, TAU));
  }
  // 空中这块板子还要不要接（给提示圈用）
  needsCatch(I) {
    const a = this.air; if (this.mode !== 'air' || !a || this.hop) return false;
    if (a.flicked) return !a.caught;
    return (a.popped || a.t > 0.3) && !((I && I.fingers) > 0);
  }
  // 落地 / 上杆时板子正不正：不正返回原因（没翻够 / 翻过头 / 没转够 / 转过头 / 没接住）
  // quarter = 落到杆子 / 台边上：转板转了 90°（横着）也算正（就是 Boardslide / Lipslide）
  _landFail(needCatch, quarter) {
    const a = this.air;
    if (needCatch) {
      const caught = a && a.flicked ? a.caught : !!this.I.caught;
      if (!caught) return 'catch';
    }
    const fd = (a && a.flipDir) || Math.sign(this.flipA) || 1, sd = (a && a.shoveDir) || Math.sign(this.shoveA) || 1;
    // 按转的方向算：一圈（半圈）都没转完、或者离下一个"正"还差一大半 = 没转够；转完了又多转了一点 = 转过头
    const kind = (ang, d, unit) => {
      const x = ang * d, done = Math.floor(x / unit), r = x - done * unit;
      return r >= unit / 2 || done <= 0 ? 'Short' : 'Over';
    };
    if (Math.abs(offUp(this.flipA, TAU)) > LAND_TOL) return 'flip' + kind(this.flipA, fd, TAU);
    if (Math.abs(offUp(this.impA || 0, TAU)) > LAND_TOL) return 'flip' + kind(this.impA, 1, TAU); // Impossible 没翻完
    const su = quarter ? Math.PI / 2 : Math.PI;
    if (Math.abs(offUp(this.shoveA, su)) > (quarter ? 0.5 : LAND_TOL)) return 'shove' + kind(this.shoveA, sd, su);
    return null;
  }

  /* ---------------- 板子轮廓（防穿模） ---------------- */
  // 板子各轮廓点的世界坐标：位置 (px,py,pz)、朝向 q、翘板角 pitch、翻板角 flip、转板角 shove（和画面 poseBoard 的算法一样）
  _hull(px, py, pz, q, pitch, flip, shove) {
    const pv = pitch >= 0 ? -TRUCK_Z : TRUCK_Z;
    const cf = Math.cos(flip), sf = Math.sin(flip), cs = Math.cos(shove), ss = Math.sin(shove), cp = Math.cos(-pitch), sp = Math.sin(-pitch);
    for (let i = 0; i < HULL.length; i++) {
      let x = HULL[i][0], y = HULL[i][1] - CY, z = HULL[i][2];
      let x2 = x * cf - y * sf, y2 = x * sf + y * cf; x = x2; y = y2 + CY;      // 翻板：绕板子长轴
      x2 = x * cs + z * ss; let z2 = -x * ss + z * cs; x = x2; z = z2;          // 转板：绕竖轴
      z -= pv; y2 = y * cp - z * sp; z2 = y * sp + z * cp; y = y2; z = z2 + pv; // 翘板：绕支架下面的横轴
      HP[i].set(x, y, z).applyQuaternion(q); HP[i].x += px; HP[i].y += py; HP[i].z += pz;
    }
    return HP;
  }
  // 轮廓点有没有穿进去，以及怎么出来最近：往上抬出表面（up）还是往旁边推出侧面（wall，比如板头戳进台子侧面、世界边上的墙）
  // 两种都量一下距离，取近的那种（落到台面边上是往上抬，撞到台子侧面是往旁边推）
  // 只有平顶的东西（台子、平台、台阶、世界边上的墙）才算"侧面"；坡道、弧形坡这种连续的斜面只会往上抬（不然在大坡上会被当成撞墙）
  // 在地上滑时：板子脚下这块地形自己不算（比如在弧形坡上，板头离坡面很近不算撞墙），只看旁边别的东西
  _pen(pts, from, to) {
    PEN.up = 0; PEN.upI = -1; PEN.wall = 0; PEN.wallI = -1;
    for (let i = from; i < to; i++) {
      const P = pts[i], q = this.T.query(P.x, P.z, qD);
      let wallD = 0, upD = 0;
      if (q.wall) { const B = this.T.bounds; wallD = Math.max(B.minX - P.x, P.x - B.maxX, B.minZ - P.z, P.z - B.maxZ, 0) + 0.001; }
      else {
        const d = q.h - P.y;
        if (d <= 0.004) continue;
        // 台阶虽然是同一个东西，但每一级都有直上直下的边，所以也要检查
        const canWall = this._gf === NOWALL ? false : this._gf !== undefined ? q.f !== this._gf || !!(q.f && q.f.t === 'stairs') : Math.hypot(q.gx, q.gz) < 0.25;
        if (d <= 0.02 || !canWall) upD = d;
        else {
          const w = this._wallNormalAt(P.x, P.z, P.y, this._cx, this._cz);
          let e = 0.32;
          const qh = P.y + d;
          // 出口 = 到了不比这个点高的地方；或者是明显低一截的地面（点本身比地面低一点点时也算找到出口，不然会以为墙很厚、推得太远）
          for (let k = 0.02; k <= 0.3; k += 0.02) { const r = this.T.query(P.x + w[0] * k, P.z + w[1] * k, qD); if (!r.wall && (r.h <= P.y + 0.004 || (r.h <= P.y + 0.02 && r.h < qh - 0.05))) { e = k; break; } }
          if (e < d) wallD = e; else upD = d;
        }
      }
      if (wallD > PEN.wall) { PEN.wall = wallD; PEN.wallI = i; }
      if (upD > PEN.up) { PEN.up = upD; PEN.upI = i; }
    }
    return PEN;
  }
  _penAt(cx, cz, pts, gf) { this._cx = cx; this._cz = cz; this._gf = gf; return this._pen(pts, 0, HULL.length); }
  // 板身（板头、板尾、板边，不算轮子）穿进东西多深：往旁边和往上取近的那个
  _bodyPen(x, y, z, q, pitch, flip, gf) { const pts = this._hull(x, y, z, q, pitch, flip, 0); this._cx = x; this._cz = z; this._gf = gf; const r = this._pen(pts, 0, NW); return Math.max(r.wall, r.up); }
  // 某个点所在的墙朝哪边（水平法线，指向空的那边）；找不到就用"从这个点指向板子中心"
  _wallNormalAt(x, z, y, cx, cz) {
    let wx = 0, wz = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, ux = Math.cos(a), uz = Math.sin(a);
      const q = this.T.query(x + ux * 0.14, z + uz * 0.14, qD);
      if (!q.wall && q.h <= y + 0.02) { wx += ux; wz += uz; }
    }
    let l = Math.hypot(wx, wz);
    if (l < 1e-6) { wx = cx - x; wz = cz - z; l = Math.hypot(wx, wz); }
    return l > 1e-6 ? [wx / l, wz / l] : [1, 0];
  }
  // 把板子从地面 / 东西里挪出来：先往旁边推出侧面，再往上抬出表面（复活、摔倒的那一刻用）
  _unclip(q, pitch) {
    for (let k = 0; k < 24; k++) {
      const pen = this._penAt(this.p.x, this.p.z, this._hull(this.p.x, this.p.y, this.p.z, q, pitch, 0, 0));
      if (pen.wall > 0) { const P = HP[pen.wallI], w = this._wallNormalAt(P.x, P.z, P.y, this.p.x, this.p.z); this.p.x += w[0] * 0.05; this.p.z += w[1] * 0.05; continue; }
      if (pen.up > 0) this.p.y += pen.up;
      return;
    }
  }
  // 板子是不是正着：没有翻歪 / 转歪，而且轮子朝着下面的地面（在大坡上飞时板子是竖着的，按坡面算，不按天空算）
  _upright(q) {
    if (Math.abs(offUp(this.flipA, TAU)) > LAND_TOL || Math.abs(offUp(this.shoveA, Math.PI)) > LAND_TOL || Math.abs(offUp(this.impA || 0, TAU)) > LAND_TOL) return false;
    v3.set(0, 1, 0).applyQuaternion(this.qa);
    const gl = q ? Math.sqrt(1 + q.gx * q.gx + q.gz * q.gz) : 1;
    return q ? (v3.y - v3.x * q.gx - v3.z * q.gz) / gl > 0.3 : v3.y > 0.3;
  }

  /* ---------------- 圆杆和立柱的碰撞（2026-11-07：用户说"杆子没有实体"） ---------------- */
  // 地形是高度图，细细的圆杆放不进去（杆子底下是空的，板子能从底下滑过去）。所以杆子单独算：
  // 杆子 = 半径 2.2 厘米的胶囊，立柱 = 竖着的胶囊；板子 = 几个盒子（板面、翘起的板头板尾、前后支架加轮子）。
  // 求胶囊轴线到每个盒子的最近距离（带符号的距离沿线段是凸函数，三分法就能找到最小值），比半径小就是碰到了
  _rodList() {
    if (this._rods && this._rodsT === this.T) return this._rods;
    const out = [], T = this.T;
    const add = (ax, ay, az, bx, by, bz, r, rail) => out.push({ ax, ay, az, bx, by, bz, r, rail,
      x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r, y0: Math.min(ay, by) - r, y1: Math.max(ay, by) + r, z0: Math.min(az, bz) - r, z1: Math.max(az, bz) + r });
    for (const rl of T.rails) {
      if (rl.kind !== 'rail') continue;
      add(rl.ax, rl.ay, rl.az, rl.bx, rl.by, rl.bz, 0.022, rl);
      for (const [x, y, z] of railPosts(rl)) add(x, T.height(x, z), z, x, y - 0.015, z, 0.024, null);
    }
    this._rods = out; this._rodsT = T;
    return out;
  }
  // 世界里的点 / 方向 ↔ 板子自己的坐标（和 _hull 的变换一样：翻板 → 转板 → 翘板 → 朝向 → 位置）
  _bframe(px, py, pz, q, pitch, flip, shove) {
    const B = this._bf || (this._bf = { q: new Quaternion(), qi: new Quaternion(), v: new Vector3() });
    B.px = px; B.py = py; B.pz = pz; B.q.copy(q); B.qi.copy(q).invert();
    B.pv = pitch >= 0 ? -TRUCK_Z : TRUCK_Z; B.cf = Math.cos(flip); B.sf = Math.sin(flip); B.cs = Math.cos(shove); B.ss = Math.sin(shove); B.cp = Math.cos(-pitch); B.sp = Math.sin(-pitch);
    return B;
  }
  _toLocal(B, x, y, z, out) {
    const v = B.v.set(x - B.px, y - B.py, z - B.pz).applyQuaternion(B.qi);
    let lx = v.x, ly = v.y, lz = v.z - B.pv;                                   // 退回翘板
    let y2 = ly * B.cp + lz * B.sp, z2 = -ly * B.sp + lz * B.cp + B.pv; ly = y2; lz = z2;
    let x1 = B.cs * lx - B.ss * lz, z1 = B.ss * lx + B.cs * lz; lx = x1; lz = z1; // 退回转板
    const yy = ly - CY; x1 = B.cf * lx + B.sf * yy; ly = -B.sf * lx + B.cf * yy + CY; lx = x1; // 退回翻板
    out[0] = lx; out[1] = ly; out[2] = lz; return out;
  }
  _dirWorld(B, x, y, z, out) {
    let x1 = x * B.cf - y * B.sf, y1 = x * B.sf + y * B.cf, z1 = z;
    const x2 = x1 * B.cs + z1 * B.ss, z2 = -x1 * B.ss + z1 * B.cs;
    const y3 = y1 * B.cp - z2 * B.sp, z3 = y1 * B.sp + z2 * B.cp;
    return out.set(x2, y3, z3).applyQuaternion(B.q);
  }
  _ptWorld(B, x, y, z, out) {
    const yy = y - CY; let x1 = x * B.cf - yy * B.sf, y1 = x * B.sf + yy * B.cf + CY, z1 = z;
    const x2 = x1 * B.cs + z1 * B.ss, z2 = -x1 * B.ss + z1 * B.cs - B.pv;
    const y3 = y1 * B.cp - z2 * B.sp, z3 = y1 * B.sp + z2 * B.cp + B.pv;
    return out.set(x2, y3, z3).applyQuaternion(B.q).add(v3.set(B.px, B.py, B.pz));
  }
  // 板子碰到杆子 / 立柱没有、插进去多深、往哪边推出来（世界方向）。skip = 正在磨的那根杆子不算
  _rodPen(px, py, pz, q, pitch, flip, shove, skip) {
    const R = this._rodR || (this._rodR = { d: 0, n: new Vector3(), rod: null }); R.d = 0; R.rod = null;
    const rods = this._rodList(); if (!rods.length) return R;
    let B = null; const A = RL_A, Bp = RL_B;
    for (const rod of rods) {
      if (px < rod.x0 - 0.5 || px > rod.x1 + 0.5 || pz < rod.z0 - 0.5 || pz > rod.z1 + 0.5 || py < rod.y0 - 0.55 || py > rod.y1 + 0.5) continue;
      if (skip && rod.rail && (rod.rail === skip || rod.rail === skip.next || rod.rail === skip.prev)) continue;
      if (!B) B = this._bframe(px, py, pz, q, pitch, flip, shove);
      this._toLocal(B, rod.ax, rod.ay, rod.az, A); this._toLocal(B, rod.bx, rod.by, rod.bz, Bp);
      for (const bx of BOARD_BOX) {
        const sdf = (t) => { const x = A[0] + (Bp[0] - A[0]) * t - bx[0], y = A[1] + (Bp[1] - A[1]) * t - bx[1], z = A[2] + (Bp[2] - A[2]) * t - bx[2];
          const qx = Math.abs(x) - bx[3], qy = Math.abs(y) - bx[4], qz = Math.abs(z) - bx[5];
          return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); };
        let lo = 0, hi = 1;
        for (let k = 0; k < 22; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sdf(m1) <= sdf(m2)) hi = m2; else lo = m1; }
        const t = (lo + hi) / 2, s = sdf(t), d = rod.r - s;
        if (d <= R.d) continue;
        // 推出来的方向 = 带符号距离的梯度反过来（从杆子指向盒子外面的反方向，也就是把板子从杆子旁边推开）
        const x = A[0] + (Bp[0] - A[0]) * t - bx[0], y = A[1] + (Bp[1] - A[1]) * t - bx[1], z = A[2] + (Bp[2] - A[2]) * t - bx[2];
        const qx = Math.abs(x) - bx[3], qy = Math.abs(y) - bx[4], qz = Math.abs(z) - bx[5];
        let gx = 0, gy = 0, gz = 0;
        if (s > 1e-6) { gx = Math.max(qx, 0) * Math.sign(x); gy = Math.max(qy, 0) * Math.sign(y); gz = Math.max(qz, 0) * Math.sign(z); }
        else if (qx >= qy && qx >= qz) gx = Math.sign(x) || 1; else if (qy >= qz) gy = Math.sign(y) || 1; else gz = Math.sign(z) || 1;
        const gl = Math.hypot(gx, gy, gz) || 1;
        this._dirWorld(B, -gx / gl, -gy / gl, -gz / gl, R.n);
        R.d = d; R.rod = rod;
      }
    }
    return R;
  }

  /* ---------------- 主步进 ---------------- */
  step(dt, I) {
    this.I = I; this.time += dt; if (this.impactCD > 0) this.impactCD -= dt;
    this.buf = this.buf.filter((b) => this.time - b.t < FLICK_ARM); // 起跳前拨的板：0.5 秒内起跳就一起出招
    if (this.mode === 'grind' && !this.grind) this.mode = 'air';
    if (this.mode === 'air' && !this.air) this._toAir(this.v, null, 0, 0, null);
    if (this.mode !== 'ground') {
      // 不在地上：板面侧倾慢慢回正，侧滑清零
      this.rollV += (ROLL_K * 0.5 * -this.roll - ROLL_C * 0.7 * this.rollV) * dt; this.roll += this.rollV * dt;
      this.slip = 0; this.kickPitch *= Math.exp(-14 * dt); this.yawRate = 0; this.gTilt = 0;
    }
    if (this.mode === 'ground') this._ground(dt, I);
    else if (this.mode === 'air') this._air(dt, I);
    else if (this.mode === 'grind') this._grindStep(dt, I);
    else this._bail(dt);
    if (this.mode === 'ground') this.wheelRot += (this.s * dt) / 0.027;
  }
  // 当前真实速度（世界坐标）：联机时发给对方做曲线补间，比用两帧位置差估算准得多
  velWorld(out) {
    if (this.mode === 'ground') return this._groundVel(out);
    if (this.mode === 'grind' && this.grind) { const r = this.grind.r; return out.set(r.dx, r.dy, r.dz).multiplyScalar(this.grind.sp); }
    return out.copy(this.v);
  }
  // 地面上的速度向量（沿板子方向的速度 + 落地侧滑）
  _groundVel(out) {
    this._tangent(out, this.heading).multiplyScalar(this.s);
    if (this.slip) { out.x += Math.cos(this.heading) * this.slip; out.z -= Math.sin(this.heading) * this.slip; }
    return out;
  }

  _ground(dt, I) {
    const T = this.T;
    if (this.flipA) { this.flipA *= Math.exp(-22 * dt); if (Math.abs(this.flipA) < 1e-3) this.flipA = 0; }
    // 保险：板子中心陷进了高出一截的地方（卡在墙里）：在附近 0.4 米内找回正常的地面，找不到就复活
    {
      const hh = T.height(this.p.x, this.p.z);
      if (hh - this.p.y > 0.05) {
        let fixed = false;
        for (let r = 0.04; r <= 0.4 && !fixed; r += 0.04) for (let k = 0; k < 8 && !fixed; k++) {
          const a = (k * Math.PI) / 4, x = this.p.x + Math.cos(a) * r, z = this.p.z + Math.sin(a) * r, h2 = T.height(x, z);
          if (Math.abs(h2 - this.p.y) < 0.03) { this.p.x = x; this.p.z = z; this.p.y = h2; fixed = true; }
        }
        if (!fixed) { this.respawn(); return; }
      }
    }
    // 保险：板子压着立柱 / 杆子（比如原地复活时换了朝向）：往旁边一点点推出来（只在平的地方推）
    {
      const R = this._rodPen(this.p.x, this.p.y, this.p.z, this.qv, this.visPitch(), this.flipA, 0, null);
      if (R.d > 0.002) {
        const l = Math.hypot(R.n.x, R.n.z);
        if (l > 0.2) { const d = Math.min(0.03, R.d + 0.002), xx = this.p.x + (R.n.x / l) * d, zz = this.p.z + (R.n.z / l) * d, hh = T.height(xx, zz); if (Math.abs(hh - this.p.y) < 0.03) { this.p.x = xx; this.p.z = zz; this.p.y = hh; } }
      }
    }
    const h0 = this.heading, px0 = this.p.x, pz0 = this.p.z; // 原地转会绕一头的轮子转，位置也跟着变：撞到东西退回时要一起退回
    let q = T.query(this.p.x, this.p.z, qA);
    this.gx = q.gx; this.gz = q.gz; this.feat = q.f;
    this.lean = I.lean || 0;
    // ---- manual ----
    const mreq = I.manual || 0;
    if (this.manLock && Math.abs(mreq) < 0.2) this.manLock = false;
    if (!this.manual) {
      if (Math.abs(mreq) > 0.28 && !this.manLock && this.s > 0.4 && !this.slide) this.manReqT += dt; else this.manReqT = 0;
      if (this.manReqT >= 0.12) {
        this.manReqT = 0;
        this.manual = { kind: mreq > 0 ? 'manual' : 'nose', t: 0 };
        this.cb.onManual && this.cb.onManual(true, this.manual.kind);
      }
      this.manA = 0;
    } else {
      const sg = this.manual.kind === 'manual' ? 1 : -1;
      const a = Math.sign(mreq) === sg ? Math.abs(mreq) : 0;
      this.manA = a;
      if (a < 0.2 || this.s < 0.25) this._endManual(false);
      else if (a > 1.05) { this.s *= 0.85; this._endManual(true); this.manLock = true; }
      else this.manual.t += dt;
    }
    const mt = this.manual ? (this.manual.kind === 'manual' ? 1 : -1) * clamp(this.manA, 0, 1.1) * 0.27 : 0;
    const man0 = this.manPitch, kick0 = this.kickPitch; // 翘板角改之前的值（下面防穿模用）
    this.manPitch += (mt - this.manPitch) * damp(18, dt);
    this.popPitch *= Math.exp(-10 * dt);
    // ---- 速度 ----
    let s = this.s;
    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let m = q.gx * fx + q.gz * fz;
    s += (-G * m / Math.sqrt(1 + m * m)) * dt;
    const fr = (0.1 + 0.005 * s * s) * (this.manual ? 1.6 : 1);
    if (s > 0) s = Math.max(0, s - fr * dt);
    if (I.push > 0 && !this.manual && !this.slide) s += I.push * clamp(((MAX_PUSH - s) / MAX_PUSH) * 1.5, 0, 1);
    if (I.brake > 0 && s > 0) s = Math.max(0, s - I.brake * 6 * dt);
    // 下坡时两指按稳在板上 = 压板加速（在碗池/U 台里可以一直来回滑）
    this.pumping = !!(I.pump && Math.abs(m) > 0.08 && s < 9.5 && !this.slide && !this.manual);
    if (this.pumping) s += (m < 0 ? 2.9 : 1.1) * Math.min(1, Math.abs(m) * 1.5) * dt;
    if (this.slide) s = this._slideStep(dt, s);
    // 落地时板子和速度方向不一致 → 轮子横着蹭地，很快蹭掉，顺便吃掉一点速度
    if (this.slip) {
      const d = Math.min(Math.abs(this.slip), SLIP_DEC * dt);
      this.slip -= Math.sign(this.slip) * d;
      s = Math.max(0, s - d * 0.3);
      if (Math.abs(this.slip) < 0.02) this.slip = 0;
    }
    if (s > 20) s = 20;
    // ---- 压板（板面侧倾）----
    const ln = clamp((I.lean || 0) / 1.1, -1, 1);
    const rollT = this.slide ? 0 : ln * ROLL_MAX * (this.manual ? 0.6 : 1);
    this.rollV += (ROLL_K * (rollT - this.roll) - ROLL_C * this.rollV) * dt;
    this.roll += this.rollV * dt;
    // ---- 转向：倾斜让支架转动，沿弧线走（弯的大小和速度有关；停着不转）----
    const sa = Math.max(0, s);
    const kMax = Math.min(1 / R_MIN, A_LAT / Math.max(0.01, sa * sa));
    const yl = this.slide ? 0 : -(this.roll / ROLL_MAX) * kMax * sa;
    let yr = yl;
    // 斜坡上横着走时，板子自然往下坡方向拐
    yr += (0.9 * (-q.gx * fz + q.gz * fx)) / (1 + 0.5 * Math.abs(s));
    this.yawRate = yr;
    this.heading += yr * dt;
    // 急转弯时轮子会吃掉一点速度（侧向加速度越大越明显；压到底大约相当于风阻）
    if (yl) s = Math.max(0, s - Math.abs(yl * sa) * 0.012 * dt);
    // ---- Kickturn：两指在板上一起转（一般是按住板尾、另一指往旁边拨）→ 板子跟着手指原地转 ----
    const kick = I.kick || 0;
    if (kick && !this.slide && !this.manual) {
      const kk = clamp((KICK_S1 - s) / (KICK_S1 - KICK_S0), 0, 1);
      if (kk > 0) {
        // 像真的 Kickturn 一样绕着后轮（按住板头时绕前轮）转：那一头的轮子不动，板子另一头甩过去（手指一直在板子上）
        const pv = (I.kickPivot === 1 ? 1 : -1) * (this.fakie ? -1 : 1) * TRUCK_Z * (kk < 1 ? kk : 1);
        const hx = Math.sin(this.heading), hz = Math.cos(this.heading), px = this.p.x + hx * pv, pz = this.p.z + hz * pv;
        if (!(this.kickT > 0)) this.kickSign = 1; // 新的一次原地转：翘起来的是哪一头（掉头变 Fakie 时跟着反过来，见下面）
        const hd0 = this.heading, x0 = this.p.x, z0 = this.p.z;
        this.heading += kick * kk; this.kickAcc += Math.abs(kick) * kk; this.kickT = 0.28;
        this.p.x = px - Math.sin(this.heading) * pv; this.p.z = pz - Math.cos(this.heading) * pv;
        // 绕一头的轮子转会挪动板子中心：挪进了高出一截的地方（比如碗池出口两边的墙里）就不转这一下
        if (T.height(this.p.x, this.p.z) - this.p.y > STEP_TOL) { this.heading = hd0; this.p.x = x0; this.p.z = z0; }
      }
    }
    if (this.kickT > 0) {
      this.kickT -= dt;
      if (this.kickT <= 0) { if (this.kickAcc > 1.0) this.cb.onKick && this.cb.onKick(this.kickAcc); this.kickAcc = 0; }
    }
    this.kickPitch += ((this.kickT > 0 && this.kickAcc > 0.12 ? 0.15 * (this.kickSign || 1) : 0) - this.kickPitch) * damp(16, dt);
    // 翘板（原地转、Manual）会让另一头往下压，原地转会把板头甩过去：贴着矮台子（比如 Manual 台）时板头会压进 / 甩进台子
    // → 板身（不算轮子）会因为这一步压进东西里，就退回这一步之前的翘板角、朝向和位置（板头顶在台子边上停住）
    if (this.manPitch !== man0 || this.kickPitch !== kick0 || this.kickT > 0) {
      const gf = Math.hypot(this.gx, this.gz) < 0.3 ? this.feat : NOWALL, P = this.p;
      const body = () => { this._groundFrame(); return Math.max(this._bodyPen(P.x, P.y, P.z, this.qv, this.visPitch(), this.flipA, gf), this._rodPen(P.x, P.y, P.z, this.qv, this.visPitch(), this.flipA, 0, null).d); }; // 立柱也算
      const now = gf === NOWALL ? 0 : body(); // 只在平地上管（坡上板身本来就离坡面很近）
      if (now > 0.006) {
        const st = [this.manPitch, this.kickPitch, this.heading, P.x, P.z];
        this.manPitch = man0; this.kickPitch = kick0; this.heading = h0; P.x = px0; P.z = pz0;
        if (!(now > body() + 1e-4)) { [this.manPitch, this.kickPitch, this.heading, P.x, P.z] = st; this._groundFrame(); } // 不是这一步造成的（本来就贴着）：照常
      }
    }
    // 速度变成负的（比如冲坡没冲上去往回滑）：掉头变 Fakie。侧倾和侧滑是按行进方向算的，掉头后符号也要反过来（实际倾斜不变）
    if (s < 0) {
      this.heading += Math.PI; s = -s; this.fakie = !this.fakie; this.roll = -this.roll; this.rollV = -this.rollV; this.slip = -this.slip;
      // 翘板角也是按行进方向算的：一起反过来，翘起来的还是同一头（不然原地转时板头板尾会一下子换过来，板头戳进旁边的台子）
      this._flipPitchSign();
    }
    this.s = s;
    // ---- 移动 ----
    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    m = q.gx * fx + q.gz * fz;
    const inv = 1 / Math.sqrt(1 + m * m), hs = s * inv, vy = s * m * inv;
    const sl = this.slip, vx = fx * hs + fz * sl, vz = fz * hs - fx * sl;
    const nx = this.p.x + vx * dt, nz = this.p.z + vz * dt;
    const q2 = T.query(nx, nz, qB);
    const dh = q2.h - this.p.y;
    if (q2.wall || dh > Math.max(0, vy * dt) + STEP_TOL) { this._wallHit(vx, vz); this._groundFrame(); return; }
    const yPred = this.p.y + vy * dt - 0.5 * G * dt * dt;
    // 凸起的唇边：轨迹比新位置的地面陡很多，而且在往上走 → 飞出去
    const m2 = q2.gx * fx + q2.gz * fz;
    const lip = m - m2 > 0.35 && vy > 0.2;
    if (q2.h < yPred - 0.015 || lip || Math.abs(m) > 9) {
      v1.set(vx, vy, vz);
      this.p.set(nx, this.p.y + vy * dt, nz);
      this._toAir(v1, q.f, q.gx, q.gz, null);
      return;
    }
    // 板头、板尾、板边、轮子会不会戳进旁边的东西或墙里（只检查中心点的话，板头能伸进墙里 40 厘米）
    {
      const ox = this.p.x, oy = this.p.y, oz = this.p.z, ogx = this.gx, ogz = this.gz, oTilt = this.gTilt;
      this.gx = q2.gx; this.gz = q2.gz; this.n.set(-q2.gx, 1, -q2.gz).normalize(); this._groundFrame();
      this._wheelTilt(nx, nz, q2, dt);
      const gfN = Math.hypot(q2.gx, q2.gz) < 0.3 ? q2.f : NOWALL;
      const pen = this._penAt(nx, nz, this._hull(nx, q2.h, nz, this.qv, this.visPitch(), this.flipA, 0), gfN);
      let nw = pen.wall, wI = pen.wallI;
      // 板头 / 板尾比旁边的矮台子低（比如 Manual 台 16 厘米，板头离地 13 厘米）：板头会顶在台子侧面上，不能伸进去
      // （按"往上抬更近"算会被当成踩上去，地面上不处理，板头能伸进台子 20 厘米）。只在平地上这样算，坡上不算
      if (!(nw > 0) && gfN !== NOWALL) { const b = this._pen(HP, 0, NW); if (b.up > 0.006) { nw = b.up; wI = b.upI; } }
      // 圆杆的立柱、压低的杆子：和墙一样挡住（推开的方向只取水平的）
      let rw = null;
      if (!(nw > 0)) {
        const R = this._rodPen(nx, q2.h, nz, this.qv, this.visPitch(), this.flipA, 0, null);
        if (R.d > 0.001) { const l = Math.hypot(R.n.x, R.n.z); rw = l > 0.2 ? [R.n.x / l, R.n.z / l] : [-vx / (Math.hypot(vx, vz) || 1), -vz / (Math.hypot(vx, vz) || 1)]; nw = R.d; }
      }
      if (nw > 0) {
        const P = rw ? null : HP[wI], w = rw || this._wallNormalAt(P.x, P.z, P.y, nx, nz);
        const nh = this.heading, nTilt = this.gTilt;
        this.heading = h0; this.gx = ogx; this.gz = ogz; this.gTilt = oTilt; this.n.set(-ogx, 1, -ogz).normalize(); this._groundFrame();
        // 原来就已经戳在里面（比如落地时贴着东西）：往外走的移动照样放行，不然会卡住不动
        const gf0 = Math.hypot(ogx, ogz) < 0.3 ? this.feat : NOWALL;
        let was;
        if (rw) was = this._rodPen(px0, oy, pz0, this.qv, this.visPitch(), this.flipA, 0, null).d;
        else {
          was = this._penAt(px0, pz0, this._hull(px0, oy, pz0, this.qv, this.visPitch(), this.flipA, 0), gf0).wall;
          if (!(was > 0) && gf0 !== NOWALL) { const b = this._pen(HP, 0, NW); if (b.up > 0.006) was = b.up; }
        }
        if (!(was > 0 && nw < was - 1e-4)) {
          this.p.set(px0, oy, pz0);
          if (was > 0) { // 卡在里面就一点点推出来（只在平的地方推，免得推下台子）
            const d = Math.min(0.02, was), xx = px0 + w[0] * d, zz = pz0 + w[1] * d, hh = T.height(xx, zz);
            if (Math.abs(hh - oy) < 0.03) this.p.set(xx, hh, zz);
          }
          this._wallHit(vx, vz, w);
          this._groundFrame();
          return;
        }
        this.heading = nh; this.gTilt = nTilt;
      }
    }
    this.p.set(nx, q2.h, nz);
    this.gx = q2.gx; this.gz = q2.gz; this.feat = q2.f;
    this.n.set(-q2.gx, 1, -q2.gz).normalize();
    this._groundFrame();
    // 记录安全复活点
    this.safeT += dt;
    if (this.safeT > 0.3) {
      this.safeT = 0;
      if (Math.abs(q2.gx) + Math.abs(q2.gz) < 0.02 && !q2.f) {
        const h0 = q2.h; let ok = true;
        for (const [ox, oz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) if (Math.abs(T.height(nx + ox, nz + oz) - h0) > 0.01) { ok = false; break; }
        if (ok) this.safe = { x: nx, z: nz, yaw: this.heading };
      }
    }
  }
  // 前后两个支架的轮子各自踩在自己脚下的地面上：前轮先爬上坡（比如金字塔、坡道的起点）时，板子绕后支架把板头翘起来；
  // 后轮被顶起就绕前支架翘板尾。不然那个轮子会穿进坡里
  _wheelTilt(nx, nz, q2, dt) {
    const T = this.T;
    // 两个轮子在板子上的真实位置（沿着板子方向前后各 18 厘米），各自陷进地面多深（按垂直于地面的方向量）
    // 每个支架左右两个轮子都量，取陷得深的那个（斜着撞上坡道的棱时，常常是一边的轮子先碰到）
    const wx = this.fwd.x * TRUCK_Z, wy = this.fwd.y * TRUCK_Z, wz = this.fwd.z * TRUCK_Z, f = this.fwd, n = this.n;
    let rx = f.y * n.z - f.z * n.y, ry = f.z * n.x - f.x * n.z, rz = f.x * n.y - f.y * n.x; const rl = Math.hypot(rx, ry, rz) || 1;
    rx *= 0.1 / rl; ry *= 0.1 / rl; rz *= 0.1 / rl;
    // 只算能"爬上去"的高度差：旁边的轮子要是碰到台子、箱子的直边（比支架中间高出一截），那是撞墙，交给后面的轮廓检查
    const dep = (sx, sy, sz) => {
      const qc = T.query(nx + sx, nz + sz, qC), hc = qc.h;
      let m = (hc - (q2.h + sy)) / Math.sqrt(1 + qc.gx * qc.gx + qc.gz * qc.gz);
      for (let k = -1; k <= 1; k += 2) {
        const q = T.query(nx + sx + rx * k, nz + sz + rz * k, qC);
        if (q.wall || Math.abs(q.h - hc) > 0.08) continue;
        const d = (q.h - (q2.h + sy + ry * k)) / Math.sqrt(1 + q.gx * q.gx + q.gz * q.gz); if (d > m) m = d;
      }
      return m;
    };
    const pf = dep(wx, wy, wz), pb = dep(-wx, -wy, -wz);
    // 只有一个轮子被顶起来（另一个没有、或者少得多）才翘：两个都陷进去一点点是弧形坡底，翘了反而不对
    const ef = pf - Math.max(0, pb), eb = pb - Math.max(0, pf);
    let tilt = 0;
    if (pf > 0.002 && ef > 0.002 && pf < 0.4) tilt = Math.atan2(ef, 2 * TRUCK_Z);
    else if (pb > 0.002 && eb > 0.002 && pb < 0.4) tilt = -Math.atan2(eb, 2 * TRUCK_Z);
    // 要翘得更多：马上到位（不然那一下轮子会陷进去）；要放平：稍微平滑一点
    if (Math.abs(tilt) > Math.abs(this.gTilt) || tilt * this.gTilt < 0) this.gTilt = tilt; else this.gTilt += (tilt - this.gTilt) * damp(40, dt);
  }
  _unstick(h) {
    const w = this._wallNormal(this.p.y);
    if (w) for (let d = 0.05; d <= 0.6; d += 0.05) {
      const x = this.p.x + w[0] * d, z = this.p.z + w[1] * d;
      if (this.T.height(x, z) <= this.p.y + 0.02) { this.p.x = x; this.p.z = z; return; }
    }
    this.p.y = h;
  }
  _endManual(scrape) {
    if (!this.manual) return;
    const m = this.manual; this.manual = null;
    this.cb.onManual && this.cb.onManual(false, m.kind, m.t, scrape);
  }
  _wallNormal(y) {
    let wx = 0, wz = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, cx = Math.cos(a), cz = Math.sin(a);
      const q = this.T.query(this.p.x + cx * 0.2, this.p.z + cz * 0.2, qC);
      if (q.wall || q.h > y + STEP_TOL + 0.01) { wx -= cx; wz -= cz; }
    }
    const l = Math.hypot(wx, wz);
    return l > 1e-6 ? [wx / l, wz / l] : null;
  }
  // 掉头（Fakie 和正脚互换）时：翘板角是按行进方向算的，要一起反过来，翘起来的还是同一头（不然板头板尾会一下子换过来，戳进旁边的台子）
  _flipPitchSign() { this.kickPitch = -this.kickPitch; this.kickSign = -(this.kickSign || 1); this.popPitch = -this.popPitch; this.manPitch = -this.manPitch; }
  _wallHit(vx, vz, wn) {
    this.slip = 0; // 撞墙后速度方向重新算（侧滑已经包含在传进来的速度里）
    let w = wn || this._wallNormal(this.p.y);
    if (!w) { const l = Math.hypot(vx, vz) || 1; w = [-vx / l, -vz / l]; }
    const vn = vx * w[0] + vz * w[1];
    if (vn >= 0) return;
    if (-vn > 4.3) { this._toBail('wall'); return; }
    const ux = vx - vn * w[0] * 1.25, uz = vz - vn * w[1] * 1.25, l = Math.hypot(ux, uz);
    if (l > 0.12) {
      const nh = Math.atan2(ux, uz), d = Math.abs(((nh - this.heading + 3 * Math.PI) % TAU) - Math.PI);
      if (d > Math.PI / 2) { this.heading = nh; this.fakie = !this.fakie; this._flipPitchSign(); } else this.heading = nh;
      this.s = l * 0.9;
    } else this.s = 0;
    if (this.impactCD <= 0 && -vn > 1) { this.impactCD = 0.25; this.cb.onImpact && this.cb.onImpact(-vn); }
    this._endManual(false);
  }

  _toAir(vel, feat, gx, gz, popKind, fromGrind) {
    const wasManual = !!this.manual, wasGround = this.mode === 'ground';
    this._endManual(false);
    if (this.slide) { if (!this.slide.scored) { this.slide.scored = true; this.cb.onSlide && this.cb.onSlide(false, this.slide); } this.slide = null; }
    this.v.copy(vel);
    const vl = vel.length();
    if (feat && feat.trans && vl > 0.5 && vel.y / vl > 0.8) {
      // 竖直墙辅助：把朝墙外的水平速度换成轻微朝回，保证落回过渡面
      const gl = Math.hypot(gx, gz);
      if (gl > 0.5) {
        const ux = gx / gl, uz = gz / gl, vu = this.v.x * ux + this.v.z * uz;
        const tAir = Math.max(0.25, (2 * this.v.y) / G_TRANS), want = -0.1 / tAir;
        this.v.x += (want - vu) * ux; this.v.z += (want - vu) * uz;
      }
    }
    if (this.mode === 'ground') this._groundFrame();
    this.qa.copy(this.qv);
    if (this.mode === 'ground' && this.gTilt) {
      // 离地时一头的轮子正翘着（刚爬上坡 / 滑下坡）：把这个角度并进空中的姿态，画面不会一下子放平，轮子也不会陷进地里
      const g = this.gTilt, pz = g >= 0 ? -TRUCK_Z : TRUCK_Z;
      tvA.set(0, 0, pz).applyQuaternion(this.qa);
      qt.setFromAxisAngle(XA, -g); this.qa.multiply(qt);
      tvB.set(0, 0, pz).applyQuaternion(this.qa);
      this.p.add(tvA).sub(tvB); this.gTilt = 0;
    }
    this.mode = 'air';
    this.spin = 0; this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.flipW = this.shoveW = 0; this.impA = this.impT = this.impW = 0;
    const lipY = feat && feat.trans ? (feat.t === 'bowl' ? 0 : feat.hl) : null;
    this.air = { t: 0, feat: feat || null, popped: !!popKind, pop: popKind, fakie: this.fakie, y0: this.p.y, maxY: this.p.y, lipY, fromTrans: !!(feat && feat.trans), fromGrind: !!fromGrind, wasManual,
      flicked: false, caught: false, autoCatch: false, flickClock: null, flipDir: 0, shoveDir: 0, catchErr: 0, flipGoal: 0, shoveGoal: 0, pF: null, pS: null, pI: null, impGoal: 0, guide: null, perfect: false };
    if (popKind) {
      this.popPitch = popKind === 'nose' ? -0.45 : 0.45;
      // 在杆子底下起跳：翘起来的板头会一下子顶进杆子里 → 翘少一点（一次减半，最多 6 次）
      if (!fromGrind) for (let k = 0; k < 6 && this._rodPen(this.p.x, this.p.y, this.p.z, this.qa, this.visPitch(), 0, 0, null).d > 0.002; k++) this.popPitch *= 0.5;
      this.cb.onPop && this.cb.onPop(popKind);
      for (const b of this.buf) this._applyFlick(b.which, b.dir, b.k, b.clock);
      this.buf.length = 0;
    }
    if (wasGround) {
      // 从地上离开的这一刻（翻过坡顶、跨过坡面的棱、起跳翘板）：轮子 / 板尾要是已经低于地面，先抬上来（不然要等下一步才抬）
      const pen = this._penAt(this.p.x, this.p.z, this._hull(this.p.x, this.p.y, this.p.z, this.qa, this.visPitch(), 0, 0));
      if (pen.wall === 0 && pen.up > 0 && pen.up < 0.1) this.p.y += pen.up;
    }
  }

  _air(dt, I) {
    if (this.hop) { this._hopStep(dt); return; }
    const a = this.air, T = this.T;
    a.t += dt;
    const qa0 = tq0.copy(this.qa), f0 = this.flipA, s0 = this.shoveA, sp0 = this.spin, i0 = this.impA; // 这一步转之前的样子（转进墙里时退回去）
    const uF0 = a.pF ? a.pF.u : 0, uS0 = a.pS ? a.pS.u : 0, uI0 = a.pI ? a.pI.u : 0, uG0 = a.guide ? a.guide.u : 0;
    const dSpin = (I.twist || 0) + (I.spinRate || 0) * dt;
    if (dSpin) { this.spin += dSpin; qt.setFromAxisAngle(Y, dSpin); this.qa.multiply(qt); }
    // 翻板 / 转板：按计划先快后慢，转完整的圈停在正的位置；接住后顺手带到正的位置（板子刚转起来就接 = 踩停）
    if (a.flicked && !a.caught) {
      const nf = this._planStep(a.pF, dt, this.flipA), ns = this._planStep(a.pS, dt, this.shoveA), ni = this._planStep(a.pI, dt, this.impA);
      this.flipW = (nf - this.flipA) / dt; this.shoveW = (ns - this.shoveA) / dt; this.impW = (ni - this.impA) / dt;
      this.flipA = this.flipT = nf; this.shoveA = this.shoveT = ns; this.impA = this.impT = ni;
      if (this._shouldCatch(I)) this._catch();
    } else if (a.caught) this._guideStep(dt);
    this.popPitch *= Math.exp(-7 * dt);
    this.manPitch *= Math.exp(-12 * dt);
    this.v.y -= (a.fromTrans ? G_TRANS : G_AIR) * dt;
    const vl = this.v.length(); if (vl > 25) this.v.multiplyScalar(25 / vl);
    // 安全网：卡在物体里 → 推出来；掉出世界或空中太久 → 复活
    let hNow = T.height(this.p.x, this.p.z);
    if (this.p.y < hNow - 0.03) { this._unstick(hNow); hNow = T.height(this.p.x, this.p.z); }
    if (a.t > 8 || this.p.y < -6) { this.respawn(); return; }
    let nx = this.p.x + this.v.x * dt, nz = this.p.z + this.v.z * dt;
    let ny = this.p.y + this.v.y * dt;
    const qn = T.query(nx, nz, qB);
    // 只有“坡度解释不了的高度突变”才算墙（陡的过渡面不算墙，要落上去）
    const jump = qn.h - hNow, stepLen = Math.hypot(nx - this.p.x, nz - this.p.z), gm = Math.hypot(qn.gx, qn.gz);
    if (qn.wall || (qn.h > ny + 0.25 && jump > 0.2 && jump > gm * stepLen * 2 + 0.05)) {
      const w = this._wallNormal(ny) || [-Math.sign(this.v.x) || 1, 0];
      const vn = this.v.x * w[0] + this.v.z * w[1];
      if (vn < 0) { this.v.x -= 1.3 * vn * w[0]; this.v.z -= 1.3 * vn * w[1]; }
      if (this.impactCD <= 0) { this.impactCD = 0.25; this.cb.onImpact && this.cb.onImpact(Math.abs(vn)); }
      if (ny <= hNow && this.v.y < 0) { this.p.y = hNow; this.qv.copy(this.qa); this._land(T.query(this.p.x, this.p.z, qB)); return; } // 贴着墙掉到地上：落地（不会掉到地面以下）
      this.p.y = Math.max(ny, hNow);
      return;
    }
    if (this._tryStall(nx, ny, nz)) return;
    if (this.v.y < 0.8 && this._tryGrind(nx, ny, nz)) return;
    // 板子轮廓（翻板时板边、板头板尾会伸出去）：戳进侧面 → 像撞墙一样弹开；陷进表面 → 往上抬；
    // 往下掉的时候板子不正、板面先碰到地 → 算落地失败
    let nyy = ny;
    {
      let pen = this._penAt(nx, nz, this._hull(nx, ny, nz, this.qa, this.visPitch(), this.flipA, this.shoveA));
      if (pen.wall > 0 && (this.flipA !== f0 || this.shoveA !== s0 || this.impA !== i0 || dSpin)) {
        // 翻板 / 转板 / 转体把板头、板尾甩进了旁边的东西里：这一步不转，转速弹回去一点（板子被挡住了）。
        // 不然两边都有东西时（比如墙和花坛中间），推出这边又戳进那边，会一直卡在里面
        const w1 = pen.wall;
        pen = this._penAt(nx, nz, this._hull(nx, ny, nz, qa0, this.visPitch(), f0, s0));
        if (pen.wall < w1 - 1e-4) {
          this.qa.copy(qa0); this.flipA = f0; this.shoveA = s0; this.spin = sp0; this.impA = i0;
          // 计划也退回这一步（板子被挡住，等这一步过去再接着转）
          if (a.pF) a.pF.u = uF0; if (a.pS) a.pS.u = uS0; if (a.pI) a.pI.u = uI0; if (a.guide) a.guide.u = uG0;
          if (a.flicked && !a.caught) { this.flipW = this.shoveW = 0; this.flipT = f0; this.shoveT = s0; }
        } else pen = this._penAt(nx, nz, this._hull(nx, ny, nz, this.qa, this.visPitch(), this.flipA, this.shoveA));
      }
      if (pen.wall > 0) {
        const P = HP[pen.wallI], w = this._wallNormalAt(P.x, P.z, P.y, this.p.x, this.p.z);
        const vn = this.v.x * w[0] + this.v.z * w[1];
        if (vn < 0) { this.v.x -= 1.3 * vn * w[0]; this.v.z -= 1.3 * vn * w[1]; }
        if (this.impactCD <= 0 && vn < -0.5) { this.impactCD = 0.25; this.cb.onImpact && this.cb.onImpact(Math.abs(vn)); }
        // 原地转（翻板、转板、空中转体）也可能把板头转进墙里：往外推一点
        const d = Math.min(0.15, pen.wall + 0.002); this.p.x += w[0] * d; this.p.z += w[1] * d;
        const hh = T.height(this.p.x, this.p.z);
        if (ny <= hh && this.v.y < 0) { this.p.y = hh; this.qv.copy(this.qa); this._land(T.query(this.p.x, this.p.z, qB)); return; } // 贴着墙掉到地上：落地（不会掉到地面以下）
        this.p.y = Math.max(ny, hh);
        return;
      }
      if (pen.up > 0) {
        let up = this._upright(qn);
        if (!up && this.v.y < 0 && a.caught && a.guide && a.guide.u < 1) { this._settle(); up = this._upright(qn); } // 接住了、脚还在带正的时候就碰到地：直接放正
        // 往下掉、板子又不正：板面 / 板边 / 侧着的轮子先碰到地 = 落地失败
        if (this.v.y < 0 && !up) {
          this.p.set(nx, ny + pen.up, nz);
          this.qv.copy(this.qa);
          this._toBail(this._landFail(!a.noCatch && (a.popped || a.t > 0.55)) || 'angle');
          return;
        }
        // 板子正着往下掉、轮子先碰到斜面（中心离脚下的地面也只差一点）：就在这一刻落地，不让轮子陷进去
        if (this.v.y < 0 && up && pen.upI >= NW && ny - qn.h < 0.12) { this.p.set(nx, qn.h, nz); this.qv.copy(this.qa); this._land(qn); return; }
        // 其他情况（板头板尾、板边碰到表面，或者往上飞时板子侧着碰到）：抬起来
        nyy = ny + pen.up;
        // 往下掉时板子一头 / 一边搭在别的东西上（台子边、坡道侧面、上一级台阶），板子中心底下是更低的地：
        // 离地很近就直接落地（在地上会被那个东西挡住）；不然顺着边滑下去。不会一直悬在半空（以前会这样悬着，而且往下的速度越积越大）
        const P = HP[pen.upI], qc = T.query(P.x, P.z, qD);
        if (this.v.y < 0 && (qc.f !== qn.f || (qc.f && qc.f.t === 'stairs')) && qc.h > qn.h + 0.05) {
          if (up && ny - qn.h < 0.12) { this.p.set(nx, qn.h, nz); this.qv.copy(this.qa); this._land(qn); return; }
          a.hang = (a.hang || 0) + dt;
          this.v.y = Math.max(this.v.y, -1.5);
          if (a.hang > 0.1) { // 先等一下：搭在能磨的边上时，磨杆会先接住（台边、箱子边的 50-50）
            const dx = nx - P.x, dz = nz - P.z, l = Math.hypot(dx, dz) || 1, push = 1.5 * dt;
            nx += (dx / l) * push; nz += (dz / l) * push;
            const vt = -(this.v.x * dx + this.v.z * dz) / l; // 往搭着的那边走的速度：被边挡住
            if (vt > 0) { this.v.x += (vt * dx) / l; this.v.z += (vt * dz) / l; }
          }
          if (a.hang > 0.7) { this.p.set(nx, nyy, nz); this.qv.copy(this.qa); this._toBail('angle'); return; }
        } else a.hang = 0;
      } else a.hang = 0;
    }
    // 圆杆、立柱：没磨上就是撞上了（刚下杆的那根杆子 0.4 秒内不算，免得一下杆就撞回去）
    {
      const skip = this.time - this.lastRailT < 0.4 ? this.lastRail : null;
      const R = this._rodPen(nx, nyy, nz, this.qa, this.visPitch(), this.flipA, this.shoveA, skip);
      if (R.d > 0.001) {
        const n = tvA.copy(R.n), dNew = R.d, rail = R.rod.rail;
        // 从上面落到杆子上（板子没顺着杆子、太慢，磨不上）：板子挂在杆上，摔（立柱顶上也算）
        if (n.y > 0.6 && this.v.y < 0) { this.p.set(nx + n.x * dNew, nyy + n.y * dNew, nz + n.z * dNew); this.qv.copy(this.qa); this._toBail('rail'); return; }
        // 这一步之前插得多深（同样的姿态）：这一步是往外走的就放行，不然退回这一步、速度弹开（从旁边 / 底下撞上杆子）
        const d0 = this._rodPen(this.p.x, this.p.y, this.p.z, qa0, this.visPitch(), f0, s0, skip).d;
        // 先试试只走上下（贴着立柱 / 杆子往下掉、往上飞）：不更深就照走，不会悬在立柱旁边
        if (dNew > d0 + 1e-4 && Math.abs(n.y) < 0.6 && this._rodPen(this.p.x, nyy, this.p.z, this.qa, this.visPitch(), this.flipA, this.shoveA, skip).d <= d0 + 1e-4) {
          const vn = this.v.x * n.x + this.v.z * n.z; if (vn < 0) { this.v.x -= 1.3 * vn * n.x; this.v.z -= 1.3 * vn * n.z; }
          nx = this.p.x; nz = this.p.z;
        } else if (dNew > d0 + 1e-4) {
          // 保险：一直被杆子挡着走不了（卡在杆子和地面 / 别的东西中间）超过 0.4 秒就算摔了（摔倒的板子会被推出来）
          a.rodStuck = (a.rodStuck || 0) + dt;
          if (a.rodStuck > 0.4) { this.qv.copy(this.qa); this._toBail('rail'); return; }
          this.qa.copy(qa0); this.flipA = f0; this.shoveA = s0; this.spin = sp0; this.impA = i0;
          if (a.pF) a.pF.u = uF0; if (a.pS) a.pS.u = uS0; if (a.pI) a.pI.u = uI0; if (a.guide) a.guide.u = uG0;
          if (a.flicked && !a.caught) { this.flipW = this.shoveW = 0; this.flipT = f0; this.shoveT = s0; }
          const vn = this.v.dot(n);
          if (vn < 0) this.v.addScaledVector(n, -1.3 * vn);
          if (this.impactCD <= 0 && vn < -0.5) { this.impactCD = 0.25; this.cb.onImpact && this.cb.onImpact(Math.abs(vn)); }
          // 原地转（翻板、转体）也会把板子甩进杆子：转的那部分已经退回了；位置还插着就顺着推一点出来
          if (d0 > 0.001) { const d = Math.min(0.05, d0 + 0.002); this.p.x += n.x * d; this.p.z += n.z * d; this.p.y = Math.max(this.p.y + n.y * d, T.height(this.p.x, this.p.z)); }
          this.qv.copy(this.qa);
          return;
        }
        // 已经插在里面、这一步没更深：顺着推出来一点（不会一直卡在杆子 / 立柱里）
        const d = Math.min(0.02, dNew + 0.002); nx += n.x * d; nz += n.z * d; nyy = Math.max(nyy + n.y * d, T.height(nx, nz));
      } else a.rodStuck = 0;
    }
    ny = nyy;
    this.p.set(nx, ny, nz);
    if (ny > a.maxY) a.maxY = ny;
    // 板子慢慢对齐下方的地面（准备落地）
    const hb = ny - qn.h;
    v1.set(0, 1, 0).applyQuaternion(this.qa);
    v2.set(-qn.gx, 1, -qn.gz).normalize();
    if (hb > 3) v2.set(0, 1, 0);
    v3.copy(v1).lerp(v2, damp(a.fromTrans ? 3 : 6, dt)).normalize();
    qt.setFromUnitVectors(v1, v3); this.qa.premultiply(qt);
    this.qv.copy(this.qa);
    if (ny <= qn.h) {
      // 还在往上飞、只是擦过一个边：抬到表面上继续飞（比如沿着台子起跳）
      if (this.v.y > 0.6 && qn.h - ny < 0.25 && Math.hypot(qn.gx, qn.gz) < 0.3) { this.p.y = qn.h + 0.002; return; }
      this.p.y = qn.h; this._land(qn);
    }
  }

  _land(q) {
    const a = this.air, n = v1.set(-q.gx, 1, -q.gz).normalize();
    const vn = -this.v.dot(n);
    const vt = v2.copy(this.v).addScaledVector(n, vn);
    const needCatch = !a.noCatch && (a.popped || a.t > 0.55); // 松手下杆那一跳不用接板
    this._settle();
    // 板子实际转了多少：翻了几圈、转了几个半圈（招式名字按这个算，不再按手势猜）
    const nF = Math.round(this.flipA / TAU), nS = Math.round(this.shoveA / Math.PI), nI = Math.round((this.impA || 0) / TAU);
    const fo = offUp(this.flipA, TAU), so = offUp(this.shoveA, Math.PI);
    let fail = this._landFail(needCatch);
    if (fail) { this._toBail(fail); return; }
    // 转板角整个算进板子朝向（差一点的那部分也算进去，落地方向自然就歪一点）；画面朝向一起转（见 main.js）
    if (this.shoveA) { qt.setFromAxisAngle(Y, this.shoveA); this.qa.multiply(qt); this.shoveBaked += this.shoveA; }
    this.flipT = this.shoveA = this.shoveT = 0; this.flipW = this.shoveW = 0; this.impA = this.impT = this.impW = 0;
    this.flipA = fo; // 画面上剩下的一点点翻板角，落地后很快回正
    const f3 = v3.set(0, 0, 1).applyQuaternion(this.qa);
    f3.addScaledVector(n, -f3.dot(n));
    if (f3.lengthSq() < 1e-6) f3.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    f3.normalize();
    const vtl = vt.length();
    const c = vtl > 0.6 ? f3.dot(vt) / vtl : (f3.dot(vt) >= 0 ? 1 : -1);
    const ac = Math.abs(c);
    let quality = ac > 0.985 ? 'clean' : 'ok';
    if (ac < 0.47) fail = 'angle';
    else if (ac < 0.82) quality = 'sketchy';
    if (vn > 11) fail = 'hard';
    if (!fail) {
      if (Math.abs(fo) > 0.25 || Math.abs(so) > 0.3) quality = 'sketchy'; // 板子还没完全正就落地：晃一下（只是画面，不弹字）
    }
    if (fail) { this.qv.copy(this.qa); this._toBail(fail); return; } // 剩下的那点翻板角也并进摔倒的姿态，画面不会跳
    const fakie = c < 0;
    // 落地后板子朝哪就往哪走（不会瞬间转到速度方向）：速度里横着的那部分变成侧滑，轮子蹭几下就没了
    const k = fakie ? -1 : 1;
    let tx = f3.x * k, tz = f3.z * k;
    if (Math.hypot(tx, tz) < 1e-3) { tx = vt.x; tz = vt.z; }
    if (Math.hypot(tx, tz) < 1e-4) { tx = q.gx === 0 && q.gz === 0 ? Math.sin(this.heading) : -q.gx; tz = q.gx === 0 && q.gz === 0 ? Math.cos(this.heading) : -q.gz; }
    this.heading = Math.atan2(tx, tz);
    this.fakie = fakie;
    this.mode = 'ground'; this.n.copy(n); this.gx = q.gx; this.gz = q.gz; this.feat = q.f;
    const tg = this._tangent(v3, this.heading);
    const along = vt.dot(tg), side = vt.x * Math.cos(this.heading) - vt.z * Math.sin(this.heading);
    const sk = quality === 'sketchy';
    this.s = Math.max(0, along) * (sk ? 0.85 : 0.97);
    this.slip = clamp(side * (sk ? 0.8 : 1), -SLIP_MAX, SLIP_MAX);
    if (vtl <= 0.6) { this.s = vtl * 0.97; this.slip = 0; }
    a.landed = true;
    const info = {
      air: a, quality, fakie, spin: this.spin, pop: a.pop, t: a.t, perfect: !!(a.perfect && (nF || nS || nI)), imp: Math.abs(nI),
      flips: Array.from({ length: Math.abs(nF) }, () => Math.sign(nF)), shoves: Array.from({ length: Math.abs(nS) }, () => Math.sign(nS)),
      height: a.maxY - a.y0, above: a.lipY != null ? a.maxY - a.lipY : 0, impact: vn, fingers: this.I.fingers || 0, landFeat: q.f, y: this.p.y,
    };
    this._groundFrame();
    this.cb.onLand && this.cb.onLand(info);
  }

  // Stall：板头 / 板尾卡在台边、坡顶铁边上停住。只按前指 = Nose Stall，只按后指 = Tail Stall（两指都按就照常落地 / 磨杆）
  // 条件：往下掉（或在最高点）、那一头离边很近、板子差不多横着对着边、板子中心在边下面那一侧（比如从地上跳向台子、在坡上冲到坡顶）、顺着边的速度不快（快了就是磨杆）
  _tryStall(nx, ny, nz) {
    const a = this.air, I = this.I || {};
    if (!a || this.hop || a.t < 0.12 || this.v.y > 0.5 || !(I.touching > 0)) return false;
    const fb = I.fb || 0; if (!fb) return false;
    if (a.flicked && !a.caught) return false;
    if (this._landFail(false)) return false;
    const e = fb === 1 ? -1 : 1, B = this._bframe(nx, ny, nz, this.qa, this.visPitch(), this.flipA, this.shoveA);
    const E = this._ptWorld(B, 0, 0.05, e * 0.31, tvB), ex = E.x, ey = E.y, ez = E.z;
    v1.set(0, 0, 1).applyQuaternion(this.qa); v1.y = 0; const fl = v1.length(); if (fl < 0.3) return false; v1.divideScalar(fl);
    for (const r of this.T.rails) {
      if (r.kind === 'rail' || (r === this.lastRail && this.time - this.lastRailT < 0.35)) continue;
      if (ex < Math.min(r.ax, r.bx) - 0.3 || ex > Math.max(r.ax, r.bx) + 0.3 || ez < Math.min(r.az, r.bz) - 0.3 || ez > Math.max(r.az, r.bz) + 0.3) continue;
      const c = railClosest(r, ex, ez);
      if (c.d > 0.12 || ey < c.y - 0.06 || ey > c.y + 0.14 || c.u < 0.15 || c.u > r.L - 0.15) continue;
      const hl = Math.hypot(r.dx, r.dz) || 1, rx = r.dx / hl, rz = r.dz / hl;
      if (Math.abs(v1.x * rx + v1.z * rz) > 0.6) continue;                       // 板子要差不多横着对着边
      if (Math.abs(this.v.x * rx + this.v.z * rz) > 0.9) continue;               // 顺着边滑得快 = 磨杆
      let sx = nx - c.x, sz = nz - c.z; sx -= (sx * rx + sz * rz) * rx; sz -= (sx * rx + sz * rz) * rz;
      const sl = Math.hypot(sx, sz); if (sl < 0.04) continue; sx /= sl; sz /= sl;
      if (this.T.height(c.x + sx * 0.3, c.z + sz * 0.3) > c.y - 0.08) continue;   // 板子中心那一侧要比边低
      return this._startStall(r, c, e, sx, sz);
    }
    return false;
  }
  _startStall(r, c, e, sx, sz) {
    this._settle();
    if (this.shoveA) { qt.setFromAxisAngle(Y, this.shoveA); this.qa.multiply(qt); this.shoveBaked += this.shoveA; }
    this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.flipW = this.shoveW = 0; this.impA = this.impT = this.impW = 0;
    this.popPitch = 0; this.manPitch = 0;
    const name = e > 0 ? 'Nose Stall' : 'Tail Stall';
    this.mode = 'grind';
    this.grind = { r, u: c.u, sp: 0, type: 'stall', name, t: 0, gf: [-e * sx, -e * sz], pitch: 0, pitchLocal: 0, end: e, side: [sx, sz], th: null,
      blend: { q: this.qa.clone(), p: this.p.clone(), t: 0 } };
    this._grindPose();
    this.cb.onGrind && this.cb.onGrind(true, this.grind);
    return true;
  }
  // Stall 的姿态：那一头的板底压在边上，板子另一头朝边外面（低的那一侧）往下斜一点；斜多少按不碰东西来定
  _stallPose(g) {
    const r = g.r, Ex = r.ax + r.dx * g.u, Ey = r.ay + r.dy * g.u, Ez = r.az + r.dz * g.u;
    const pose = (th, q, p) => {
      v1.set(g.gf[0] * Math.cos(th), g.end * Math.sin(th), g.gf[1] * Math.cos(th));
      v2.crossVectors(Y, v1).normalize(); v2.crossVectors(v1, v2).normalize();
      frameQuat(q, v2, v1);
      p.set(Ex, Ey + 0.002, Ez).sub(v3.set(0, 0.058, g.end * 0.30).applyQuaternion(q));
    };
    if (g.th == null) {
      g.th = -0.2;
      for (let th = 0.38; th >= -0.2; th -= 0.06) {
        pose(th, this.qv, this.p);
        const pen = this._penAt(this.p.x, this.p.z, this._hull(this.p.x, this.p.y, this.p.z, this.qv, 0, 0, 0), NOWALL);
        if (pen.up < 0.012) { g.th = th; break; }
      }
    }
    pose(g.th, this.qv, this.p);
    const B = g.blend;
    if (B && B.t < 0.15) { const k = B.t / 0.15, kk = k * k * (3 - 2 * k); this.qv.slerpQuaternions(B.q, tq0.copy(this.qv), kk); this.p.lerpVectors(B.p, v1.copy(this.p), kk); }
    this.qa.copy(this.qv);
  }
  _tryGrind(nx, ny, nz) {
    const rails = this.T.rails;
    for (let i = 0; i < rails.length; i++) {
      const r = rails[i];
      if (r === this.lastRail && this.time - this.lastRailT < 0.35) continue;
      if (nx < Math.min(r.ax, r.bx) - 0.4 || nx > Math.max(r.ax, r.bx) + 0.4 || nz < Math.min(r.az, r.bz) - 0.4 || nz > Math.max(r.az, r.bz) + 0.4) continue;
      const c = railClosest(r, nx, nz);
      if (c.d > 0.24 || ny < c.y - 0.1 || ny > c.y + 0.28) continue;
      const sp = this.v.x * r.dx + this.v.y * r.dy + this.v.z * r.dz;
      if (Math.abs(sp) < 0.7) continue;
      return this._startGrind(r, c, sp);
    }
    return false;
  }
  // 上杆：c = 杆上的点 {u, x, y, z}，sp = 沿杆方向的速度（带正负）
  _startGrind(r, c, sp) {
    {
      const a = this.air;
      this._settle();
      const fail = a ? this._landFail(!a.noCatch && a.flicked, true) : null; // 板子还在转（没接住）或者不正就落到杆上 = 摔（转了 90° 横着落上去 = Boardslide，算正）
      if (fail) { this._toBail(fail); return true; }
      if (this.shoveA) { qt.setFromAxisAngle(Y, this.shoveA); this.qa.multiply(qt); this.shoveBaked += this.shoveA; } // 画面朝向也要一起转（见 main.js）
      this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.flipW = this.shoveW = 0; this.impA = this.impT = this.impW = 0;
      // 板头方向与杆子的夹角决定招式
      v1.set(0, 0, 1).applyQuaternion(this.qa); v1.y = 0;
      if (v1.lengthSq() < 1e-6) v1.set(this.v.x, 0, this.v.z);
      v1.normalize();
      const hl = Math.hypot(r.dx, r.dz) || 1, rx = r.dx / hl, rz = r.dz / hl;
      const ca = v1.x * rx + v1.z * rz, cp = v1.x * rz - v1.z * rx;
      const aca = Math.abs(ca);
      const fb = this.I.fb || 0; // 1=只按后指 -1=只按前指
      let type, name, gf;
      if (aca > 0.86) { type = 'axle'; name = fb === 1 ? '5-0' : fb === -1 ? 'Nosegrind' : '50-50'; gf = [Math.sign(ca) * rx, Math.sign(ca) * rz]; }
      else if (aca < 0.52) { type = 'slide'; name = r.kind === 'rail' ? 'Boardslide' : 'Lipslide'; gf = [Math.sign(cp) * rz, -Math.sign(cp) * rx]; }
      else { type = 'crooked'; name = 'Crooked'; const k1 = Math.sign(ca), k2 = Math.sign(cp); const gx = k1 * rx + k2 * rz, gz = k1 * rz - k2 * rx, gl = Math.hypot(gx, gz); gf = [gx / gl, gz / gl]; }
      this.mode = 'grind';
      const travelDot = (gf[0] * rx + gf[1] * rz) * Math.sign(sp || 1);
      const gp = name === '5-0' ? 0.2 : name === 'Nosegrind' ? -0.2 : 0;
      this.grind = { r, u: c.u, sp, type, name, t: 0, gf, pitch: gp, pitchLocal: travelDot >= 0 ? gp : -gp, locked: !!this._lockNext };
      this.p.set(c.x, c.y, c.z);
      this._grindPose(); this._grindClear();
      this.cb.onGrind && this.cb.onGrind(true, this.grind);
      return true;
    }
  }

  /* ---------------- 长按磨杆 ---------------- */
  // 找附近能磨的杆 / 台边 / 坡顶：在前面或旁边 1.4 米内、高度够得着、方向能顺着滑（夹角 60° 以内）
  railTarget() {
    if (this.hop || (this.mode !== 'ground' && this.mode !== 'air')) return null;
    if (this.mode === 'ground' && (this.manual || this.slide)) return null;
    const vx = this.mode === 'ground' ? Math.sin(this.heading) * this.s : this.v.x;
    const vz = this.mode === 'ground' ? Math.cos(this.heading) * this.s : this.v.z;
    const sp = Math.hypot(vx, vz); if (sp < 1.2) return null;
    const fx = vx / sp, fz = vz / sp, px = this.p.x, pz = this.p.z;
    let best = null, bs = 1e9;
    for (const r of this.T.rails) {
      if (r === this.lastRail && this.time - this.lastRailT < 0.6) continue;
      if (px < Math.min(r.ax, r.bx) - 1.6 || px > Math.max(r.ax, r.bx) + 1.6 || pz < Math.min(r.az, r.bz) - 1.6 || pz > Math.max(r.az, r.bz) + 1.6) continue;
      const hl = Math.hypot(r.dx, r.dz); if (hl < 0.35) continue;
      const ca = (r.dx * fx + r.dz * fz) / hl; if (Math.abs(ca) < 0.5) continue;
      const c = railClosest(r, px, pz);
      if (c.d > 0.9) continue; // 场地小、杆子到处都是：离得够近（0.9 米内）才提示 / 长按吸上去，免得接完板按着手指就被旁边的杆子吸过去
      const dy = c.y - this.p.y; if (dy < -0.45 || dy > 1.1) continue;
      if ((c.x - px) * fx + (c.z - pz) * fz < -0.35) continue;
      const dir = Math.sign(ca), dur = clamp(0.24 + (c.d + Math.max(0, dy)) * 0.07, 0.24, 0.36), spA = sp * Math.abs(ca);
      const u = c.u + dir * spA * dur;
      const left = (dir > 0 ? r.L - u : u) + (dir > 0 ? (r.next ? r.next.L : 0) : (r.prev ? r.prev.L : 0));
      if (left < 0.6) continue; // 前面剩下的杆子太短
      const sc = c.d + Math.max(0, dy) * 0.6 + Math.max(0, -dy) * 0.3;
      if (sc >= bs) continue;
      // 跳过去的弧线不能穿过东西（比如杆子在箱子另一边）：沿路线取几个点检查
      const uu = clamp(u, 0.05, r.L - 0.05), tx = r.ax + r.dx * uu, ty = r.ay + r.dy * uu, tz = r.az + r.dz * uu, peak = 0.22 + Math.max(0, dy) * 0.35;
      let clear = true;
      for (let k = 0.15; k < 0.95 && clear; k += 0.15) {
        const hx = px + (tx - px) * k, hz = pz + (tz - pz) * k, hy = this.p.y + (ty - this.p.y) * k + 4 * peak * k * (1 - k);
        if (this.T.height(hx, hz) > hy - 0.03) clear = false;
      }
      if (!clear) continue;
      bs = sc; best = { r, u: uu, sp: dir * Math.max(0.9, spA), dur, dy, peak };
    }
    if (best) { const r = best.r; best.x = r.ax + r.dx * best.u; best.y = r.ay + r.dy * best.u; best.z = r.az + r.dz * best.u; }
    return best;
  }
  // 长按：自动小跳上去磨（返回 false = 附近没有能磨的）
  lockGrind() {
    const tg = this.railTarget(); if (!tg) return false;
    const p0 = this.p.clone();
    if (this.mode === 'ground') {
      v1.set((tg.x - p0.x) / tg.dur, 2, (tg.z - p0.z) / tg.dur);
      this._toAir(v1, null, 0, 0, 'tail');
    } else if (this.air) this.air.popped = true;
    this.hop = { tg, t: 0, p0, peak: tg.peak };
    this.popPitch = 0.35;
    this.cb.onLock && this.cb.onLock(tg);
    return true;
  }
  _hopStep(dt) {
    const h = this.hop, tg = h.tg;
    h.t += dt; if (this.air) this.air.t += dt;
    const k = Math.min(1, h.t / tg.dur);
    const arc = 4 * h.peak * k * (1 - k), D = Math.max(0.05, tg.dur);
    this.p.set(h.p0.x + (tg.x - h.p0.x) * k, h.p0.y + (tg.y - h.p0.y) * k + arc, h.p0.z + (tg.z - h.p0.z) * k);
    // 保险：万一路线上还是碰到东西，抬到表面上（不会穿进去）
    if (k < 1) { const hT = this.T.height(this.p.x, this.p.z); if (this.p.y < hT + 0.01) this.p.y = hT + 0.01; }
    // 速度按弧线公式算（不用两帧位置差：被抬起来的那一下不会算出一个巨大的速度）
    this.v.set((tg.x - h.p0.x) / D, (tg.y - h.p0.y) / D + (4 * h.peak * (1 - 2 * k)) / D, (tg.z - h.p0.z) / D);
    if (this.air) this.air.maxY = Math.max(this.air.maxY, this.p.y);
    if (k >= 1) {
      this.hop = null;
      this.lastRail = null;
      this._lockNext = true;
      this._startGrind(tg.r, { u: tg.u, x: tg.x, y: tg.y, z: tg.z }, tg.sp);
      this._lockNext = false;
    }
  }
  // 磨杆时侧划：板子在杆上转 90°。顺着杆子（50-50、5-0、Crooked）→ 横过来（Boardslide / Lipslide）；横着 → 顺过来（50-50）
  _grindTurn(dir) {
    const g = this.grind; if (!g || g.turn || g.t < 0.08 || g.type === 'stall') return false;
    const r = g.r, ar = Math.atan2(r.dx, r.dz), a0 = Math.atan2(g.gf[0], g.gf[1]);
    const toSlide = g.type !== 'slide', want = a0 + dir * Math.PI / 2;
    const opts = toSlide ? [ar + Math.PI / 2, ar - Math.PI / 2] : [ar, ar + Math.PI];
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    let best = opts[0]; for (const o of opts) if (Math.abs(wrap(o - want)) < Math.abs(wrap(best - want))) best = o;
    g.turn = { a0, a1: a0 + wrap(best - a0), t: 0, D: 0.14, from: g.type, to: toSlide ? 'slide' : 'axle' };
    this.cb.onGrindTurn && this.cb.onGrindTurn(g, 'start');
    return true;
  }
  _grindOff(type) { const rail = this.grind.r.kind === 'rail', top = rail ? 0.022 : 0; return type === 'slide' ? top + 0.003 - 0.075 : rail ? top - 0.019 : 0.002; }
  _grindPose() {
    const g = this.grind, r = g.r;
    if (g.type === 'stall') { this._stallPose(g); return; }
    // 高度按真实尺寸放（不穿模）：圆杆半径 2.2 厘米；支架最低点离地 1.9 厘米；板底离地 7.5 厘米
    //  · 圆杆上 50-50：支架压在杆子顶上，轮子分在两边 · 台边 / 坡顶上 50-50：轮子压在台面上
    //  · 横着滑（Boardslide / Lipslide）：板子中间的板底压在杆子 / 台边上
    const rail = r.kind === 'rail', T0 = g.turn, eT = T0 ? (() => { const u = Math.min(1, T0.t / T0.D); return u * u * (3 - 2 * u); })() : 0;
    const off = T0 ? this._grindOff(T0.from) + (this._grindOff(T0.to) - this._grindOff(T0.from)) * eT : this._grindOff(g.type); // 转 90° 的时候高度也慢慢变
    this.p.set(r.ax + r.dx * g.u, r.ay + r.dy * g.u + off, r.az + r.dz * g.u);
    // 上方向垂直于杆子
    v1.set(r.dx, r.dy, r.dz);
    v2.set(0, 1, 0).addScaledVector(v1, -v1.y).normalize();
    v3.set(g.gf[0], 0, g.gf[1]);
    if (T0) { const a = T0.a0 + (T0.a1 - T0.a0) * eT; v3.set(Math.sin(a), 0, Math.cos(a)); }
    else if (g.type === 'axle') v3.set(r.dx * Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz || 1), r.dy * Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz || 1), r.dz * Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz || 1));
    frameQuat(this.qv, v2, v3);
    // 在台边 / 坡顶上横着滑：台面那一头的支架会顶到台面，所以板子要朝台面那边翘起来（支架的轮子刚好落在台面上）
    if (g.type === 'slide' && !rail && !T0) {
      if (g.tilt == null) {
        const fx = g.gf[0], fz = g.gf[1], px = this.p.x, pz = this.p.z, ry = r.ay + r.dy * g.u;
        const hf = this.T.height(px + fx * 0.25, pz + fz * 0.25), hb = this.T.height(px - fx * 0.25, pz - fz * 0.25);
        g.tilt = hf > ry - 0.03 && hb < ry - 0.03 ? 1 : hb > ry - 0.03 && hf < ry - 0.03 ? -1 : 0;
      }
      if (g.tilt) {
        // 绕板子中间的板底（压在台边上的那一点）转：板头这边翘起 θ（tanθ ≈ 7.7 / 18）
        const th = 0.405 * g.tilt;
        v1.set(0, 0.075, 0).applyQuaternion(this.qv).add(this.p);
        this.qv.multiply(qt.setFromAxisAngle(v2.set(1, 0, 0), -th));
        this.p.copy(v1).sub(v3.set(0, 0.075, 0).applyQuaternion(this.qv));
      }
    }
    this.qa.copy(this.qv);
  }
  _grindStep(dt) {
    const g = this.grind;
    g.t += dt;
    const I = this.I || {}, holding = (I.touching | 0) > 0 || !!I.hold;
    if (holding) { g.hadTouch = true; g.relT = 0; } else if (g.hadTouch) g.relT = (g.relT || 0) + dt;
    // Stall：停在边上。松手（或停太久）就退回来的那一侧掉下去
    if (g.type === 'stall') {
      if (g.blend) { g.blend.t += dt; if (g.blend.t >= 0.15) g.blend = null; }
      if ((g.hadTouch && g.relT > 0.1 && g.t > 0.2) || g.t > 4) {
        this._grindPose();
        // 坡顶铁边上的 Stall：板子放回坡面上，顺着坡滑回去（像真的 Drop in 回去一样），不是从半空掉下去
        if (g.r.kind === 'coping') {
          const sx = g.side[0], sz = g.side[1], x = g.r.ax + g.r.dx * g.u + sx * 0.16, z = g.r.az + g.r.dz * g.u + sz * 0.16, q = this.T.query(x, z, qA);
          this.lastRail = g.r; this.lastRailT = this.time + 0.2;
          this._endGrind('release');
          this.mode = 'ground'; this.air = null; this.p.set(x, q.h, z); this.gx = q.gx; this.gz = q.gz; this.feat = q.f; this.n.set(-q.gx, 1, -q.gz).normalize();
          this.heading = Math.atan2(-sx, -sz); this.s = 0.05; this.fakie = g.end < 0; this.slip = 0; this.roll = this.rollV = 0; this.manPitch = this.kickPitch = this.popPitch = 0; this.gTilt = 0;
          this._groundFrame(); this.qa.copy(this.qv);
          return;
        }
        v1.set(g.side[0] * 1.3, 0.9, g.side[1] * 1.3);
        this.lastRail = g.r; this.lastRailT = this.time + 0.2;
        this._endGrind('release');
        this.p.y += 0.03; this.p.x += g.side[0] * 0.04; this.p.z += g.side[1] * 0.04;
        this._toAir(v1, null, 0, 0, null, true);
        this.air.noCatch = true;
        return;
      }
      this._grindPose();
      return;
    }
    if (g.hadTouch && g.relT > 0.12 && g.t > 0.25) {
      // 松手：往杆子旁边地势低的一侧跳下来（不会又落回同一根杆上）
      const r0 = g.r; this._grindPose();
      const hl = Math.hypot(r0.dx, r0.dz) || 1, px = r0.dz / hl, pz = -r0.dx / hl;
      const side = this.T.height(this.p.x + px * 0.5, this.p.z + pz * 0.5) <= this.T.height(this.p.x - px * 0.5, this.p.z - pz * 0.5) ? 1 : -1;
      v1.set(r0.dx * g.sp + px * side * 1.2, 2.15, r0.dz * g.sp + pz * side * 1.2); // 松手：小跳下杆（和以前一样高）
      this.lastRail = r0; this.lastRailT = this.time + 0.4;
      this._endGrind('release');
      this.p.y += 0.04;
      this._toAir(v1, null, 0, 0, 'tail', true);
      this.air.noCatch = true;
      return;
    }
    // 侧划转 90°：转完换成新的招式（50-50 ↔ Boardslide / Lipslide），计分也换成新的
    if (g.turn) {
      g.turn.t += dt;
      if (g.turn.t >= g.turn.D) {
        const T0 = g.turn, a = T0.a1; g.turn = null;
        g.type = T0.to; g.gf = [Math.sin(a), Math.cos(a)]; g.tilt = null; g.t = 0.25;
        g.name = T0.to === 'slide' ? (g.r.kind === 'rail' ? 'Boardslide' : 'Lipslide') : '50-50';
        g.pitch = g.pitchLocal = 0;
        this.cb.onGrindTurn && this.cb.onGrindTurn(g, 'end');
      }
    }
    let r = g.r;
    g.sp += -G * r.dy * dt;
    const fr = g.type === 'slide' ? 1.15 : g.type === 'crooked' ? 0.85 : 0.6;
    g.sp -= Math.sign(g.sp) * fr * dt;
    g.u += g.sp * dt;
    if (g.u < 0 || g.u > r.L) {
      const fwd = g.u > r.L, nr = fwd ? r.next : r.prev;
      const dot = nr ? r.dx * nr.dx + r.dy * nr.dy + r.dz * nr.dz : 0;
      if (nr && dot > 0.7) {
        g.u = fwd ? g.u - r.L : nr.L + g.u; g.sp *= dot; g.r = nr; r = nr;
        // 换段时保持板子朝向与新段一致
        const k = Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz) || 1;
        if (g.type === 'axle') { const hl = Math.hypot(r.dx, r.dz) || 1; g.gf = [k * r.dx / hl, k * r.dz / hl]; }
      } else {
        g.u = clamp(g.u, 0, r.L);
        this._grindPose();
        v1.set(r.dx, r.dy, r.dz).multiplyScalar(g.sp); v1.y += 0.35;
        this.lastRail = r; this.lastRailT = this.time;
        this._endGrind('end');
        this.p.y += 0.04;
        this._toAir(v1, null, 0, 0, null, true);
        return;
      }
    }
    // 磨到世界边上的墙（比如整面四分之一管的铁边一直磨到头）：板头要戳进墙了 → 和磨得太慢一样，从低的一侧下来
    let atWall = false;
    if (Math.abs(g.sp) >= 0.35) { this._grindPose(); const pts = this._hull(this.p.x, this.p.y, this.p.z, this.qv, this.visPitch(), 0, 0); for (let i = 0; i < NW; i++) if (this.T.query(pts[i].x, pts[i].z, qD).wall) { atWall = true; break; } }
    if (atWall) { g.u -= g.sp * dt; g.sp = 0; }
    if (Math.abs(g.sp) < 0.35) {
      this._grindPose();
      const hl = Math.hypot(r.dx, r.dz) || 1, px = r.dz / hl, pz = -r.dx / hl;
      const side = this.T.height(this.p.x + px * 0.5, this.p.z + pz * 0.5) <= this.T.height(this.p.x - px * 0.5, this.p.z - pz * 0.5) ? 1 : -1;
      v1.set(r.dx * g.sp + px * side * 0.9, 0.3, r.dz * g.sp + pz * side * 0.9);
      this.lastRail = r; this.lastRailT = this.time;
      this._endGrind('slow');
      this.p.y += 0.04;
      this._toAir(v1, null, 0, 0, null, true);
      return;
    }
    this._grindPose();
    this._grindClear();
  }
  // 在矮的台边上（比如 16 厘米的 Manual 台）磨 / 滑：板头板尾翘太多会戳进地里 → 翘少一点（上杆那一刻和每一步都检查）
  _grindClear() {
    const g = this.grind; if (!g) return;
    for (let k = 0; k < 8; k++) {
      const pts = this._hull(this.p.x, this.p.y, this.p.z, this.qv, this.visPitch(), this.flipA, this.shoveA);
      let worst = 0; for (let i = 0; i < NW; i++) worst = Math.max(worst, this.T.height(pts[i].x, pts[i].z) - pts[i].y);
      if (worst <= 0.004) break;
      g.pitchLocal = (g.pitchLocal || 0) * 0.6; this.popPitch *= 0.6; this.manPitch *= 0.6;
    }
  }
  _endGrind(why) {
    const g = this.grind; if (!g) return;
    this.grind = null; this.mode = 'air';
    this.cb.onGrind && this.cb.onGrind(false, g, why);
  }

  _toBail(reason) {
    if (this.mode === 'ground') { this._groundVel(v1); this.v.copy(v1); }
    else if (this.mode === 'grind') { const g = this.grind; this.v.set(g.r.dx, g.r.dy, g.r.dz).multiplyScalar(g.sp); this.grind = null; }
    this._endManual(false);
    this.slide = null; this.hop = null;
    this.mode = 'bail'; this.bailT = 0; this.bailReason = reason;
    this.bq.copy(this.qv);
    if (this.impA) {
      // Impossible 翻到一半摔了：竖着翻的角度并进姿态（绕后支架转），位置跟着挪，板子留在原处
      const ri = new Quaternion().setFromAxisAngle(XA, -this.impA);
      v1.set(0, 0, -TRUCK_Z); v2.copy(v1).applyQuaternion(ri); v1.sub(v2).applyQuaternion(this.qv); this.p.add(v1);
      this.bq.multiply(ri); this.qv.copy(this.bq); this.bakeQ.multiply(ri); this.baked = true; this.impA = this.impT = this.impW = 0;
    }
    if (this.shoveA || this.flipA) {
      // 翻板是绕板子中心（离地 CY）转的，并进姿态以后就变成绕板子底下转：位置挪一下，板子留在原处
      // （不然板子翻到背面朝下时摔倒，会一下子沉下去 12 厘米，戳进脚下的东西里）
      const f = this.flipA; v1.set(CY * Math.sin(f), CY * (1 - Math.cos(f)), 0).applyQuaternion(this.qv); this.p.add(v1);
      const bk = qt.setFromAxisAngle(Y, this.shoveA), bf = new Quaternion().setFromAxisAngle(Z, this.flipA);
      bk.multiply(bf);
      this.bq.multiply(bk); this.qv.copy(this.bq);
      this.bakeQ.multiply(bk); this.baked = true; // main.js 把画面朝向也一起转（不会突然跳一下）
    }
    const sp = this.v.length();
    this.bw.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 16).multiplyScalar(0.4 + Math.min(1, sp / 5));
    this.v.multiplyScalar(0.75); this.v.y = Math.max(this.v.y, 1.2);
    { const l = this.v.length(); if (l > 12) this.v.multiplyScalar(12 / l); } // 保险：摔出去的速度有上限
    this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.flipW = this.shoveW = 0; this.popPitch = 0; this.manPitch = 0;
    this._unclip(this.bq, 0);
    this.cb.onBail && this.cb.onBail(reason);
  }
  // 摔出去的板子：整块板子（板头板尾、板边、轮子）和地面、东西、墙碰撞，不会穿进去；贴地后慢慢倒平
  _bail(dt) {
    this.bailT += dt;
    this.v.y -= G * dt;
    const wl = this.bw.length();
    const bqPrev = this._bqPrev || (this._bqPrev = new Quaternion()); bqPrev.copy(this.bq);
    if (wl > 1e-4) { qt.setFromAxisAngle(v1.copy(this.bw).divideScalar(wl), wl * dt); this.bq.premultiply(qt); }
    const ox = this.p.x, oz = this.p.z;
    let nx = ox + this.v.x * dt, nz = oz + this.v.z * dt, ny = this.p.y + this.v.y * dt;
    let pen = this._penAt(nx, nz, this._hull(nx, ny, nz, this.bq, 0, 0, 0));
    // 板子在原地翻滚时把一头甩进了东西里：这一步不转，转速反弹回去
    if (pen.wall > 0 && this._penAt(ox, oz, this._hull(ox, ny, oz, this.bq, 0, 0, 0)).wall > 0) {
      this.bq.copy(bqPrev); this.bw.multiplyScalar(-0.3);
      pen = this._penAt(nx, nz, this._hull(nx, ny, nz, this.bq, 0, 0, 0));
    }
    if (pen.wall > 0) {
      const P = HP[pen.wallI], w = this._wallNormalAt(P.x, P.z, P.y, ox, oz);
      const vn = this.v.x * w[0] + this.v.z * w[1];
      if (vn < 0) { this.v.x -= 1.35 * vn * w[0]; this.v.z -= 1.35 * vn * w[1]; }
      this.bw.multiplyScalar(0.7);
      nx = ox; nz = oz;
      // 还戳在里面就往外推一点（最多 0.3 米）
      for (let k = 0; k < 10; k++) {
        pen = this._penAt(nx, nz, this._hull(nx, ny, nz, this.bq, 0, 0, 0));
        if (pen.wall <= 0) break;
        const P2 = HP[pen.wallI], w2 = this._wallNormalAt(P2.x, P2.z, P2.y, nx, nz), dd = Math.min(0.1, pen.wall + 0.005);
        nx += w2[0] * dd; nz += w2[1] * dd;
      }
    }
    if (pen.up > 0) {
      ny += pen.up;
      if (this.v.y < 0) this.v.y = -this.v.y * 0.3;
      const k = Math.exp(-3.2 * dt); this.v.x *= k; this.v.z *= k;
      this.bw.multiplyScalar(Math.exp(-2.6 * dt));
      // 贴着地：慢慢倒平（轮子朝下或者板面朝下，哪边近就倒向哪边）
      const q = this.T.query(nx, nz, qB);
      v1.set(0, 1, 0).applyQuaternion(this.bq); v2.set(-q.gx, 1, -q.gz).normalize();
      if (v1.dot(v2) < 0) v2.negate();
      v3.copy(v1).lerp(v2, damp(5, dt)).normalize();
      qt.setFromUnitVectors(v1, v3); this.bq.premultiply(qt);
    }
    // 圆杆、立柱：摔出去的板子也不能穿过去，推出来、弹开
    {
      let R = this._rodPen(nx, ny, nz, this.bq, 0, 0, 0, null);
      // 翻滚把板子甩进杆子：这一步不转，转速弹回去（和撞墙一样）
      if (R.d > 0.001) { const d1 = R.d; if (this._rodPen(nx, ny, nz, bqPrev, 0, 0, 0, null).d < d1 - 1e-4) { this.bq.copy(bqPrev); this.bw.multiplyScalar(-0.3); } R = this._rodPen(nx, ny, nz, this.bq, 0, 0, 0, null); }
      if (R.d > 0.001) {
        const d = Math.min(0.1, R.d + 0.003); nx += R.n.x * d; ny += R.n.y * d; nz += R.n.z * d;
        const vn = this.v.dot(R.n); if (vn < 0) this.v.addScaledVector(R.n, -1.35 * vn);
        this.bw.multiplyScalar(0.85);
      }
    }
    // 保险：中心点不会掉到地面以下太多
    const hc = this.T.height(nx, nz); if (ny < hc - 0.12) ny = hc - 0.12;
    this.p.set(nx, ny, nz);
    if (this.p.y < -6) { this.respawn(); return; }
    this.qv.copy(this.bq);
    if (this.bailT > 1.6) this.respawn();
  }
  respawn() {
    let { x, z, yaw } = this.safe;
    // 如果摔在平地上，就地复活
    const q = this.T.query(this.p.x, this.p.z, qA);
    if (!q.f && Math.abs(q.gx) + Math.abs(q.gz) < 0.01) {
      let ok = true;
      for (const [ox, oz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) if (Math.abs(this.T.height(this.p.x + ox, this.p.z + oz) - q.h) > 0.01) { ok = false; break; }
      if (ok) { x = this.p.x; z = this.p.z; const ty = this.travelYaw(); yaw = isFinite(ty) ? ty : isFinite(this.heading) ? this.heading : yaw; }
    }
    const safe = this.safe;
    this.reset(x, z, yaw);
    this.safe = safe;
    this.cb.onRespawn && this.cb.onRespawn();
  }
}
