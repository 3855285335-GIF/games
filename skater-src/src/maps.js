// 地图：只留一张紧凑的街式场地（玩滑板就是为了做招）。所有障碍物都是解析地形，物理和画面共用
import { Terrain, toWorld } from './terrain.js';

const D2R = Math.PI / 180, PI = Math.PI;
export const MAPS = [
  { id: 'spot', name: '街区', desc: '24 × 24 米，道具挨着放，几秒一个' },
];
// 盒子较长的两条棱做成可磨的边
function ledgeEdges(T, f, kind) {
  const hw = f.w / 2, hd = f.d / 2;
  if (f.w >= f.d) for (const sz of [-1, 1]) { const a = toWorld(f, -hw + 0.05, sz * hd), b = toWorld(f, hw - 0.05, sz * hd); T.rail(a[0], f.h, a[1], b[0], f.h, b[1], kind || 'ledge', { box: f }); }
  else for (const sx of [-1, 1]) { const a = toWorld(f, sx * hw, -hd + 0.05), b = toWorld(f, sx * hw, hd - 0.05); T.rail(a[0], f.h, a[1], b[0], f.h, b[1], kind || 'ledge', { box: f }); }
}
function copingOf(T, f) {
  const a = toWorld(f, -f.w / 2 + 0.05, f.zl), b = toWorld(f, f.w / 2 - 0.05, f.zl);
  return T.rail(a[0], f.hl, a[1], b[0], f.hl, b[1], 'coping', { qp: f });
}
function bowlCoping(T, b) {
  // 注意：碗池的 yaw 都是 0（局部坐标 = 世界坐标平移）
  const L = b.zl, pts = [], ex = b.exit;
  const corners = [[b.ax, b.az, 0], [-b.ax, b.az, PI / 2], [-b.ax, -b.az, PI], [b.ax, -b.az, 1.5 * PI]];
  corners.forEach(([cx, cz, a0], ci) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (PI / 2);
      pts.push([b.x + cx + Math.cos(a) * L, b.z + cz + Math.sin(a) * L]);
    }
    // 出口那条边：缺口两端，缺口那一段不放磨杆
    if (ex && ((ex.side > 0 && ci === 0) || (ex.side < 0 && ci === 2))) {
      const z = b.z + ex.side * (b.az + L), xs = ex.side > 0 ? [ex.w, -ex.w] : [-ex.w, ex.w];
      pts.push([b.x + xs[0], z, 'gap']); pts.push([b.x + xs[1], z]);
    }
  });
  const g = pts.findIndex((p) => p[2] === 'gap'), n = pts.length, segs = [];
  for (let j = 0; j < n; j++) {
    const i = g >= 0 ? (g + 1 + j) % n : j;
    if (g >= 0 && i === g) break;
    const p = pts[i], q = pts[(i + 1) % n];
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05) continue;
    segs.push(T.rail(p[0], 0, p[1], q[0], 0, q[1], 'coping', { bowl: b }));
  }
  T.link(segs, g < 0);
}
function handrail(T, x, zTop, topH, zEdge, zBot, botH, zEnd) {
  const s1 = T.rail(x, topH, zTop, x, topH, zEdge, 'rail', { hand: true });
  const s2 = T.rail(x, topH, zEdge, x, botH, zBot, 'rail', { hand: true, handSlope: true });
  const s3 = T.rail(x, botH, zBot, x, botH, zEnd, 'rail', { hand: true });
  T.link([s1, s2, s3]);
}
// 道具（可以撞、可以滑边）
function prop(T, kind, x, z, yaw, grind) {
  const S = { bench: [2.2, 0.5, 0.45], planter: [2.6, 1.2, 0.5], trash: [0.56, 0.56, 0.95], ac: [2.0, 1.4, 1.1] }[kind];
  const f = T.add({ t: 'box', x, z, yaw: yaw || 0, w: S[0], d: S[1], h: S[2], deco: kind, name: kind });
  if (grind) ledgeEdges(T, f);
  return f;
}

