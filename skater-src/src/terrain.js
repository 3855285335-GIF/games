// 地形：每个障碍物都是解析函数（高度 + 坡度），物理和画面用同一份数据
import { clamp } from './util.js';


function frame(f) {
  f.c = Math.cos(f.yaw || 0); f.s = Math.sin(f.yaw || 0);
}
// 世界 -> 局部（局部 +z = 世界 (sin yaw, cos yaw)）
export function toLocal(f, x, z) {
  const dx = x - f.x, dz = z - f.z;
  return [dx * f.c - dz * f.s, dx * f.s + dz * f.c];
}
export function toWorld(f, lx, lz) {
  return [f.x + lx * f.c + lz * f.s, f.z - lx * f.s + lz * f.c];
}
export function dirWorld(f, lx, lz) { return [lx * f.c + lz * f.s, -lx * f.s + lz * f.c]; }

const T = { h: 0, gx: 0, gz: 0 };

/* ---------- 各类障碍物的局部求值：返回高度（不在范围内返回 -Infinity），坡度写入 T ---------- */
const EVAL = {
  // 四分之一管：沿 +z 升高，半径 r，顶角 a，后面平台 deck
  qp(f, lx, lz) {
    if (lx < -f.w / 2 || lx > f.w / 2 || lz < 0) return -Infinity;
    if (lz <= f.zl) { const s = Math.sqrt(f.r * f.r - lz * lz); T.gx = 0; T.gz = lz / s; return f.r - s; }
    if (lz <= f.zl + f.deck) { T.gx = 0; T.gz = 0; return f.hl; }
    return -Infinity;
  },
  // 直坡：沿 +z 从 0 升到 h，后面平台 deck
  ramp(f, lx, lz) {
    if (lx < -f.w / 2 || lx > f.w / 2 || lz < 0) return -Infinity;
    if (lz <= f.l) { T.gx = 0; T.gz = f.h / f.l; return (f.h * lz) / f.l; }
    if (lz <= f.l + (f.deck || 0)) { T.gx = 0; T.gz = 0; return f.h; }
    return -Infinity;
  },
  box(f, lx, lz) {
    if (Math.abs(lx) > f.w / 2 || Math.abs(lz) > f.d / 2) return -Infinity;
    T.gx = 0; T.gz = 0; return f.h;
  },
  // 台阶：从 lz=0 (高 n*rise 的平台边) 沿 +z 往下
  stairs(f, lx, lz) {
    if (Math.abs(lx) > f.w / 2 || lz < 0 || lz >= (f.n - 1) * f.run) return -Infinity;
    const k = Math.floor(lz / f.run);
    T.gx = 0; T.gz = 0; return (f.n - 1 - k) * f.rise;
  },
  pyr(f, lx, lz) {
    const ex = f.w / 2 - Math.abs(lx), ez = f.d / 2 - Math.abs(lz), e = Math.min(ex, ez);
    if (e < 0) return -Infinity;
    if (e >= f.run) { T.gx = 0; T.gz = 0; return f.h; }
    const k = f.h / f.run;
    if (ex < ez) { T.gx = -Math.sign(lx) * k; T.gz = 0; } else { T.gx = 0; T.gz = -Math.sign(lz) * k; }
    return k * e;
  },
};

// 碗池（往下挖）：平底半宽 ax/az，过渡半径 r，顶角 a，唇边与地面齐平
// exit = { side: ±1（局部 z 方向）, w: 半宽, L: 坡长 }：在这一边的池壁开一个缺口，用缓坡从池底通到地面（不然进去就出不来）
function evalBowl(f, lx, lz) {
  const ex = f.exit;
  if (ex && Math.abs(lx) <= ex.w) {
    const zz = lz * ex.side;
    if (zz >= f.az) {
      if (zz >= f.az + ex.L) return null; // 坡顶以外就是地面
      T.gx = 0; T.gz = (f.D / ex.L) * ex.side;
      return -f.D + (f.D * (zz - f.az)) / ex.L;
    }
  }
  const qx = Math.abs(lx) - f.ax, qz = Math.abs(lz) - f.az;
  const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;
  const d = Math.hypot(mx, mz);
  if (d >= f.zl) return null;
  if (d <= 1e-6) { T.gx = 0; T.gz = 0; return -f.D; }
  const s = Math.sqrt(f.r * f.r - d * d), k = d / s;
  T.gx = (k * mx / d) * Math.sign(lx); T.gz = (k * mz / d) * Math.sign(lz);
  return -f.D + f.r - s;
}

