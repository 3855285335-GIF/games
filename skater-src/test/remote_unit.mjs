// 远程玩家补间单元测试：曲线补间、落地转板/翻板、复位、旧版消息
import { Remote } from '../src/net.js';
import { Quaternion, Vector3 } from 'three';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const LAT = 60; // 网络延迟（毫秒）
const yawQ = (deg) => { const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), deg * Math.PI / 180); return [q.x, q.y, q.z, q.w]; };
const mk = () => ({ p: [0, 0, 0], q: new Quaternion() });
function feed(R, snaps) { for (const s of snaps) R.push(s, s.t + LAT); }
// 在“渲染时刻 rt”取样：sample 用的是 now，rt = now - offset - delay
const at = (R, rt, out) => { R.sample(rt + R.offset + R.delay, out); return out; };
const visYaw = (o) => { const q = o.q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), o.h)); return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) * 57.2958; };

// 1) 腾空弧线 + 平地转弯：4Hz 曲线补间 vs 直线补间的误差
function traj(kind, t) {
  if (kind === 'air') { const g = -9.8; return { p: [3 * t, 0.2 + 4 * t + 0.5 * g * t * t, 0], w: [3, 4 + g * t, 0] }; }
  const r = 4, om = 1.2; return { p: [r * Math.sin(om * t), 0, r * (1 - Math.cos(om * t))], w: [r * om * Math.cos(om * t), 0, r * om * Math.sin(om * t)] };
}
for (const kind of ['air', 'carve']) {
  const errs = { curve: 0, line: 0 }, T = kind === 'air' ? 0.75 : 3; // 只在有消息覆盖的时间段里比较
  for (const withW of [true, false]) {
    const R = new Remote('x'), snaps = [];
    for (let t = 0; t <= T + 1e-9; t += 0.25) { const s = traj(kind, t); snaps.push({ t: Math.round(1000 + t * 1000), p: s.p, q: yawQ(0), m: kind === 'air' ? 1 : 0, ...(withW ? { w: s.w } : {}) }); }
    feed(R, snaps); let mx = 0; const o = mk();
    for (let t = 0.01; t < T - 0.01; t += 0.016) { at(R, 1000 + t * 1000, o); const s = traj(kind, t); mx = Math.max(mx, Math.hypot(o.p[0] - s.p[0], o.p[1] - s.p[1], o.p[2] - s.p[2])); }
    errs[withW ? 'curve' : 'line'] = mx;
  }
  ok(errs.curve < errs.line * 0.35 && errs.curve < 0.03, `${kind === 'air' ? '腾空弧线' : '平地转弯'} 4Hz：曲线最大误差 ${(errs.curve * 100).toFixed(1)}cm，直线 ${(errs.line * 100).toFixed(1)}cm`);
}

// 2) 转板落地：最后一条空中消息 h=-2.0（目标 -π），落地消息朝向已并进 -180°、h=0
{
  const R = new Remote('x');
  feed(R, [
    { t: 1000, p: [0, 0, 0], q: yawQ(0), m: 0, w: [3, 0, 0] },
    { t: 1100, p: [0.3, 0.3, 0], q: yawQ(0), m: 1, w: [3, 3, 0], h: -0.6, ht: -Math.PI },
    { t: 1350, p: [1.05, 0.5, 0], q: yawQ(0), m: 1, w: [3, -1, 0], h: -2.0, ht: -Math.PI },
    { t: 1500, p: [1.5, 0, 0], q: yawQ(-180), m: 0, w: [3, -3, 0], h: 0, ht: 0 },
    { t: 1750, p: [2.25, 0, 0], q: yawQ(-180), m: 0, w: [3, 0, 0], h: 0 },
  ]);
  const o = mk(); let prev = null, maxStep = 0, back = 0;
  for (let rt = 1100; rt <= 1740; rt += 16) { at(R, rt, o); const y = visYaw(o); if (prev !== null) { let d = y - prev; d = ((d + 540) % 360) - 180; maxStep = Math.max(maxStep, Math.abs(d)); if (d > 1) back++; } prev = y; }
  ok(maxStep < 25 && back === 0 && Math.abs(Math.abs(prev) - 180) < 1, `转板落地：每帧最多转 ${maxStep.toFixed(1)}°，倒转帧 ${back}，最后朝向 ${prev.toFixed(0)}°`);
}