// 街区：24 × 24 米，周围是真实的城市广场（照片全景）。出生在东南角朝北：
// 正前方是长平杆和 Manual 台，左边长边沿，右边跳箱；北边整面四分之一管回头；西南角小平台 + 3 级台阶 + 扶手
function buildSpot() {
  const T = new Terrain({ minX: -12, maxX: 12, minZ: -12, maxZ: 12 });
  const F = {};
  T.spawn = { x: 2.6, z: -9.6, yaw: 0 };
  T.theme = { outside: 'hdr', time: 'day', wall: 0.55 };
  /* 北：整面四分之一管（高 1.33 米，坡顶有铁边，平台一直顶到墙） */
  F.qp = T.add({ t: 'qp', x: 0, z: 7.4, yaw: 0, w: 24, r: 1.8, a: 75 * D2R, deck: 2.9 }); copingOf(T, F.qp);
  /* 中间偏西：10 米长的平边沿（两边包角铁） */
  F.ledge = T.add({ t: 'box', x: -4.2, z: -0.6, w: 0.55, d: 10, h: 0.42, name: 'ledge' }); ledgeEdges(T, F.ledge);
  /* 中间：Manual 台（低台子，四条边都能磨） */
  F.pad = T.add({ t: 'box', x: 0.4, z: -1.6, w: 2.4, d: 4.2, h: 0.16, name: 'pad' }); ledgeEdges(T, F.pad);
  /* 中间偏东：9.5 米长的平杆 */
  T.rail(4.4, 0.36, -5.6, 4.4, 0.36, 3.9, 'rail', { flat: true });
  /* 东：跳箱（上坡 → 平顶 → 下坡，平顶两条边能磨） */
  F.fbS = T.add({ t: 'ramp', x: 8.6, z: -5.4, yaw: 0, w: 3, l: 2, h: 0.5, mat: 'wood' });
  F.table = T.add({ t: 'box', x: 8.6, z: -1.4, w: 3, d: 4, h: 0.5, name: 'funbox', mat: 'wood' });
  F.fbN = T.add({ t: 'ramp', x: 8.6, z: 2.6, yaw: PI, w: 3, l: 2, h: 0.5, mat: 'wood' });
  for (const sx of [7.1, 10.1]) T.rail(sx, 0.5, -3.3, sx, 0.5, 0.5, 'ledge', { box: F.table });
  /* 东墙边：长凳 */
  F.bench = prop(T, 'bench', 11.1, 5.2, PI / 2, true);
  /* 西墙边：矮路沿 */
  F.curb = T.add({ t: 'box', x: -10.9, z: 0, w: 0.5, d: 9, h: 0.3, name: 'ledge' }); ledgeEdges(T, F.curb);
  /* 西南：小平台 + 3 级台阶 + 扶手；东边一条缓坡上平台 */
  F.plat = T.add({ t: 'box', x: -8.5, z: -10.25, w: 7, d: 3.5, h: 0.48, name: 'platform' });
  F.stairs = T.add({ t: 'stairs', x: -8.5, z: -8.5, yaw: 0, w: 4, n: 3, rise: 0.16, run: 0.36 });
  handrail(T, -10.85, -9.75, 0.9, -8.55, -7.78, 0.42, -7.0);
  F.bank = T.add({ t: 'ramp', x: -2.5, z: -10.25, yaw: -PI / 2, w: 3.5, l: 2.5, h: 0.48 });
  T.marks = { stairs: { x0: -10.5, x1: -6.5, zMin: -7.7, top: 0.4 }, bigQP: 1.2, longLedge: F.ledge, pad: F.pad }; // 挑战用：长台（10 米）、Manual 台
  T.decals = [
    ['crack', -8, 3, 2.2, 0.4], ['crack', 9.5, 8, 2, 2.2], ['crack', 2.5, 5.5, 1.8, 1.1], ['stain', -2, -8, 2, 0], ['stain', 3, 2, 2.2, 1], ['stain', -9, 6, 1.8, 2],
    ['manhole', 6.8, -10, 0.9, 0], ['drain', -11.4, 7, 1.2, 1.57],
  ];
  T.F = F;
  return T;
}

export function buildMap() {
  const T = buildSpot();
  T.id = 'spot';
  return T;
}