export class Terrain {
  constructor(bounds) { this.bounds = bounds; this.feats = []; this.cuts = []; this.rails = []; }
  add(f) {
    frame(f);
    if (f.t === 'qp') {
      f.a = f.a || 80 * Math.PI / 180; f.zl = f.r * Math.sin(f.a); f.hl = f.r * (1 - Math.cos(f.a)); f.deck = f.deck || 0;
      f.ext = Math.hypot(f.w / 2, f.zl + f.deck); f.trans = f.a > 0.9;
    } else if (f.t === 'ramp') f.ext = Math.hypot(f.w / 2, f.l + (f.deck || 0));
    else if (f.t === 'box' || f.t === 'pyr') f.ext = Math.hypot(f.w / 2, f.d / 2);
    else if (f.t === 'stairs') f.ext = Math.hypot(f.w / 2, f.n * f.run);
    else if (f.t === 'bowl') {
      f.a = f.a || 80 * Math.PI / 180; f.zl = f.r * Math.sin(f.a); f.D = f.r * (1 - Math.cos(f.a));
      f.ext = Math.hypot(f.ax + f.zl, f.az + f.zl); f.trans = true;
      if (f.exit) f.ext = Math.max(f.ext, Math.hypot(f.exit.w, f.az + f.exit.L));
    }
    f.br2 = (f.ext + 0.5) ** 2;
    if (f.t === 'bowl') this.cuts.push(f); else { f.ev = EVAL[f.t]; this.feats.push(f); }
    return f;
  }
  // 滑杆：3D 线段，可首尾相连
  rail(ax, ay, az, bx, by, bz, kind, opt) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
    const r = Object.assign({ ax, ay, az, bx, by, bz, L, dx: dx / L, dy: dy / L, dz: dz / L, kind: kind || 'rail', id: this.rails.length, prev: null, next: null }, opt || {});
    r.hL = Math.hypot(dx, dz);
    this.rails.push(r);
    return r;
  }
  link(list, closed) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i], b = list[(i + 1) % list.length];
      if (i < list.length - 1 || closed) { a.next = b; b.prev = a; }
    }
  }
  // 查询：返回高度、世界坐标坡度、所属障碍物
  query(x, z, out) {
    let h = 0, gx = 0, gz = 0, feat = null;
    const B = this.bounds;
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) {
      out.h = 50; out.gx = 0; out.gz = 0; out.f = null; out.wall = true; return out;
    }
    for (let i = 0; i < this.cuts.length; i++) {
      const f = this.cuts[i], dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz > f.br2) continue;
      const lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
      const v = evalBowl(f, lx, lz);
      if (v !== null) { h = v; gx = T.gx * f.c + T.gz * f.s; gz = -T.gx * f.s + T.gz * f.c; feat = f; }
    }
    for (let i = 0; i < this.feats.length; i++) {
      const f = this.feats[i], dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz > f.br2) continue;
      const lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
      const v = f.ev(f, lx, lz);
      if (v > h) { h = v; gx = T.gx * f.c + T.gz * f.s; gz = -T.gx * f.s + T.gz * f.c; feat = f; }
    }
    out.h = h; out.gx = gx; out.gz = gz; out.f = feat; out.wall = false;
    return out;
  }
  height(x, z) { return this.query(x, z, QH).h; }
}
const QH = { h: 0, gx: 0, gz: 0, f: null };

// 圆杆的立柱放在哪（杆子底下那一点，画面和碰撞共用）：扶手只在两头，平杆大约每 2.2 米一根
export function railPosts(r) {
  const posts = [];
  if (r.hand) { if (!r.prev) posts.push([r.ax, r.ay, r.az]); posts.push([r.bx, r.by, r.bz]); }
  else { const n = Math.max(1, Math.round(r.L / 2.2)); for (let i = 0; i <= n; i++) posts.push([r.ax + (r.bx - r.ax) * i / n, r.ay + (r.by - r.ay) * i / n, r.az + (r.bz - r.az) * i / n]); }
  return posts;
}
// 点到 3D 线段（只看水平距离）的最近参数
export function railClosest(r, x, z) {
  const px = x - r.ax, pz = z - r.az;
  const hx = r.bx - r.ax, hz = r.bz - r.az, hh = hx * hx + hz * hz;
  let t = hh > 1e-9 ? (px * hx + pz * hz) / hh : 0;
  t = clamp(t, 0, 1);
  const cx = r.ax + hx * t, cz = r.az + hz * t, cy = r.ay + (r.by - r.ay) * t;
  return { t, u: t * r.L, x: cx, y: cy, z: cz, d: Math.hypot(x - cx, z - cz) };
}
