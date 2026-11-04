// 滑板物理：地面滚动 / 空中 / 磨杆 / 摔倒。位置 p 是轮子着地点。
import { Vector3, Quaternion, Matrix4 } from 'three';
import { clamp, TAU, damp } from './util.js';
import { railClosest } from './terrain.js';

export const G = 9.81;
const STEP_TOL = 0.035;          // 能直接滚上去的小坎
const POP = 3.05, POP_K = 1.2;   // 起跳速度 m/s
const FLIP_T = 0.34, SHOVE_T = 0.27;
const MAX_PUSH = 7.2;
// 压板转向：手指压哪边，板面就往哪边倾（像桥胶弹簧一样稍微慢一点跟上），倾斜让支架转动 → 板子沿弧线走
// 弯的大小 = 倾斜程度 × 速度：停着几乎不转；滑得快时弯会变大一些（不会急转甩出去）
const ROLL_MAX = 0.24;           // 最大侧倾约 14°
const ROLL_K = 420, ROLL_C = 30; // 侧倾弹簧（越大跟得越快）
const R_MIN = 1.0;               // 压到底时最小转弯半径（米）
const A_LAT = 13;                // 最大侧向加速度（m/s²），限制高速时的急转
const KICK_S0 = 1.0, KICK_S1 = 2.8; // Kickturn：低于 1 m/s 完全跟手，2.8 m/s 以上不起作用
const SLIP_DEC = 10, SLIP_MAX = 2.5; // 落地侧滑：轮子横着蹭地的减速度、最大侧滑速度
const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const qA = { h: 0, gx: 0, gz: 0, f: null }, qB = { h: 0, gx: 0, gz: 0, f: null }, qC = { h: 0, gx: 0, gz: 0, f: null };
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
    this.fwd = new Vector3(0, 0, 1); this.I = {};
    this.reset(0, 0, 0);
  }
  reset(x, z, yaw) {
    if (!isFinite(yaw)) yaw = 0;
    const q = this.T.query(x, z, qA);
    this.p.set(x, q.h, z); this.v.set(0, 0, 0); this.n.set(-q.gx, 1, -q.gz).normalize();
    this.feat = q.f; this.gx = q.gx; this.gz = q.gz;
    this.mode = 'ground'; this.s = 0; this.heading = yaw; this.fakie = false; this.lean = 0;
    this.roll = 0; this.rollV = 0; this.slip = 0; this.kickAcc = 0; this.kickT = 0; this.kickPitch = 0; this.yawRate = 0;
    this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.spin = 0; this.popPitch = 0; this.shoveBaked = 0;
    this.manual = null; this.manLock = false; this.manPitch = 0; this.manA = 0; this.manReqT = 0; this.slide = null;
    this.air = null; this.grind = null; this.hop = null; this.bailT = 0; this.buf = [];
    this.safe = { x, z, yaw }; this.safeT = 0; this.lastRail = null; this.lastRailT = -9;
    this.wheelRot = 0; this.time = 0; this.impactCD = 0;
    this._groundFrame();
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
  // 画面用的翘板角度（按板子自身方向；Fakie 时方向相反）
  visPitch() {
    const fk = this.mode === 'air' ? !!(this.air && this.air.fakie) : this.fakie;
    let p = this.manPitch + this.popPitch + this.kickPitch;
    if (fk) p = -p;
    if (this.mode === 'grind' && this.grind) p += this.grind.pitchLocal || 0;
    return p;
  }

  /* ---------------- 手势 ---------------- */
  pop(kind, k) {
    k = clamp(k || 0, 0, 1);
    if (this.mode === 'ground') {
      this._groundVel(v1);
      const pv = POP + POP_K * k;
      v1.x += this.n.x * 0.6 * pv; v1.z += this.n.z * 0.6 * pv; v1.y += (this.n.y * 0.6 + 0.4) * pv;
      this._toAir(v1, this.feat, this.gx, this.gz, kind);
    } else if (this.mode === 'grind') {
      const g = this.grind, r = g.r;
      v1.set(r.dx, r.dy, r.dz).multiplyScalar(g.sp); v1.y += (POP + POP_K * k) * 0.88;
      this.lastRail = r; this.lastRailT = this.time;
      this._endGrind('pop');
      this.p.y += 0.04;
      this._toAir(v1, null, 0, 0, kind, true);
    } else if (this.mode === 'air' && this.air && !this.air.popped && this.air.t < 0.12) {
      // 刚离地的一瞬间也允许起跳（土狼时间）
      this.v.y = Math.max(this.v.y, 0) + (POP + POP_K * k) * 0.9;
      this.air.popped = true; this.air.pop = kind; this.popPitch = kind === 'nose' ? -0.45 : 0.45;
      this.cb.onPop && this.cb.onPop(kind);
    } else return false;
    return true;
  }
  flick(which, dir) {
    if (this.mode === 'air' && this.air) this._applyFlick(which, dir);
    else if (this.mode !== 'bail') { this.buf.push({ which, dir, t: this.time }); if (this.buf.length > 4) this.buf.shift(); }
  }
  _applyFlick(which, dir) {
    const a = this.air;
    if (!a || a.landed || this.hop) return;
    // 离地太近、马上要落地就不再受理
    if (a.t > 0.2 && this.p.y - this.T.height(this.p.x, this.p.z) < 0.18 && this.v.y < 0) return;
    if (which === 'front') { this.flipT += dir * TAU; a.flips.push(dir); }
    else { this.shoveT += dir * Math.PI; a.shoves.push(dir); }
    this.cb.onFlick && this.cb.onFlick(which, dir);
  }

  /* ---------------- 主步进 ---------------- */
  step(dt, I) {
    this.I = I; this.time += dt; if (this.impactCD > 0) this.impactCD -= dt;
    this.buf = this.buf.filter((b) => this.time - b.t < 0.16);
    if (this.mode === 'grind' && !this.grind) this.mode = 'air';
    if (this.mode === 'air' && !this.air) this._toAir(this.v, null, 0, 0, null);
    if (this.mode !== 'ground') {
      // 不在地上：板面侧倾慢慢回正，侧滑清零
      this.rollV += (ROLL_K * 0.5 * -this.roll - ROLL_C * 0.7 * this.rollV) * dt; this.roll += this.rollV * dt;
      this.slip = 0; this.kickPitch *= Math.exp(-14 * dt); this.yawRate = 0;
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
      if (kk > 0) { this.heading += kick * kk; this.kickAcc += Math.abs(kick) * kk; this.kickT = 0.28; }
    }
    if (this.kickT > 0) {
      this.kickT -= dt;
      if (this.kickT <= 0) { if (this.kickAcc > 1.0) this.cb.onKick && this.cb.onKick(this.kickAcc); this.kickAcc = 0; }
    }
    this.kickPitch += ((this.kickT > 0 && this.kickAcc > 0.12 ? 0.15 : 0) - this.kickPitch) * damp(16, dt);
    // 速度变成负的（比如冲坡没冲上去往回滑）：掉头变 Fakie。侧倾和侧滑是按行进方向算的，掉头后符号也要反过来（实际倾斜不变）
    if (s < 0) { this.heading += Math.PI; s = -s; this.fakie = !this.fakie; this.roll = -this.roll; this.rollV = -this.rollV; this.slip = -this.slip; }
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
  _wallHit(vx, vz) {
    this.slip = 0; // 撞墙后速度方向重新算（侧滑已经包含在传进来的速度里）
    let w = this._wallNormal(this.p.y);
    if (!w) { const l = Math.hypot(vx, vz) || 1; w = [-vx / l, -vz / l]; }
    const vn = vx * w[0] + vz * w[1];
    if (vn >= 0) return;
    if (-vn > 4.3) { this._toBail('wall'); return; }
    const ux = vx - vn * w[0] * 1.25, uz = vz - vn * w[1] * 1.25, l = Math.hypot(ux, uz);
    if (l > 0.12) {
      const nh = Math.atan2(ux, uz), d = Math.abs(((nh - this.heading + 3 * Math.PI) % TAU) - Math.PI);
      if (d > Math.PI / 2) { this.heading = nh; this.fakie = !this.fakie; } else this.heading = nh;
      this.s = l * 0.9;
    } else this.s = 0;
    if (this.impactCD <= 0 && -vn > 1) { this.impactCD = 0.25; this.cb.onImpact && this.cb.onImpact(-vn); }
    this._endManual(false);
  }

  _toAir(vel, feat, gx, gz, popKind, fromGrind) {
    const wasManual = !!this.manual;
    this._endManual(false);
    if (this.slide) { if (!this.slide.scored) { this.slide.scored = true; this.cb.onSlide && this.cb.onSlide(false, this.slide); } this.slide = null; }
    this.v.copy(vel);
    const vl = vel.length();
    if (feat && feat.trans && vl > 0.5 && vel.y / vl > 0.8) {
      // 竖直墙辅助：把朝墙外的水平速度换成轻微朝回，保证落回过渡面
      const gl = Math.hypot(gx, gz);
      if (gl > 0.5) {
        const ux = gx / gl, uz = gz / gl, vu = this.v.x * ux + this.v.z * uz;
        const tAir = Math.max(0.25, (2 * this.v.y) / G), want = -0.1 / tAir;
        this.v.x += (want - vu) * ux; this.v.z += (want - vu) * uz;
      }
    }
    if (this.mode === 'ground') this._groundFrame();
    this.qa.copy(this.qv);
    this.mode = 'air';
    this.spin = 0; this.flipA = this.flipT = this.shoveA = this.shoveT = 0;
    const lipY = feat && feat.trans ? (feat.t === 'bowl' ? 0 : feat.hl) : null;
    this.air = { t: 0, feat: feat || null, popped: !!popKind, pop: popKind, fakie: this.fakie, y0: this.p.y, maxY: this.p.y, lipY, fromTrans: !!(feat && feat.trans), fromGrind: !!fromGrind, flips: [], shoves: [], wasManual };
    if (popKind) {
      this.popPitch = popKind === 'nose' ? -0.45 : 0.45;
      this.cb.onPop && this.cb.onPop(popKind);
      for (const b of this.buf) this._applyFlick(b.which, b.dir);
      this.buf.length = 0;
    }
  }

  _air(dt, I) {
    if (this.hop) { this._hopStep(dt); return; }
    const a = this.air, T = this.T;
    a.t += dt;
    const dSpin = (I.twist || 0) + (I.spinRate || 0) * dt;
    if (dSpin) { this.spin += dSpin; qt.setFromAxisAngle(Y, dSpin); this.qa.multiply(qt); }
    if (this.flipA !== this.flipT) {
      const d = Math.sign(this.flipT - this.flipA); this.flipA += (d * TAU / FLIP_T) * dt;
      if ((this.flipT - this.flipA) * d <= 0) this.flipA = this.flipT;
    }
    if (this.shoveA !== this.shoveT) {
      const d = Math.sign(this.shoveT - this.shoveA); this.shoveA += (d * Math.PI / SHOVE_T) * dt;
      if ((this.shoveT - this.shoveA) * d <= 0) this.shoveA = this.shoveT;
    }
    this.popPitch *= Math.exp(-7 * dt);
    this.manPitch *= Math.exp(-12 * dt);
    this.v.y -= G * dt;
    const vl = this.v.length(); if (vl > 25) this.v.multiplyScalar(25 / vl);
    // 安全网：卡在物体里 → 推出来；掉出世界或空中太久 → 复活
    let hNow = T.height(this.p.x, this.p.z);
    if (this.p.y < hNow - 0.03) { this._unstick(hNow); hNow = T.height(this.p.x, this.p.z); }
    if (a.t > 8 || this.p.y < -6) { this.respawn(); return; }
    const nx = this.p.x + this.v.x * dt, ny = this.p.y + this.v.y * dt, nz = this.p.z + this.v.z * dt;
    const qn = T.query(nx, nz, qB);
    // 只有“坡度解释不了的高度突变”才算墙（陡的过渡面不算墙，要落上去）
    const jump = qn.h - hNow, stepLen = Math.hypot(nx - this.p.x, nz - this.p.z), gm = Math.hypot(qn.gx, qn.gz);
    if (qn.wall || (qn.h > ny + 0.25 && jump > 0.2 && jump > gm * stepLen * 2 + 0.05)) {
      const w = this._wallNormal(ny) || [-Math.sign(this.v.x) || 1, 0];
      const vn = this.v.x * w[0] + this.v.z * w[1];
      if (vn < 0) { this.v.x -= 1.3 * vn * w[0]; this.v.z -= 1.3 * vn * w[1]; }
      if (this.impactCD <= 0) { this.impactCD = 0.25; this.cb.onImpact && this.cb.onImpact(Math.abs(vn)); }
      this.p.y = ny;
      return;
    }
    if (this.v.y < 0.8 && this._tryGrind(nx, ny, nz)) return;
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
    let fail = null;
    if (Math.abs(this.flipT - this.flipA) > 0.6) fail = 'flip';
    else if (Math.abs(this.shoveT - this.shoveA) > 0.6) fail = 'shove';
    if (this.shoveT) { qt.setFromAxisAngle(Y, this.shoveT); this.qa.multiply(qt); this.shoveBaked += this.shoveT; } // 画面朝向也要一起转（见 main.js）
    this.flipA = this.flipT = this.shoveA = this.shoveT = 0;
    const f3 = v3.set(0, 0, 1).applyQuaternion(this.qa);
    f3.addScaledVector(n, -f3.dot(n));
    if (f3.lengthSq() < 1e-6) f3.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    f3.normalize();
    const vtl = vt.length();
    const c = vtl > 0.6 ? f3.dot(vt) / vtl : (f3.dot(vt) >= 0 ? 1 : -1);
    const ac = Math.abs(c);
    let quality = ac > 0.985 ? 'clean' : 'ok';
    if (!fail) {
      if (ac < 0.47) fail = 'angle';
      else if (ac < 0.82) quality = 'sketchy';
      if (vn > 11) fail = 'hard';
      const needCatch = !a.noCatch && (a.popped || a.t > 0.55); // 松手下杆那一跳不用接板
      if (!fail && needCatch && !this.I.caught) fail = 'catch';
    }
    if (fail) { this.qv.copy(this.qa); this._toBail(fail); return; }
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
      air: a, quality, fakie, spin: this.spin, flips: a.flips, shoves: a.shoves, pop: a.pop, t: a.t,
      height: a.maxY - a.y0, above: a.lipY != null ? a.maxY - a.lipY : 0, impact: vn, fingers: this.I.fingers || 0, landFeat: q.f, y: this.p.y,
    };
    this._groundFrame();
    this.cb.onLand && this.cb.onLand(info);
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
      if (Math.abs(this.flipT - this.flipA) > 0.6 || Math.abs(this.shoveT - this.shoveA) > 0.6) { this._toBail('flip'); return true; }
      if (this.shoveT) { qt.setFromAxisAngle(Y, this.shoveT); this.qa.multiply(qt); this.shoveBaked += this.shoveT; } // 画面朝向也要一起转（见 main.js）
      this.flipA = this.flipT = this.shoveA = this.shoveT = 0;
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
      this._grindPose();
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
      if (c.d > 1.4) continue;
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
  _grindPose() {
    const g = this.grind, r = g.r;
    const off = g.type === 'slide' ? -0.1 : -0.035;
    this.p.set(r.ax + r.dx * g.u, r.ay + r.dy * g.u + off, r.az + r.dz * g.u);
    // 上方向垂直于杆子
    v1.set(r.dx, r.dy, r.dz);
    v2.set(0, 1, 0).addScaledVector(v1, -v1.y).normalize();
    v3.set(g.gf[0], 0, g.gf[1]);
    if (g.type === 'axle') v3.set(r.dx * Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz || 1), r.dy * Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz || 1), r.dz * Math.sign(g.gf[0] * r.dx + g.gf[1] * r.dz || 1));
    frameQuat(this.qv, v2, v3);
    this.qa.copy(this.qv);
  }
  _grindStep(dt) {
    const g = this.grind;
    g.t += dt;
    const I = this.I || {}, holding = (I.touching | 0) > 0 || !!I.hold;
    if (holding) { g.hadTouch = true; g.relT = 0; } else if (g.hadTouch) g.relT = (g.relT || 0) + dt;
    if (g.hadTouch && g.relT > 0.12 && g.t > 0.25) {
      // 松手：往杆子旁边地势低的一侧跳下来（不会又落回同一根杆上）
      const r0 = g.r; this._grindPose();
      const hl = Math.hypot(r0.dx, r0.dz) || 1, px = r0.dz / hl, pz = -r0.dx / hl;
      const side = this.T.height(this.p.x + px * 0.5, this.p.z + pz * 0.5) <= this.T.height(this.p.x - px * 0.5, this.p.z - pz * 0.5) ? 1 : -1;
      v1.set(r0.dx * g.sp + px * side * 1.2, POP * 0.7, r0.dz * g.sp + pz * side * 1.2);
      this.lastRail = r0; this.lastRailT = this.time + 0.4;
      this._endGrind('release');
      this.p.y += 0.04;
      this._toAir(v1, null, 0, 0, 'tail', true);
      this.air.noCatch = true;
      return;
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
    const sp = this.v.length();
    this.bw.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 16).multiplyScalar(0.4 + Math.min(1, sp / 5));
    this.v.multiplyScalar(0.75); this.v.y = Math.max(this.v.y, 1.2);
    { const l = this.v.length(); if (l > 12) this.v.multiplyScalar(12 / l); } // 保险：摔出去的速度有上限
    this.flipA = this.flipT = this.shoveA = this.shoveT = 0; this.popPitch = 0; this.manPitch = 0;
    this.cb.onBail && this.cb.onBail(reason);
  }
  _bail(dt) {
    this.bailT += dt;
    this.v.y -= G * dt;
    const nx = this.p.x + this.v.x * dt, nz = this.p.z + this.v.z * dt;
    const h0 = this.T.height(this.p.x, this.p.z), q = this.T.query(nx, nz, qB);
    if (q.wall || q.h > Math.max(this.p.y, h0) + 0.25) { this.v.x *= -0.3; this.v.z *= -0.3; }
    else { this.p.x = nx; this.p.z = nz; }
    this.p.y += this.v.y * dt;
    if (this.p.y < -6) { this.respawn(); return; }
    const h = this.T.height(this.p.x, this.p.z);
    if (this.p.y < h + 0.05) {
      this.p.y = h + 0.05;
      if (this.v.y < 0) this.v.y = -this.v.y * 0.3;
      const k = Math.exp(-3.2 * dt); this.v.x *= k; this.v.z *= k;
      this.bw.multiplyScalar(Math.exp(-2.6 * dt));
    }
    const wl = this.bw.length();
    if (wl > 1e-4) { qt.setFromAxisAngle(v1.copy(this.bw).divideScalar(wl), wl * dt); this.bq.premultiply(qt); }
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
