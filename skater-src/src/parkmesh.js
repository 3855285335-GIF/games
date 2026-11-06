// 根据地形数据生成公园画面
import { Mesh, MeshStandardMaterial, Shape, Path, ShapeGeometry, CylinderGeometry, TubeGeometry, CatmullRomCurve3, Vector3, Matrix4, Quaternion, Group,
  IcosahedronGeometry, BoxGeometry, SphereGeometry, ShaderMaterial, BackSide, Color, DoubleSide, PlaneGeometry, MeshBasicMaterial } from 'three';
import { MB, between } from './meshkit.js';
import { toWorld, dirWorld } from './terrain.js';
import * as TX from './textures.js';
import { rng } from './util.js';

const LIFT = 0.004; // 防止贴地面闪烁
function W(f, lx, y, lz) { const p = toWorld(f, lx, lz); return [p[0], y, p[1]]; }
function D(f, lx, y, lz) { const d = dirWorld(f, lx, lz); return [d[0], y, d[1]]; }

export function buildQP(f, top, side, metal) {
  const N = Math.max(6, Math.ceil(f.a / 0.07)), hw = f.w / 2, prof = [];
  for (let i = 0; i <= N; i++) { const t = (f.a * i) / N; prof.push([f.r * Math.sin(t), f.r * (1 - Math.cos(t)) + LIFT, t * f.r, Math.cos(t), Math.sin(t)]); }
  for (let i = 0; i < N; i++) {
    const A = prof[i], B = prof[i + 1];
    const nA = D(f, 0, A[3], -A[4]), nB = D(f, 0, B[3], -B[4]);
    top.quadN([W(f, -hw, A[1], A[0]), W(f, hw, A[1], A[0]), W(f, hw, B[1], B[0]), W(f, -hw, B[1], B[0])], [nA, nA, nB, nB],
      [[-hw / 4, A[2] / 4], [hw / 4, A[2] / 4], [hw / 4, B[2] / 4], [-hw / 4, B[2] / 4]]);
  }
  const zb = f.zl + f.deck, up = [0, 1, 0];
  if (f.deck > 0) top.poly([W(f, -hw, f.hl, f.zl), W(f, hw, f.hl, f.zl), W(f, hw, f.hl, zb), W(f, -hw, f.hl, zb)], up);
  side.poly([W(f, -hw, 0, zb), W(f, hw, 0, zb), W(f, hw, f.hl, zb), W(f, -hw, f.hl, zb)], D(f, 0, 0, 1));
  for (const sx of [-1, 1]) {
    const hint = D(f, sx, 0, 0), c = W(f, sx * hw, 0, zb);
    const pts = prof.map((p) => W(f, sx * hw, p[1], p[0]));
    pts.push(W(f, sx * hw, f.hl, zb));
    for (let i = 0; i < pts.length - 1; i++) side.poly([c, pts[i], pts[i + 1]], hint);
  }
  if (f.trans || f.name !== 'kicker') {
    const a = W(f, -hw, f.hl, f.zl), b = W(f, hw, f.hl, f.zl);
    metal.addGeo(new CylinderGeometry(0.03, 0.03, 1, 10), between(a[0], a[1], a[2], b[0], b[1], b[2]));
  } else {
    const a = W(f, -hw, LIFT + 0.002, 0.01), b = W(f, hw, LIFT + 0.002, 0.01);
    metal.addGeo(new BoxGeometry(0.02, 1, 0.06), between(a[0], a[1], a[2], b[0], b[1], b[2]));
  }
}
export function buildRamp(f, top, side) {
  const hw = f.w / 2, zb = f.l + (f.deck || 0), up = [0, 1, 0];
  top.poly([W(f, -hw, LIFT, 0), W(f, hw, LIFT, 0), W(f, hw, f.h, f.l), W(f, -hw, f.h, f.l)], up);
  if (f.deck) top.poly([W(f, -hw, f.h, f.l), W(f, hw, f.h, f.l), W(f, hw, f.h, zb), W(f, -hw, f.h, zb)], up);
  side.poly([W(f, -hw, 0, zb), W(f, hw, 0, zb), W(f, hw, f.h, zb), W(f, -hw, f.h, zb)], D(f, 0, 0, 1));
  for (const sx of [-1, 1]) side.poly([W(f, sx * hw, 0, 0), W(f, sx * hw, f.h, f.l), W(f, sx * hw, f.h, zb), W(f, sx * hw, 0, zb)], D(f, sx, 0, 0));
}
// 盒子：顶边做 2.5 厘米的倒角（不再是刀切一样的直角，光一照边缘有高光）
export function buildBox(f, top, side) {
  const hw = f.w / 2, hd = f.d / 2, h = f.h, b = Math.min(0.025, h * 0.25, hw * 0.3, hd * 0.3);
  top.poly([W(f, -hw + b, h, -hd + b), W(f, hw - b, h, -hd + b), W(f, hw - b, h, hd - b), W(f, -hw + b, h, hd - b)], [0, 1, 0]);
  const C = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], Ci = [[-hw + b, -hd + b], [hw - b, -hd + b], [hw - b, hd - b], [-hw + b, hd - b]], O = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, [ax, az] = O[i];
    top.poly([W(f, C[i][0], h - b, C[i][1]), W(f, C[j][0], h - b, C[j][1]), W(f, Ci[j][0], h, Ci[j][1]), W(f, Ci[i][0], h, Ci[i][1])], D(f, ax, 1, az));
    side.poly([W(f, C[i][0], 0, C[i][1]), W(f, C[j][0], 0, C[j][1]), W(f, C[j][0], h - b, C[j][1]), W(f, C[i][0], h - b, C[i][1])], D(f, ax, 0, az));
  }
}
export function buildStairs(f, top, side) {
  const hw = f.w / 2;
  for (let k = 0; k < f.n - 1; k++) {
    const y = (f.n - 1 - k) * f.rise, z0 = k * f.run, z1 = (k + 1) * f.run;
    top.poly([W(f, -hw, y, z0), W(f, hw, y, z0), W(f, hw, y, z1), W(f, -hw, y, z1)], [0, 1, 0]);
    for (const sx of [-1, 1]) side.poly([W(f, sx * hw, 0, z0), W(f, sx * hw, 0, z1), W(f, sx * hw, y, z1), W(f, sx * hw, y, z0)], D(f, sx, 0, 0));
  }
  for (let k = 0; k < f.n; k++) {
    const z = k * f.run, y0 = (f.n - 1 - k) * f.rise, y1 = y0 + f.rise;
    side.poly([W(f, -hw, y0, z), W(f, hw, y0, z), W(f, hw, y1, z), W(f, -hw, y1, z)], D(f, 0, 0, 1));
    side.poly([W(f, -hw, y1 - 0.02, z - 0.01), W(f, hw, y1 - 0.02, z - 0.01), W(f, hw, y1 + 0.001, z - 0.01), W(f, -hw, y1 + 0.001, z - 0.01)], D(f, 0, 0, 1));
  }
}
export function buildPyr(f, top, side) {
  const hw = f.w / 2, hd = f.d / 2, r = f.run, h = f.h;
  const B = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], Tp = [[-hw + r, -hd + r], [hw - r, -hd + r], [hw - r, hd - r], [-hw + r, hd - r]];
  top.poly(Tp.map((p) => W(f, p[0], h, p[1])), [0, 1, 0]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, mx = (B[i][0] + B[j][0]) / 2, mz = (B[i][1] + B[j][1]) / 2;
    top.poly([W(f, B[i][0], LIFT, B[i][1]), W(f, B[j][0], LIFT, B[j][1]), W(f, Tp[j][0], h, Tp[j][1]), W(f, Tp[i][0], h, Tp[i][1])], D(f, mx, 1, mz));
  }
}
function bowlPath(f) {
  // 平底矩形四角 + 外法线角度（局部）
  const out = [], K = 10;
  const corners = [[f.ax, f.az, 0], [-f.ax, f.az, Math.PI / 2], [-f.ax, -f.az, Math.PI], [f.ax, -f.az, 1.5 * Math.PI]], ex = f.exit;
  corners.forEach(([cx, cz, a0], ci) => {
    for (let i = 0; i <= K; i++) { const a = a0 + (i / K) * (Math.PI / 2); out.push([cx, cz, Math.cos(a), Math.sin(a)]); }
    // 出口那条直边：插入缺口两端，缺口那一段标记为 gap（不画池壁、不放钢管）
    if (ex && ((ex.side > 0 && ci === 0) || (ex.side < 0 && ci === 2))) {
      const z = ex.side * f.az, xs = ex.side > 0 ? [ex.w, -ex.w] : [-ex.w, ex.w];
      out.push([xs[0], z, 0, ex.side, 'gap']); out.push([xs[1], z, 0, ex.side]);
    }
  });
  out.push(out[0]);
  return out;
}
export function buildBowl(f, conc, tile, metal) {
  const N = 16, path = bowlPath(f);
  const yAt = (t) => -f.D + f.r * (1 - Math.cos(t)) ;
  const tT = Math.acos(1 - (f.D - 0.24) / f.r);
  const profA = [], profB = [];
  for (let i = 0; i <= N; i++) profA.push((tT * i) / N);
  for (let i = 0; i <= 3; i++) profB.push(tT + ((f.a - tT) * i) / 3);
  let L = [0];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    L.push(L[k - 1] + Math.hypot(b[0] + b[2] * f.zl - a[0] - a[2] * f.zl, b[1] + b[3] * f.zl - a[1] - a[3] * f.zl));
  }
  const strip = (mb, prof, us, vs) => {
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k], b = path[k + 1];
      if (a[4] === 'gap') continue;
      for (let i = 0; i < prof.length - 1; i++) {
        const t0 = prof[i], t1 = prof[i + 1], d0 = f.r * Math.sin(t0), d1 = f.r * Math.sin(t1);
        const P = [W(f, a[0] + a[2] * d0, yAt(t0), a[1] + a[3] * d0), W(f, b[0] + b[2] * d0, yAt(t0), b[1] + b[3] * d0), W(f, b[0] + b[2] * d1, yAt(t1), b[1] + b[3] * d1), W(f, a[0] + a[2] * d1, yAt(t1), a[1] + a[3] * d1)];
        const nn = (c, t) => D(f, -c[2] * Math.sin(t), Math.cos(t), -c[3] * Math.sin(t));
        const N4 = [nn(a, t0), nn(b, t0), nn(b, t1), nn(a, t1)];
        mb.quadN(P, N4, [[L[k] / us, (t0 * f.r) / vs], [L[k + 1] / us, (t0 * f.r) / vs], [L[k + 1] / us, (t1 * f.r) / vs], [L[k] / us, (t1 * f.r) / vs]]);
      }
    }
  };
  strip(conc, profA, 4, 4);
  strip(tile, profB, 2.4, 0.6);
  conc.poly([W(f, -f.ax, -f.D, -f.az), W(f, f.ax, -f.D, -f.az), W(f, f.ax, -f.D, f.az), W(f, -f.ax, -f.D, f.az)], [0, 1, 0]);
  if (f.exit) buildBowlExit(f, conc);
  // 唇边钢管（有出口时从缺口后面开始绕一圈，到缺口前面结束，不闭合）
  const pts = [], n0 = path.length - 1, g = path.findIndex((p) => p[4] === 'gap');
  for (let j = 0; j < n0; j++) {
    const k = g >= 0 ? (g + 1 + j) % n0 : j;
    if (g >= 0 && k === g) break;
    const a = path[k], b = path[k + 1], pa = W(f, a[0] + a[2] * f.zl, 0.012, a[1] + a[3] * f.zl), pb = W(f, b[0] + b[2] * f.zl, 0.012, b[1] + b[3] * f.zl);
    const n = Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) / 0.6));
    for (let i = 0; i < n; i++) pts.push(new Vector3(pa[0] + ((pb[0] - pa[0]) * i) / n, pa[1], pa[2] + ((pb[2] - pa[2]) * i) / n));
    if (g >= 0 && (k + 1) % n0 === g) pts.push(new Vector3(pb[0], pb[1], pb[2]));
  }
  const closed = g < 0, curve = new CatmullRomCurve3(pts, closed, 'centripetal');
  metal.addGeo(new TubeGeometry(curve, pts.length * 2, 0.03, 8, closed), new Matrix4());
}
// 出口坡道：池底到地面的缓坡 + 两侧挡墙（墙顶贴着池壁 / 地面）
function buildBowlExit(f, conc) {
  const ex = f.exit, s = ex.side, w = ex.w, N = 14;
  const zAt = (t) => s * (f.az + ex.L * t), floorY = (t) => -f.D + f.D * t;
  const topY = (t) => { const d = ex.L * t; return d >= f.zl ? 0 : -f.D + f.r - Math.sqrt(Math.max(0, f.r * f.r - d * d)); };
  const nl = Math.hypot(1, f.D / ex.L), nf = D(f, 0, 1 / nl, (-s * f.D) / ex.L / nl);
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, z0 = zAt(t0), z1 = zAt(t1), y0 = floorY(t0), y1 = floorY(t1);
    const v0 = (ex.L * t0) / 3, v1 = (ex.L * t1) / 3;
    conc.quadN([W(f, -w, y0, z0), W(f, w, y0, z0), W(f, w, y1, z1), W(f, -w, y1, z1)], [nf, nf, nf, nf], [[0, v0], [(2 * w) / 3, v0], [(2 * w) / 3, v1], [0, v1]]);
    for (const sx of [-1, 1]) {
      const h0 = topY(t0), h1 = topY(t1); if (h0 - y0 < 0.002 && h1 - y1 < 0.002) continue;
      const nw = D(f, -sx, 0, 0);
      conc.quadN([W(f, sx * w, y0, z0), W(f, sx * w, y1, z1), W(f, sx * w, h1, z1), W(f, sx * w, h0, z0)], [nw, nw, nw, nw], [[v0, y0 / 3], [v1, y1 / 3], [v1, h1 / 3], [v0, h0 / 3]]);
    }
  }
}
export function bowlHolePath(f) {
  // 地面上的洞（形状坐标：x, -z）
  const p = new Path(), path = bowlPath(f);
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], w = toWorld(f, a[0] + a[2] * f.zl, a[1] + a[3] * f.zl);
    k ? p.lineTo(w[0], -w[1]) : p.moveTo(w[0], -w[1]);
    // 出口：沿着沟往外绕一圈再回来，地面在沟的位置也挖开
    if (a[4] === 'gap') {
      const ex = f.exit, b = path[k + 1], zEnd = ex.side * (f.az + ex.L);
      const c1 = toWorld(f, a[0], zEnd), c2 = toWorld(f, b[0], zEnd);
      p.lineTo(c1[0], -c1[1]); p.lineTo(c2[0], -c2[1]);
    }
  }
  p.closePath();
  return p;
}
// 角铁包边：一条压在台面上、一条贴在侧面（L 形），沿着可磨的台边
const _bx = new Vector3(), _by = new Vector3(), _bz = new Vector3(), _up = new Vector3(), _rq = new Quaternion();
function angleIron(mb, r) {
  const hl = Math.hypot(r.dx, r.dz) || 1; let ox = r.dz / hl, oz = -r.dx / hl;
  const mx = (r.ax + r.bx) / 2 - r.box.x, mz = (r.az + r.bz) / 2 - r.box.z;
  if (ox * mx + oz * mz < 0) { ox = -ox; oz = -oz; }
  _bx.set(ox, 0, oz); _by.set(r.dx, r.dy, r.dz); _bz.crossVectors(_bx, _by).normalize();
  const cx = (r.ax + r.bx) / 2, cy = (r.ay + r.by) / 2, cz = (r.az + r.bz) / 2, L = r.L + 0.08;
  const put = (geo, px, py, pz) => mb.addGeo(geo, new Matrix4().makeBasis(_bx, _by, _bz).scale(new Vector3(1, L, 1)).setPosition(px, py, pz));
  put(new BoxGeometry(0.05, 1, 0.005), cx - ox * 0.025, cy + 0.0025, cz - oz * 0.025);
  put(new BoxGeometry(0.005, 1, 0.05), cx + ox * 0.0025, cy - 0.025, cz + oz * 0.0025);
}
export function buildRails(T, H, rail, metal, steel, angle) {
  for (const r of T.rails) {
    if (r.kind === 'rail') {
      // 贴图沿杆子长度方向按米重复（每 0.6 米一段黄漆）
      const cg = new CylinderGeometry(0.022, 0.022, 1, 12), uv = cg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * r.L / 0.6);
      const bm = between(r.ax, r.ay, r.az, r.bx, r.by, r.bz);
      rail.addGeo(cg, bm);
      // 杆子顶上那一条被磨掉了漆，露出亮的钢（磨得最多的地方）：在杆子自己的坐标里找"朝上"是哪个角度
      _up.set(0, 1, 0).applyQuaternion(_rq.setFromRotationMatrix(bm).invert());
      const th = Math.atan2(_up.x, _up.z);
      metal.addGeo(new CylinderGeometry(0.0222, 0.0222, 1, 6, 1, true, th - 0.55, 1.1), bm.clone());
      const posts = [];
      if (r.hand) { if (!r.prev) posts.push([r.ax, r.ay, r.az]); posts.push([r.bx, r.by, r.bz]); }
      else { const n = Math.max(1, Math.round(r.L / 2.2)); for (let i = 0; i <= n; i++) posts.push([r.ax + (r.bx - r.ax) * i / n, r.ay, r.az + (r.bz - r.az) * i / n]); }
      for (const [x, y, z] of posts) {
        const g = H(x, z);
        steel.addGeo(new CylinderGeometry(0.024, 0.024, 1, 8), between(x, g - 0.02, z, x, y - 0.015, z));
        steel.addGeo(new CylinderGeometry(0.07, 0.07, 1, 8), between(x, g, z, x, g + 0.012, z));
      }
    } else if (r.kind === 'ledge') {
      if (r.box && angle) angleIron(angle, r);
      else metal.addGeo(new BoxGeometry(0.03, 1, 0.03), between(r.ax, r.ay - 0.012, r.az, r.bx, r.by - 0.012, r.bz));
    }
  }
}
export function makeSky() {
  const g = new SphereGeometry(460, 32, 16);
  const m = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new Color(0x4f8fd6) }, mid: { value: new Color(0xa9cdee) }, bot: { value: new Color(0xe6eef2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0),0.7)) : mix(mid, bot, clamp(-h*6.0,0.0,1.0)); gl_FragColor = vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const s = new Mesh(g, m); s.renderOrder = -1; s.frustumCulled = false;
  return s;
}