// 3) 翻板落地：f 从 -4.0 接着转到 -2π，不倒转
{
  const R = new Remote('x');
  feed(R, [
    { t: 1000, p: [0, 0.4, 0], q: yawQ(0), m: 1, w: [3, 1, 0], f: -1.5, ft: -6.28 },
    { t: 1250, p: [0.75, 0.5, 0], q: yawQ(0), m: 1, w: [3, -1, 0], f: -4.0, ft: -6.28 },
    { t: 1400, p: [1.2, 0, 0], q: yawQ(0), m: 0, w: [3, -3, 0], f: 0, ft: 0 },
    { t: 1650, p: [1.95, 0, 0], q: yawQ(0), m: 0, w: [3, 0, 0], f: 0 },
  ]);
  const o = mk(); let prev = null, rev = 0, last = 0;
  for (let rt = 1000; rt <= 1395; rt += 16) { at(R, rt, o); if (prev !== null && o.f > prev + 1e-6) rev++; prev = o.f; last = o.f; }
  at(R, 1600, o);
  ok(rev === 0 && last < -6.0 && Math.abs(o.f) < 1e-6, `翻板落地：倒转帧 ${rev}，落地前 f=${last.toFixed(2)}，落地后 f=${o.f.toFixed(2)}`);
}

// 4) 复位：位置跳 50 米，中间不应出现“滑过去”的点
{
  const R = new Remote('x');
  feed(R, [
    { t: 1000, p: [0, 0, 0], q: yawQ(0), m: 0, w: [2, 0, 0], j: 3 },
    { t: 1250, p: [0.5, 0, 0], q: yawQ(0), m: 0, w: [2, 0, 0], j: 3 },
    { t: 1300, p: [50, 0, 50], q: yawQ(90), m: 0, w: [0, 0, 0], j: 4 },
    { t: 1550, p: [50, 0, 50], q: yawQ(90), m: 0, w: [0, 0, 0], j: 4 },
  ]);
  const o = mk(); let mid = 0;
  for (let rt = 1000; rt <= 1540; rt += 8) { at(R, rt, o); const d0 = Math.hypot(o.p[0], o.p[2]), d1 = Math.hypot(o.p[0] - 50, o.p[2] - 50); if (d0 > 2 && d1 > 2) mid++; }
  ok(mid === 0, `复位：中间“滑过去”的帧 ${mid}`);
}

// 5) 旧版本消息（没有 w/j/ft/ht）：直线补间照常，没有 NaN
{
  const R = new Remote('x');
  feed(R, [{ t: 1000, p: [0, 0, 0], q: yawQ(0), m: 0, v: 2 }, { t: 1167, p: [0.33, 0, 0], q: yawQ(10), m: 0, v: 2 }, { t: 1333, p: [0.66, 0, 0], q: yawQ(20), m: 0, v: 2 }]);
  const o = mk(); let bad = 0, mono = true, px = -1;
  for (let rt = 1000; rt <= 1500; rt += 16) { at(R, rt, o); if (![...o.p, o.q.x, o.q.w, o.f, o.h].every(Number.isFinite)) bad++; if (o.p[0] < px - 1e-9) mono = false; px = o.p[0]; }
  ok(bad === 0 && mono, `旧版消息：NaN 帧 ${bad}，位置单调 ${mono}`);
}

// 6) 速度和位移对不上（摔倒乱滚）：自动退回直线，不会画出大圈
{
  const R = new Remote('x');
  feed(R, [{ t: 1000, p: [0, 0, 0], q: yawQ(0), m: 3, w: [30, 0, -30] }, { t: 1250, p: [0.2, 0, 0], q: yawQ(0), m: 3, w: [-30, 0, 30] }, { t: 1500, p: [0.3, 0, 0], q: yawQ(0), m: 3, w: [0, 0, 0] }]);
  const o = mk(); let mx = 0;
  for (let rt = 1000; rt <= 1500; rt += 16) { at(R, rt, o); mx = Math.max(mx, Math.hypot(o.p[0], o.p[2])); }
  ok(mx < 0.35, `速度异常：最远偏到 ${mx.toFixed(2)}m（应在 0.3m 内）`);
}

