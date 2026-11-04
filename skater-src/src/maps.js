// 地图：公园 / 天台。所有障碍物都是解析地形，物理和画面共用
import { Terrain, toWorld } from './terrain.js';

const D2R = Math.PI / 180, PI = Math.PI;
export const MAPS = [
  { id: 'yard', name: '小院', desc: '小而密，几秒一个道具，适合连招' },
  { id: 'park', name: '公园', desc: '街式广场 + 碗池 + U 台' },
  { id: 'roof', name: '天台', desc: '城市楼顶，上下两层' },
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

function buildPark() {
  const T = new Terrain({ minX: -32, maxX: 32, minZ: -45, maxZ: 45 });
  const F = {};
  T.spawn = { x: -6, z: -14, yaw: 0 };
  T.theme = { outside: 'grass', time: 'day', wall: 0.7 };
  /* 南：街式广场 */
  F.plat = T.add({ t: 'box', x: -20, z: -40, w: 24, d: 10, h: 0.96, name: 'platform' });
  F.stairs = T.add({ t: 'stairs', x: -19, z: -35, yaw: 0, w: 12, n: 6, rise: 0.16, run: 0.32 });
  F.bankP = T.add({ t: 'ramp', x: -2, z: -40, yaw: -PI / 2, w: 8, l: 6, h: 0.96 });
  for (const hx of [-22.5, -15.5]) handrail(T, hx, -37.0, 1.46, -35.05, -33.45, 0.54, -32.3);
  F.ledgeA = T.add({ t: 'box', x: 6, z: -30, w: 7, d: 0.6, h: 0.45, name: 'ledge' }); ledgeEdges(T, F.ledgeA);
  F.ledgeB = T.add({ t: 'box', x: 18, z: -22, yaw: 0.35, w: 6, d: 0.6, h: 0.35, name: 'ledge' }); ledgeEdges(T, F.ledgeB);
  F.pad = T.add({ t: 'box', x: -14, z: -24, w: 5, d: 2.2, h: 0.18, name: 'pad' }); ledgeEdges(T, F.pad);
  T.rail(-4, 0.42, -28, -4, 0.42, -20, 'rail', { flat: true });
  prop(T, 'bench', 8, -40.5, 0, true); prop(T, 'bench', 24, -38, 0.4, true);
  prop(T, 'planter', -8.5, -21.5, 0, true); prop(T, 'planter', 26, 14, PI / 2, true);
  prop(T, 'trash', 29.6, -43.2); prop(T, 'trash', 6, -43.6); prop(T, 'trash', -10, 43.4);
  /* 中：跳箱 / 金字塔 / 大跳台 */
  F.table = T.add({ t: 'box', x: 0, z: 0, w: 6, d: 4, h: 0.6, name: 'funbox', mat: 'wood' });
  F.fbN = T.add({ t: 'ramp', x: 0, z: 4.4, yaw: PI, w: 6, l: 2.4, h: 0.6, mat: 'wood' });
  F.fbS = T.add({ t: 'ramp', x: 0, z: -4.4, yaw: 0, w: 6, l: 2.4, h: 0.6, mat: 'wood' });
  T.rail(0, 0.9, -1.6, 0, 0.9, 1.6, 'rail', { flat: true });
  for (const sx of [-3, 3]) T.rail(sx, 0.6, -1.95, sx, 0.6, 1.95, 'ledge', { box: F.table });
  F.pyr = T.add({ t: 'pyr', x: -17, z: -2, w: 8, d: 8, h: 0.8, run: 2.5 });
  F.kicker = T.add({ t: 'qp', x: 18, z: -10, yaw: 0, w: 4, r: 3.2, a: 33 * D2R, deck: 2.6, name: 'kicker', mat: 'wood' });
  F.land = T.add({ t: 'ramp', x: 18, z: -10 + F.kicker.zl + 2.6 + 2.4, yaw: PI, w: 4, l: 2.4, h: F.kicker.hl, mat: 'wood' });
  for (const sx of [16, 20]) T.rail(sx, F.kicker.hl, -10 + F.kicker.zl + 0.05, sx, F.kicker.hl, -10 + F.kicker.zl + 2.55, 'ledge');
  /* 东：长四分之一管；西：低坡墙 */
  F.qpE = T.add({ t: 'qp', x: 27.5, z: -20, yaw: PI / 2, w: 40, r: 2.2, a: 78 * D2R, deck: 2.45 }); copingOf(T, F.qpE);
  F.qpEacc = T.add({ t: 'ramp', x: 27.5 + F.qpE.zl + 1.15, z: 5.2, yaw: PI, w: 2.3, l: 5.2, h: F.qpE.hl });
  F.bankW = T.add({ t: 'ramp', x: -28.5, z: -12, yaw: -PI / 2, w: 36, l: 2.5, h: 1.0, deck: 1.0 });
  { const a = toWorld(F.bankW, -17.9, 2.5), b = toWorld(F.bankW, 17.9, 2.5); T.rail(a[0], 1.0, a[1], b[0], 1.0, b[1], 'ledge'); }
  /* 北：碗池 / U 台 / 大四分之一管 */
  F.bowl = T.add({ t: 'bowl', x: -13, z: 29, yaw: 0, ax: 4, az: 5.5, r: 2.4, a: 80 * D2R, exit: { side: -1, w: 1.4, L: 7.4 } }); bowlCoping(T, F.bowl);
  F.mrA = T.add({ t: 'qp', x: 13, z: 29, yaw: -PI / 2, w: 8, r: 1.9, a: 78 * D2R, deck: 2.0, mat: 'wood' });
  F.mrB = T.add({ t: 'qp', x: 17, z: 29, yaw: PI / 2, w: 8, r: 1.9, a: 78 * D2R, deck: 2.0, mat: 'wood' });
  copingOf(T, F.mrA); copingOf(T, F.mrB);
  F.mrAacc = T.add({ t: 'ramp', x: 13 - F.mrA.zl - 1.0, z: 20.6, yaw: 0, w: 2.0, l: 4.4, h: F.mrA.hl });
  F.mrBacc = T.add({ t: 'ramp', x: 17 + F.mrB.zl + 1.0, z: 20.6, yaw: 0, w: 2.0, l: 4.4, h: F.mrB.hl });
  F.qpN = T.add({ t: 'qp', x: 14, z: 39.6, yaw: 0, w: 30, r: 2.7, a: 82 * D2R, deck: 2.8 }); copingOf(T, F.qpN); // 平台一直顶到墙（以前留了一条缝，板子可能掉进去）
  // 挑战用的标记
  T.marks = { gapFrom: F.kicker, gapTo: F.land, stairs: { x0: -26, x1: -12, zMin: -34.2, top: 0.9 }, bigQP: 2 };
  // 地面贴花（装饰）
  T.decals = [
    ['paint', 8, -12, 4.2, 0.3], ['manhole', 5, 10, 0.9, 0], ['drain', -2, -44.4, 1.2, 0], ['drain', 30, 30, 1.2, 1.57],
    ['skid', -6, -6, 2.4, 0.2], ['skid', 4, -20, 3, -0.4], ['skid', 10, 14, 2.6, 1.2], ['skid', -20, 12, 3, 0.7], ['skid', 22, -30, 2.8, 2.1],
    ['crack', -10, -2, 2.4, 0.5], ['crack', 12, 4, 2, 2], ['crack', -25, -26, 2.2, 1], ['crack', 25, 34, 2.6, 0.3],
    ['stain', 2, -36, 2, 0], ['stain', -4, 22, 2.4, 1], ['stain', 24, -6, 1.8, 2], ['line', 6, -29.2, 7, 0], ['line', 6, -30.8, 7, 0],
    ['arrow', -6, -18, 1.6, 0], ['arrow', 18, -15, 1.6, 0],
  ];
  T.F = F;
  return T;
}

function buildRoof() {
  const T = new Terrain({ minX: -26, maxX: 26, minZ: -34, maxZ: 34 });
  const F = {};
  T.spawn = { x: -8, z: -6, yaw: 0 };
  T.theme = { outside: 'city', time: 'dusk', wall: 1.1 };
  /* 南：上层平台 + 台阶 + 扶手 + 斜坡 */
  F.plat = T.add({ t: 'box', x: 0, z: -24, w: 52, d: 20, h: 1.44, name: 'platform' });
  F.stairs = T.add({ t: 'stairs', x: 0, z: -14, yaw: 0, w: 10, n: 9, rise: 0.16, run: 0.32 });
  for (const hx of [-3.2, 3.2]) handrail(T, hx, -15.6, 1.94, -14.05, -11.48, 0.54, -10.2);
  F.bankW = T.add({ t: 'ramp', x: -20, z: -6, yaw: PI, w: 8, l: 8, h: 1.44 });
  /* 中：踢台 → 天窗 → 落地坡 */
  F.kicker = T.add({ t: 'qp', x: 0, z: -2, yaw: 0, w: 4, r: 3, a: 30 * D2R, deck: 0, name: 'kicker', mat: 'wood' });
  F.sky = T.add({ t: 'box', x: 0, z: 3.2, w: 5, d: 3, h: 0.55, deco: 'skylight', name: 'skylight' });
  F.land = T.add({ t: 'ramp', x: 0, z: 4.7 + 2.4, yaw: PI, w: 5, l: 2.4, h: 0.55, mat: 'wood' });
  ledgeEdges(T, F.sky);
  /* 北：小水池 + 四分之一管 */
  F.bowl = T.add({ t: 'bowl', x: -14, z: 20, yaw: 0, ax: 1.6, az: 2.6, r: 2.2, a: 80 * D2R, exit: { side: -1, w: 1.15, L: 6.8 } }); bowlCoping(T, F.bowl);
  F.qpN = T.add({ t: 'qp', x: 6, z: 29.5, yaw: 0, w: 22, r: 2.2, a: 78 * D2R, deck: 2.45 }); copingOf(T, F.qpN);
  /* 街式 */
  F.ledge = T.add({ t: 'box', x: -22.5, z: 5, w: 0.5, d: 16, h: 0.5, name: 'ledge' }); ledgeEdges(T, F.ledge);
  F.pad1 = T.add({ t: 'box', x: 12, z: -3, w: 4, d: 2, h: 0.2, name: 'pad' }); ledgeEdges(T, F.pad1);
  F.pad2 = T.add({ t: 'box', x: 13, z: 9, w: 2, d: 5, h: 0.2, name: 'pad' }); ledgeEdges(T, F.pad2);
  T.rail(6, 0.38, 14, 6, 0.38, 22, 'rail', { flat: true });
  F.pyr = T.add({ t: 'pyr', x: 17, z: 19, w: 7, d: 7, h: 0.7, run: 2.3 });
  prop(T, 'ac', 23.5, 2); prop(T, 'ac', 23.5, 8); prop(T, 'ac', 23.5, 14);
  prop(T, 'bench', -6, 12, 0, true); prop(T, 'bench', -17, 4, 0, true);
  prop(T, 'planter', -11.5, -3.5, 0, true);
  prop(T, 'trash', 24, -11); prop(T, 'trash', -24, 28);
  T.marks = { gapFrom: F.kicker, gapTo: F.land, gapPastZ: 4.75, stairs: { x0: -5, x1: 5, zMin: -11.4, top: 1.3 }, bigQP: 1.6 };
  T.decals = [
    ['paint', -8, 0, 3.4, 0.5], ['manhole', 8, 4, 0.9, 0], ['drain', 20, -8, 1.2, 0], ['skid', -4, 8, 2.6, 0.6], ['skid', 10, 20, 2.4, 1.6],
    ['skid', -12, -10, 2.4, 0.1], ['crack', 4, 12, 2.2, 0.4], ['crack', -18, 8, 2, 1.4], ['stain', 16, 0, 2.2, 0], ['stain', -6, 24, 2, 2],
    ['line', 0, -30, 40, 0], ['line', 0, -18, 40, 0], ['arrow', -8, -2, 1.6, 0],
  ];
  T.F = F;
  return T;
}

// 小院：28 × 34 米。出生点正前方是跳箱，跳箱后面是整面四分之一管；左右两边是边沿、长凳、平杆、小台阶
// 设计成几条顺的路线：出生 → 跳箱（磨顶上的杆 / 台边）→ 四分之一管 → 回头磨长边沿 → 小跳台 → 平杆 ……
function buildYard() {
  const T = new Terrain({ minX: -14, maxX: 14, minZ: -17, maxZ: 17 });
  const F = {};
  T.spawn = { x: 1, z: -12, yaw: 0 };
  T.theme = { outside: 'grass', time: 'day', wall: 1.0, fence: 'wood' };
  /* 北：整面四分之一管（平台一直顶到墙） */
  F.qp = T.add({ t: 'qp', x: 0, z: 12, yaw: 0, w: 28, r: 2.0, a: 78 * D2R, deck: 3.15 }); copingOf(T, F.qp); // 左右顶满、后面顶到墙：不留缝
  /* 中：跳箱（两头坡，顶上一根平杆，两条台边） */
  F.table = T.add({ t: 'box', x: 0, z: 0, w: 4.2, d: 3.2, h: 0.55, name: 'funbox', mat: 'wood', paint: 'yellow', side: 'blue' });
  F.fbN = T.add({ t: 'ramp', x: 0, z: 1.6 + 2.2, yaw: PI, w: 4.2, l: 2.2, h: 0.55, mat: 'wood', paint: 'yellow', side: 'blue' });
  F.fbS = T.add({ t: 'ramp', x: 0, z: -1.6 - 2.2, yaw: 0, w: 4.2, l: 2.2, h: 0.55, mat: 'wood', paint: 'yellow', side: 'blue' });
  T.rail(0, 0.84, -1.35, 0, 0.84, 1.35, 'rail', {});
  for (const sx of [-2.1, 2.1]) T.rail(sx, 0.55, -1.5, sx, 0.55, 1.5, 'ledge', { box: F.table });
  /* 东：长边沿（蓝漆）+ 长凳 */
  F.ledgeE = T.add({ t: 'box', x: 9.5, z: -2, w: 0.55, d: 12, h: 0.42, name: 'ledge', paint: 'blue' }); ledgeEdges(T, F.ledgeE);
  F.bench = prop(T, 'bench', 12.3, 7.5, PI / 2, true);
  F.curb = T.add({ t: 'box', x: 5.5, z: 6.5, yaw: PI / 2 - 0.35, w: 5, d: 0.45, h: 0.3, name: 'ledge', paint: 'yellow' }); ledgeEdges(T, F.curb);
  /* 南偏东：小跳台（朝北起跳，落地后正好顺着黄色路沿过去） */
  F.kicker = T.add({ t: 'qp', x: 5, z: -9.6, yaw: 0, w: 2.4, r: 2.8, a: 30 * D2R, deck: 0, name: 'kicker', mat: 'wood', paint: 'yellow', side: 'blue' });
  /* 西：Manual 台 + 平杆 + 金字塔 */
  F.pad = T.add({ t: 'box', x: -8, z: -2.8, w: 2.2, d: 4.6, h: 0.16, name: 'pad', paint: 'red' }); ledgeEdges(T, F.pad);
  T.rail(-2.5, 0.36, -7, -8.5, 0.36, -7, 'rail', { flat: true });
  F.pyr = T.add({ t: 'pyr', x: -7.5, z: 6.5, w: 5.4, d: 5, h: 0.5, run: 1.6 });
  /* 西南：小平台 + 3 级台阶 + 扶手，东边一条缓坡上平台 */
  F.plat = T.add({ t: 'box', x: -8.5, z: -14.5, w: 11, d: 5, h: 0.48, name: 'platform' });
  F.stairs = T.add({ t: 'stairs', x: -8.5, z: -12, yaw: 0, w: 5, n: 3, rise: 0.16, run: 0.36 });
  handrail(T, -11.4, -13.3, 0.9, -12.05, -11.28, 0.42, -10.5);
  F.bank = T.add({ t: 'ramp', x: 0, z: -14.5, yaw: -PI / 2, w: 5, l: 3, h: 0.48 });
  prop(T, 'trash', 12.6, -15.6); prop(T, 'planter', -12.6, 10, PI / 2, false);
  T.marks = { stairs: { x0: -11, x1: -6, zMin: -11.3, top: 0.4 }, bigQP: 1.5 };
  T.decals = [
    ['paint', 4, -4.5, 3.2, 0.4], ['manhole', -3, 5, 0.9, 0], ['drain', 11, -15.5, 1.2, 0],
    ['skid', 1, -7, 2.6, 0.1], ['skid', -5, 1, 2.4, 1.3], ['skid', 6, 3, 2.6, 2.4], ['skid', 9.5, -9.5, 2.4, 1.57],
    ['crack', -10, -8, 2.2, 0.4], ['crack', 11.5, 11, 2, 2.2], ['stain', -2, -14, 2, 0], ['stain', 3, 9, 2.2, 1],
    ['arrow', 1, -9.5, 1.4, 0],
  ];
  T.F = F;
  return T;
}

export function buildMap(id) {
  const T = id === 'roof' ? buildRoof() : id === 'yard' ? buildYard() : buildPark();
  T.id = id === 'roof' ? 'roof' : id === 'yard' ? 'yard' : 'park';
  return T;
}
