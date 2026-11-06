// 场地的"用旧了"的感觉（第 3 步建模）：
//  · 接触阴影：道具、墙、杆子脚和地面相接的地方暗一圈（阴天里东西底下照不到天光），东西不再像飘在地上
//  · 打过蜡的边：能磨的台边、角铁上一条发暗、发亮的蜡痕
//  · 板子磕出来的黑印：台边下面的侧面
// 全是贴在表面上的半透明薄片，不改地形，物理不受影响
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, ClampToEdgeWrapping } from 'three';
import { MB } from './meshkit.js';
import { toWorld } from './terrain.js';
import { rng } from './util.js';

const UP = [0, 1, 0];
let TEX = null;
function textures() {
  if (TEX) return TEX;
  // 接触阴影：横向 = 深浅（0～1），纵向 = 离边的距离（0 = 贴着边最暗，1 = 没了）
  const a = document.createElement('canvas'); a.width = 32; a.height = 64;
  const ax = a.getContext('2d'), im = ax.createImageData(32, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const v = y / 63, k = x / 31, o = (y * 32 + x) * 4, f = (1 - v) * (1 - v) * (1 + v * 0.6); // 贴边处衰减快一点、外面拖一点尾巴
    im.data[o] = im.data[o + 1] = im.data[o + 2] = 0; im.data[o + 3] = Math.round(255 * k * Math.min(1, f));
  }
  ax.putImageData(im, 0, 0);
  const ao = new CanvasTexture(a); ao.wrapS = ao.wrapT = ClampToEdgeWrapping; ao.flipY = false; // 画布第一行 = v 0（贴着边、最暗）
  // 磨损图集：每行 1024×128：0 = 蜡痕，1 = 板子磕的黑印（地上的胶印试过，看着像怪东西，去掉了）
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d'), R = rng(314);
  x.clearRect(0, 0, 1024, 512);
  // 蜡痕：沿着边一道道发暗的细纹，贴边（v 小的地方）最浓，往里渐淡；有的地方蹭得多、有的少
  for (let k = 0; k < 900; k++) {
    const y = 4 + Math.pow(R(), 1.8) * 118, x0 = R() * 1024, len = 40 + R() * 260, al = (0.05 + R() * 0.16) * (1 - y / 140);
    x.strokeStyle = `rgba(20,16,12,${al})`; x.lineWidth = 0.8 + R() * 2.5;
    x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0 + len * 0.3, y + (R() - 0.5) * 3, x0 + len * 0.7, y + (R() - 0.5) * 3, x0 + len, y + (R() - 0.5) * 4); x.stroke();
  }
  for (let k = 0; k < 40; k++) { // 蜡块抹开的斑
    const cx = R() * 1024, cy = 8 + R() * 50, rx = 30 + R() * 90, g = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(25,20,14,${0.12 + R() * 0.15})`); g.addColorStop(1, 'rgba(25,20,14,0)');
    x.save(); x.beginPath(); x.rect(0, 2, 1024, 124); x.clip(); x.fillStyle = g; x.fillRect(cx - rx, 0, rx * 2, 128); x.restore();
  }
  // 板子磕的黑印：贴近上边（v 小）多，一小段一小段斜着的黑道
  x.save(); x.beginPath(); x.rect(0, 130, 1024, 124); x.clip();
  for (let k = 0; k < 520; k++) {
    const y = 132 + Math.pow(R(), 2.2) * 118, x0 = R() * 1024, len = 8 + R() * 70, ang = (R() - 0.5) * 0.5, al = 0.08 + R() * 0.32;
    x.strokeStyle = `rgba(12,11,10,${al})`; x.lineWidth = 1 + R() * 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + Math.cos(ang) * len, y + Math.sin(ang) * len); x.stroke();
  }
  x.restore();
  const atlas = new CanvasTexture(c); atlas.colorSpace = SRGBColorSpace; atlas.wrapS = atlas.wrapT = ClampToEdgeWrapping; atlas.anisotropy = 4;
  return (TEX = { ao, atlas });
}
// 图集里第 row 行的 v 范围（CanvasTexture 默认上下翻转：画布顶部 = v 1）
const rowV = (row) => [1 - (row * 128 + 124) / 512, 1 - (row * 128 + 4) / 512];

export function buildWear(T) {
  const { ao, atlas } = textures();
  const A = new MB(), WX = new MB(), SC = new MB();
  // 一条贴地 / 贴面的带子：从 p0 到 p1 的边，往 n 方向伸出 w；k = 深浅
  const aoStrip = (x0, y0, z0, x1, y1, z1, nx, ny, nz, w, k0, k1) => {
    A.quadN([[x0, y0, z0], [x1, y1, z1], [x1 + nx * w, y1 + ny * w, z1 + nz * w], [x0 + nx * w, y0 + ny * w, z0 + nz * w]], [UP, UP, UP, UP], [[k0, 0], [k1 == null ? k0 : k1, 0], [k1 == null ? k0 : k1, 1], [k0, 1]]);
  };
  // 拐角：从 a0 到 a1 的扇形，半径 w
  const aoFan = (cx, y, cz, a0, a1, w, k) => {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const b0 = a0 + ((a1 - a0) * i) / n, b1 = a0 + ((a1 - a0) * (i + 1)) / n;
      A.quadN([[cx, y, cz], [cx + Math.cos(b0) * w, y, cz + Math.sin(b0) * w], [cx + Math.cos(b1) * w, y, cz + Math.sin(b1) * w], [cx, y, cz]], [UP, UP, UP, UP], [[k, 0], [k, 1], [k, 1], [k, 0]]);
    }
  };
  const lvl = (h) => Math.min(0.5, 0.18 + h * 0.6), reach = (h) => Math.min(0.32, 0.08 + h * 0.5);
  const G = 0.003; // 贴地高度（再加上多边形偏移，不会和地面打架）
  // 盒子 / 台子：四边 + 四个角，外加侧面底部往上暗一截
  function boxAO(f, h, fill) {
    const hw = f.w / 2, hd = f.d / 2, k = lvl(h), w = reach(h), y = 0; // 道具都放在地面上
    const C = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], O = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, a = toWorld(f, C[i][0], C[i][1]), b = toWorld(f, C[j][0], C[j][1]);
      const nl = toWorld(f, O[i][0], O[i][1]), nx = nl[0] - f.x, nz = nl[1] - f.z;
      aoStrip(a[0], y + G, a[1], b[0], y + G, b[1], nx, 0, nz, w, k);
      // 侧面底部：贴着侧面往上暗一截（离侧面 2 毫米）
      const hv = Math.min(h * 0.7, w * 0.8);
      if (hv > 0.03) A.quadN([[a[0] + nx * 0.002, y, a[1] + nz * 0.002], [b[0] + nx * 0.002, y, b[1] + nz * 0.002], [b[0] + nx * 0.002, y + hv, b[1] + nz * 0.002], [a[0] + nx * 0.002, y + hv, a[1] + nz * 0.002]], [[nx, 0, nz], [nx, 0, nz], [nx, 0, nz], [nx, 0, nz]], [[k * 0.8, 0], [k * 0.8, 0], [k * 0.8, 1], [k * 0.8, 1]]);
      // 角：外法线从这一边转到下一边
      const nj = toWorld(f, O[j][0], O[j][1]), a0 = Math.atan2(nz, nx); let a1 = Math.atan2(nj[1] - f.z, nj[0] - f.x);
      while (a1 < a0) a1 += Math.PI * 2;
      aoFan(b[0], y + G, b[1], a0, a1, w, k);
    }
    if (fill) { const p = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => { const q = toWorld(f, lx, lz); return [q[0], y + G, q[1]]; }); A.quadN(p, [UP, UP, UP, UP], [[fill, 0.25], [fill, 0.25], [fill, 0.25], [fill, 0.25]]); }
  }
  for (const f of T.feats) {
    if (f.t === 'box') {
      if (f.deco === 'bench') boxAO(f, 0.2, 0.32); // 长凳底下是空的：整块底下暗一点
      else boxAO(f, f.h);
    } else if (f.t === 'ramp') {
      // 坡道：两侧（越往高处越暗）+ 后面；坡脚和地面是平滑接上的，不画
      const hw = f.w / 2, zb = f.l + (f.deck || 0), n = 6;
      for (const sx of [-1, 1]) {
        const nl = toWorld(f, sx, 0), nx = nl[0] - f.x, nz = nl[1] - f.z;
        for (let i = 0; i < n; i++) {
          const z0 = (zb * i) / n, z1 = (zb * (i + 1)) / n, h0 = Math.min(f.h, (f.h * z0) / f.l), h1 = Math.min(f.h, (f.h * z1) / f.l);
          const a = toWorld(f, sx * hw, z0), b = toWorld(f, sx * hw, z1);
          A.quadN([[a[0], G, a[1]], [b[0], G, b[1]], [b[0] + nx * reach(h1), G, b[1] + nz * reach(h1)], [a[0] + nx * reach(h0), G, a[1] + nz * reach(h0)]], [UP, UP, UP, UP], [[lvl(h0) * Math.min(1, h0 * 8), 0], [lvl(h1), 0], [lvl(h1), 1], [lvl(h0) * Math.min(1, h0 * 8), 1]]);
        }
      }
      const a = toWorld(f, -hw, zb), b = toWorld(f, hw, zb), nl = toWorld(f, 0, 1);
      aoStrip(a[0], G, a[1], b[0], G, b[1], nl[0] - f.x, 0, nl[1] - f.z, reach(f.h), lvl(f.h));
    } else if (f.t === 'stairs') {
      // 台阶两侧 + 最下面一级的前沿
      const hw = f.w / 2;
      for (let k = 0; k < f.n - 1; k++) {
        const y = (f.n - 1 - k) * f.rise, z0 = k * f.run, z1 = (k + 1) * f.run;
        for (const sx of [-1, 1]) { const a = toWorld(f, sx * hw, z0), b = toWorld(f, sx * hw, z1), nl = toWorld(f, sx, 0); aoStrip(a[0], G, a[1], b[0], G, b[1], nl[0] - f.x, 0, nl[1] - f.z, reach(y), lvl(y)); }
      }
      const zf = (f.n - 1) * f.run, a = toWorld(f, -hw, zf), b = toWorld(f, hw, zf), nl = toWorld(f, 0, 1);
      aoStrip(a[0], G, a[1], b[0], G, b[1], nl[0] - f.x, 0, nl[1] - f.z, reach(f.rise), lvl(f.rise));
    }
  }
  // 围墙脚（北边是四分之一管，不画）
  if (T.theme && T.theme.outside === 'hdr') {
    const { minX, maxX, minZ, maxZ } = T.bounds, hw = T.theme.wall || 0.5, k = lvl(hw), w = reach(hw);
    const qp = T.feats.find((f) => f.t === 'qp'), zTop = qp ? qp.z : maxZ;
    aoStrip(minX, G, minZ, maxX, G, minZ, 0, 0, 1, w, k);
    aoStrip(minX, G, minZ, minX, G, zTop, 1, 0, 0, w, k);
    aoStrip(maxX, G, minZ, maxX, G, zTop, -1, 0, 0, w, k);
    for (const [x0, z0, x1, z1, nx, nz] of [[minX, minZ, maxX, minZ, 0, 1], [minX, minZ, minX, zTop, 1, 0], [maxX, minZ, maxX, zTop, -1, 0]]) // 墙面底部
      A.quadN([[x0 + nx * 0.002, 0, z0 + nz * 0.002], [x1 + nx * 0.002, 0, z1 + nz * 0.002], [x1 + nx * 0.002, w * 0.9, z1 + nz * 0.002], [x0 + nx * 0.002, w * 0.9, z0 + nz * 0.002]], [[nx, 0, nz], [nx, 0, nz], [nx, 0, nz], [nx, 0, nz]], [[k * 0.8, 0], [k * 0.8, 0], [k * 0.8, 1], [k * 0.8, 1]]);
  }
  // 杆子的立柱脚：一小圈
  for (const r of T.rails) {
    if (r.kind !== 'rail') continue;
    const posts = [];
    if (r.hand) { if (!r.prev) posts.push([r.ax, r.az]); posts.push([r.bx, r.bz]); }
    else { const n = Math.max(1, Math.round(r.L / 2.2)); for (let i = 0; i <= n; i++) posts.push([r.ax + ((r.bx - r.ax) * i) / n, r.az + ((r.bz - r.az) * i) / n]); }
    for (const [x, z] of posts) aoFan(x, T.height(x, z) + G, z, 0, Math.PI * 2, 0.16, 0.32);
  }
  // 蜡痕和黑印：能磨的台边（带角铁的那种）
  const [w0, w1] = rowV(0), [s0, s1] = rowV(1), R = rng(77);
  for (const r of T.rails) {
    if (r.kind !== 'ledge' || !r.box) continue;
    const hl = Math.hypot(r.dx, r.dz) || 1; let ox = r.dz / hl, oz = -r.dx / hl;
    const mx = (r.ax + r.bx) / 2 - r.box.x, mz = (r.az + r.bz) / 2 - r.box.z;
    if (ox * mx + oz * mz < 0) { ox = -ox; oz = -oz; } // (ox, oz) = 朝外
    const L = Math.hypot(r.bx - r.ax, r.bz - r.az), n = Math.max(1, Math.round(L / 2.5)), h = r.ay;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, ax = r.ax + (r.bx - r.ax) * t0, az = r.az + (r.bz - r.az) * t0, bx = r.ax + (r.bx - r.ax) * t1, bz = r.az + (r.bz - r.az) * t1;
      const fl = R() < 0.5, u0 = fl ? 1 : 0, u1 = fl ? 0 : 1;
      // 角铁顶上（顶面高 h + 5 毫米）
      WX.quadN([[ax, h + 0.0056, az], [bx, h + 0.0056, bz], [bx - ox * 0.05, h + 0.0056, bz - oz * 0.05], [ax - ox * 0.05, h + 0.0056, az - oz * 0.05]], [UP, UP, UP, UP], [[u0, w1], [u1, w1], [u1, (w0 + w1) / 2], [u0, (w0 + w1) / 2]]);
      // 角铁里面的台面（往里 5～14 厘米）
      WX.quadN([[ax - ox * 0.05, h + 0.0012, az - oz * 0.05], [bx - ox * 0.05, h + 0.0012, bz - oz * 0.05], [bx - ox * 0.14, h + 0.0012, bz - oz * 0.14], [ax - ox * 0.14, h + 0.0012, az - oz * 0.14]], [UP, UP, UP, UP], [[u0, (w0 + w1) / 2], [u1, (w0 + w1) / 2], [u1, w0], [u0, w0]]);
      // 侧面角铁下面：板子磕的黑印
      const y1 = h - 0.052, y0 = Math.max(0.01, h - 0.17), N = [ox, 0, oz], e = 0.0022;
      if (y1 - y0 > 0.03) SC.quadN([[ax + ox * e, y1, az + oz * e], [bx + ox * e, y1, bz + oz * e], [bx + ox * e, y0, bz + oz * e], [ax + ox * e, y0, az + oz * e]], [N, N, N, N], [[u0, s1], [u1, s1], [u1, s0], [u0, s0]]);
    }
  }
  // 三种材质：接触阴影（不受光，只是变暗）、蜡（发亮）、黑印（哑光）
  const meshes = [];
  const add = (mb, mat, order) => { if (mb.empty) return; const m = new Mesh(mb.geo(), mat); m.renderOrder = order; m.castShadow = false; m.receiveShadow = !mat.isMeshBasicMaterial; meshes.push(m); };
  const off = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
  add(A, new MeshBasicMaterial({ color: 0x000000, map: ao, ...off }), 1);
  add(WX, new MeshStandardMaterial({ color: 0x3a342c, map: atlas, roughness: 0.16, metalness: 0, ...off }), 2);
  add(SC, new MeshStandardMaterial({ color: 0x1c1a18, map: atlas, roughness: 0.85, metalness: 0, ...off }), 2);
  return meshes;
}