// 8) 站着不动（2 秒发一次）→ 起步：不会先慢慢挪再突然加速；过几秒也不会因为显示延后变短而往前瞬移
for (const hint of [true, false]) {
  const R = new Remote('x'), o = mk(), V = 5, TS = 6000, tag = hint ? '' : '（没有间隔提示的旧消息）';
  const sender = []; // 发送方：站着时 2 秒一条；起步那一刻补发一条；之后 4 Hz
  for (let t = 1000; t < TS; t += 2000) sender.push({ t, p: [0, 0, 0], q: yawQ(90), m: 0, v: 0, w: [0, 0, 0] });
  // 蹬一脚：0.15 秒内从 0 加速到 V（真实的推板加速）
  const pos = (t) => { const u = (t - TS) / 1000, A = V / 0.15; return u <= 0 ? 0 : u < 0.15 ? 0.5 * A * u * u : 0.5 * A * 0.0225 + V * (u - 0.15); };
  const vel = (t) => { const u = (t - TS) / 1000; return u <= 0 ? 0 : Math.min(V, (V / 0.15) * u); };
  sender.push({ t: TS + 16, p: [pos(TS + 16), 0, 0], q: yawQ(90), m: 0, v: vel(TS + 16), w: [vel(TS + 16), 0, 0] }); // 起步补发
  for (let t = TS + 250; t < TS + 12000; t += 250) sender.push({ t, p: [pos(t), 0, 0], q: yawQ(90), m: 0, v: V, w: [V, 0, 0] });
  let k = 0, prevX = null, prevV = null, maxJerk = 0, maxV = 0, movedEarly = 0, firstMoveT = null;
  for (let now = 1100; now < TS + 11000; now += 16) {
    while (k < sender.length && sender[k].t + LAT <= now) { if (hint) R.interval = 250; R.push(sender[k], sender[k].t + LAT); k++; } // 游戏里每条消息都带发送间隔提示 iv=250
    R.sample(now, o);
    const rt = now - R.lag;
    if (prevX !== null) {
      const v = (o.p[0] - prevX) / 0.016;
      if (rt < TS - 5 && Math.abs(v) > 0.05) movedEarly++;
      if (firstMoveT === null && v > 0.1) firstMoveT = rt;
      if (rt > TS + 300 && prevV !== null) maxJerk = Math.max(maxJerk, Math.abs(v - prevV));
      maxV = Math.max(maxV, v); prevV = v;
    }
    prevX = o.p[0];
  }
  ok(movedEarly === 0, `起步前对方的板子不会提前慢慢挪${tag}：提前动的帧 ${movedEarly}`);
  ok(maxV < V * (hint ? 1.05 : 1.2), `起步后不会突然加速 / 瞬移${tag}：最大显示速度 ${maxV.toFixed(2)} m/s（实际 ${V}）`);
  ok(maxJerk < 0.6, `匀速滑行时显示速度平稳${tag}：相邻帧速度变化最大 ${maxJerk.toFixed(2)} m/s`);
}
// 7) 翻板落地后板子还差一点点没正（f 只剩 -0.05，新版物理）：接着原来的圈数转完，不倒转
{
  const R = new Remote('x');
  feed(R, [
    { t: 1000, p: [0, 0.4, 0], q: yawQ(0), m: 1, w: [3, 1, 0], f: -3.0, ft: -6.28 },
    { t: 1250, p: [0.75, 0.5, 0], q: yawQ(0), m: 1, w: [3, -1, 0], f: -5.9, ft: -6.28 },
    { t: 1400, p: [1.2, 0, 0], q: yawQ(0), m: 0, w: [3, -3, 0], f: -0.05, ft: 0 },
    { t: 1650, p: [1.95, 0, 0], q: yawQ(0), m: 0, w: [3, 0, 0], f: 0 },
  ]);
  const o = mk(); let prev = null, rev = 0, mx = 0;
  for (let rt = 1000; rt <= 1395; rt += 16) { at(R, rt, o); if (prev !== null) { if (o.f > prev + 1e-6) rev++; mx = Math.max(mx, Math.abs(o.f - prev)); } prev = o.f; }
  at(R, 1640, o);
  ok(rev === 0 && mx < 0.5 && Math.abs(o.f) < 0.06, `翻板落地剩一点角度：倒转帧 ${rev}，每帧最多转 ${(mx * 57.3).toFixed(0)}°，落地后 f=${o.f.toFixed(2)}`);
}

// 8) 摔倒：对方把翻板角并进了姿态（q 多转了 β，f 归零）。画面上的板子不能突然多转一圈
for (const beta of [2.0, 4.0, -5.0]) {
  const R = new Remote('x'), Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0);
  const qz = (a) => { const q = new Quaternion().setFromAxisAngle(Z, a); return [q.x, q.y, q.z, q.w]; };
  feed(R, [
    { t: 1000, p: [0, 0.5, 0], q: qz(0), m: 1, w: [2, 0, 0], f: beta * 0.8, ft: beta * 0.8 },
    { t: 1100, p: [0.2, 0.4, 0], q: qz(0), m: 1, w: [2, -1, 0], f: beta, ft: beta },
    { t: 1200, p: [0.4, 0.2, 0], q: qz(beta), m: 3, w: [2, -1, 0], f: 0 },
    { t: 1300, p: [0.6, 0.1, 0], q: qz(beta), m: 3, w: [1, 0, 0], f: 0 },
  ]);
  const o = mk(), tot = (o) => o.q.clone().multiply(new Quaternion().setFromAxisAngle(Y, o.h)).multiply(new Quaternion().setFromAxisAngle(Z, o.f));
  let prev = null, mx = 0;
  for (let rt = 1100; rt <= 1300; rt += 8) { at(R, rt, o); const q = tot(o); if (prev) mx = Math.max(mx, 2 * Math.acos(Math.min(1, Math.abs(q.dot(prev))))); prev = q; }
  ok(mx < 0.2, `摔倒并进翻板角 ${(beta * 57.3).toFixed(0)}°：每帧最多转 ${(mx * 57.3).toFixed(1)}°`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
