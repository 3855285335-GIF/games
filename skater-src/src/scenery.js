// 整张地图的画面：障碍物 + 道具 + 地面贴花 + 围墙 + 周边（草地树木 / 城市楼群）+ 路灯
import { Vector2, Mesh, MeshStandardMaterial, MeshBasicMaterial, Shape, Path, ShapeGeometry, CylinderGeometry, BoxGeometry, IcosahedronGeometry, PlaneGeometry, Matrix4, Group, DoubleSide, AdditiveBlending, Color } from 'three';
import { MB, between } from './meshkit.js';
import { toWorld } from './terrain.js';
import { buildQP, buildRamp, buildBox, buildStairs, buildPyr, buildBowl, bowlHolePath, buildRails } from './parkmesh.js';
import * as TX from './textures.js';
import { rng } from './util.js';

let M = null;
export function getMats(renderer) {
  if (M) return M;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const t = (x) => { x.anisotropy = aniso; return x; };
  const win = [TX.windows(5, '#9aa3ad'), TX.windows(6, '#b8ab98'), TX.windows(8, '#7f93a6')];
  // 水泥：高清贴图 + 凹凸（地面粗一点、坡面抹得光一点，有一点点反光）
  const cg = TX.concreteHD(1, '#93918c', 0, true, 2048), ct = TX.concreteHD(2, '#b9b7b2', 1, false, 1024), cs = TX.concreteHD(3, '#9a9893', 0, false, 1024);
  const nm = (o, k) => { t(o.map); t(o.normalMap); return { map: o.map, normalMap: o.normalMap, normalScale: new Vector2(k, k) }; };
  M = {
    ground: new MeshStandardMaterial({ ...nm(cg, 0.7), roughness: 0.86 }),
    trans: new MeshStandardMaterial({ ...nm(ct, 0.5), roughness: 0.62 }),
    side: new MeshStandardMaterial({ ...nm(cs, 0.7), roughness: 0.9 }),
    wood: new MeshStandardMaterial({ map: t(TX.plywood(4)), roughness: 0.7 }),
    tile: new MeshStandardMaterial({ map: t(TX.tiles()), roughness: 0.35 }),
    metal: new MeshStandardMaterial({ color: 0xd2d6dc, metalness: 0.95, roughness: 0.28 }),
    steel: new MeshStandardMaterial({ color: 0x80858d, metalness: 0.5, roughness: 0.42 }),
    rail: new MeshStandardMaterial({ map: t(TX.railStripes()), metalness: 0.3, roughness: 0.3 }),
    w_yellow: new MeshStandardMaterial({ map: t(TX.paintedWood('#e9b437', 41)), roughness: 0.65 }),
    w_blue: new MeshStandardMaterial({ map: t(TX.paintedWood('#2f86c9', 42)), roughness: 0.65 }),
    wall: new MeshStandardMaterial({ map: t(TX.graffiti(21, 2048, 256)), roughness: 0.9 }),
    graf: new MeshStandardMaterial({ map: t(TX.graffiti(7, 1024, 128)), roughness: 0.9 }),
    fence: new MeshStandardMaterial({ map: t(TX.fence()), alphaTest: 0.5, side: DoubleSide, metalness: 0.5, roughness: 0.5 }),
    grass: new MeshStandardMaterial({ map: t(TX.grass()), roughness: 1 }),
    asphalt: new MeshStandardMaterial({ map: t(TX.asphalt()), roughness: 1 }),
    tree: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
    bld: win.map(([m, e]) => new MeshStandardMaterial({ map: t(m), emissiveMap: e, emissive: new Color(0xffffff), emissiveIntensity: 0, roughness: 0.8 })),
    roofTop: new MeshStandardMaterial({ color: 0x8d8f93, roughness: 0.95 }),
    lamp: new MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.6, roughness: 0.5 }),
    lampHead: new MeshStandardMaterial({ color: 0xf4f1e8, emissive: new Color(0xffe2a8), emissiveIntensity: 0, roughness: 0.4 }),
    benchWood: new MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.8 }),
    green: new MeshStandardMaterial({ color: 0x3f7a3a, flatShading: true, roughness: 0.9 }),
    soil: new MeshStandardMaterial({ color: 0x4b3a2c, roughness: 1 }),
    can: new MeshStandardMaterial({ color: 0x2f5f46, metalness: 0.5, roughness: 0.5 }),
    ac: new MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.4, roughness: 0.55 }),
    dark: new MeshStandardMaterial({ color: 0x26282c, roughness: 0.8 }),
    glass: new MeshStandardMaterial({ color: 0x8fc4e8, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.55 }),
    decal: new MeshStandardMaterial({ map: TX.decalAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.9 }),
    p_blue: new MeshStandardMaterial({ map: t(TX.painted('#2f7fd8', 31)), roughness: 0.6 }),
    p_yellow: new MeshStandardMaterial({ map: t(TX.painted('#f2c230', 32)), roughness: 0.6 }),
    p_red: new MeshStandardMaterial({ map: t(TX.painted('#d9473b', 33)), roughness: 0.6 }),
    fenceWood: new MeshStandardMaterial({ map: t(TX.planks()), roughness: 0.9, side: DoubleSide }),
    angle: new MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.35 }),
    glow: new MeshBasicMaterial({ map: TX.glow(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  };
  M.wall.map.repeat.set(1 / 8, 4); M.graf.map.repeat.set(1 / 6, 4);
  return M;
}
function W(f, lx, y, lz) { const p = toWorld(f, lx, lz); return [p[0], y, p[1]]; }
const mtx = (f, lx, y, lz, sx, sy, sz) => { const p = toWorld(f, lx, lz); return new Matrix4().makeRotationY(f.yaw || 0).scale({ x: sx || 1, y: sy || 1, z: sz || 1 }).setPosition(p[0], y, p[1]); };

function buildProp(f, B) {
  const hw = f.w / 2, hd = f.d / 2;
  if (f.deco === 'bench') {
    B.trans.addGeo(new BoxGeometry(f.w, 0.08, f.d), mtx(f, 0, f.h - 0.04, 0));
    for (const sx of [-1, 1]) B.side.addGeo(new BoxGeometry(0.16, f.h - 0.08, f.d * 0.9), mtx(f, sx * (hw - 0.3), (f.h - 0.08) / 2, 0));
  } else if (f.deco === 'planter') {
    buildBox(f, B.trans, B.side);
    B.soil.addGeo(new BoxGeometry(f.w - 0.16, 0.02, f.d - 0.16), mtx(f, 0, f.h + 0.003, 0));
    const R = rng(Math.round(f.x * 7 + f.z * 13));
    for (let i = 0; i < 3; i++) B.green.addGeo(new IcosahedronGeometry(0.22 + R() * 0.12, 0), mtx(f, (i - 1) * hw * 0.55, f.h + 0.18, (R() - 0.5) * 0.2));
  } else if (f.deco === 'trash') {
    B.can.addGeo(new CylinderGeometry(0.27, 0.25, f.h, 14), mtx(f, 0, f.h / 2, 0));
    B.dark.addGeo(new CylinderGeometry(0.29, 0.29, 0.05, 14), mtx(f, 0, f.h, 0));
  } else if (f.deco === 'ac') {
    B.ac.addGeo(new BoxGeometry(f.w, f.h, f.d), mtx(f, 0, f.h / 2, 0));
    B.dark.addGeo(new CylinderGeometry(0.42, 0.42, 0.02, 18), mtx(f, -hw * 0.45, f.h + 0.005, 0));
    B.dark.addGeo(new CylinderGeometry(0.42, 0.42, 0.02, 18), mtx(f, hw * 0.45, f.h + 0.005, 0));
    for (let i = 0; i < 6; i++) B.steel.addGeo(new BoxGeometry(0.01, f.h * 0.7, f.d * 0.96), mtx(f, -hw + 0.12 + i * 0.05, f.h * 0.45, 0));
  } else if (f.deco === 'skylight') {
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const sx = ax ? 0.1 : f.w, sz = az ? 0.1 : f.d;
      B.steel.addGeo(new BoxGeometry(sx, f.h, sz), mtx(f, ax * (hw - 0.05), f.h / 2, az * (hd - 0.05)));
    }
    B.dark.addGeo(new BoxGeometry(f.w - 0.2, f.h - 0.06, f.d - 0.2), mtx(f, 0, (f.h - 0.06) / 2, 0));
    B.glass.addGeo(new BoxGeometry(f.w - 0.1, 0.02, f.d - 0.1), mtx(f, 0, f.h - 0.01, 0));
    for (let i = 1; i < 4; i++) B.steel.addGeo(new BoxGeometry(0.05, 0.03, f.d - 0.1), mtx(f, -hw + (i * f.w) / 4, f.h - 0.005, 0));
  } else buildBox(f, B.trans, B.side);
}
function buildDecals(T, mb) {
  const cell = TX.DECAL_CELLS;
  let k = 0;
  for (const [kind, x, z, w, rot] of T.decals || []) {
    const c = cell[kind], u0 = (c % 4) / 4, u1 = u0 + 0.25, v1 = 1 - Math.floor(c / 4) / 2, v0 = v1 - 0.5;
    const L = w / 2, Wd = kind === 'line' ? 0.08 : kind === 'skid' ? w * 0.22 : w / 2;
    const vy = kind === 'line' ? [0.42, 0.58] : kind === 'skid' ? [0.3, 0.7] : [0, 1];
    const cs = Math.cos(rot), sn = Math.sin(rot), y = T.height(x, z) + 0.004 + (k++ % 7) * 0.0006;
    const P = (a, b) => [x + a * cs - b * sn, y, z + a * sn + b * cs];
    const uv = (a, b) => [u0 + (a + 1) / 2 * 0.25, v0 + (vy[0] + (b + 1) / 2 * (vy[1] - vy[0])) * 0.5];
    mb.quadN([P(-L, -Wd), P(L, -Wd), P(L, Wd), P(-L, Wd)], [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]], [uv(-1, -1), uv(1, -1), uv(1, 1), uv(-1, 1)]);
  }
}
function buildWalls(T, B, theme) {
  const { minX, maxX, minZ, maxZ } = T.bounds, base = theme.wall;
  const seg = (x0, z0, x1, z1, nx, nz) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2);
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n, ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      let mh = 0;
      for (let k = 0; k <= 4; k++) { const t = k / 4; mh = Math.max(mh, T.height(ax + (bx - ax) * t - nx * 0.3, az + (bz - az) * t - nz * 0.3)); }
      const h = mh + base, ox = nx * 0.25, oz = nz * 0.25;
      if (theme.outside === 'hdr') {
        // 城市广场：矮水泥墙（里外两面 + 顶面）+ 镀锌钢栏杆，外面就是真实的广场照片
        B.side.poly([[ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az]], [-nx, 0, -nz]);
        B.side.poly([[bx + nx * 0.4, 0, bz + nz * 0.4], [ax + nx * 0.4, 0, az + nz * 0.4], [ax + nx * 0.4, h, az + nz * 0.4], [bx + nx * 0.4, h, bz + nz * 0.4]], [nx, 0, nz]);
        B.trans.poly([[ax + nx * 0.4, h, az + nz * 0.4], [bx + nx * 0.4, h, bz + nz * 0.4], [bx, h, bz], [ax, h, az]], [0, 1, 0]);
        B.steel.addGeo(new CylinderGeometry(0.03, 0.03, 1, 8), between(ax + ox * 0.8, h, az + oz * 0.8, ax + ox * 0.8, h + 0.95, az + oz * 0.8));
        B.metal.addGeo(new CylinderGeometry(0.024, 0.024, 1, 8), between(ax + ox * 0.8, h + 0.95, az + oz * 0.8, bx + ox * 0.8, h + 0.95, bz + oz * 0.8));
        B.metal.addGeo(new CylinderGeometry(0.014, 0.014, 1, 6), between(ax + ox * 0.8, h + 0.5, az + oz * 0.8, bx + ox * 0.8, h + 0.5, bz + oz * 0.8));
        continue;
      }
      B.wall.poly([[ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az]], [-nx, 0, -nz]);
      B.side.poly([[ax + nx * 0.5, h, az + nz * 0.5], [bx + nx * 0.5, h, bz + nz * 0.5], [bx, h, bz], [ax, h, az]], [0, 1, 0]);
      if (theme.fence === 'wood') {
        // 小院：木板围栏
        B.fenceWood.poly([[ax + ox, h, az + oz], [bx + ox, h, bz + oz], [bx + ox, h + 1.8, bz + oz], [ax + ox, h + 1.8, az + oz]], [-nx, 0, -nz], 2);
        B.benchWood.addGeo(new BoxGeometry(0.09, 1.9, 0.09), new Matrix4().makeTranslation(ax + ox - nx * 0.06, h + 0.95, az + oz - nz * 0.06));
      } else if (theme.outside === 'grass') {
        B.fence.poly([[ax + ox, h, az + oz], [bx + ox, h, bz + oz], [bx + ox, h + 2.2, bz + oz], [ax + ox, h + 2.2, az + oz]], [-nx, 0, -nz], 1.2);
        B.steel.addGeo(new CylinderGeometry(0.035, 0.035, 1, 6), between(ax + ox, h, az + oz, ax + ox, h + 2.25, az + oz));
      } else {
        // 天台：外侧墙面一直延伸到楼下 + 金属栏杆
        facade(B.facade, [bx + nx * 0.5, 0, bz + nz * 0.5], [ax + nx * 0.5, 0, az + nz * 0.5], -46, h);
        B.steel.addGeo(new CylinderGeometry(0.03, 0.03, 1, 6), between(ax + ox, h, az + oz, ax + ox, h + 0.9, az + oz));
        B.metal.addGeo(new CylinderGeometry(0.025, 0.025, 1, 6), between(ax + ox, h + 0.9, az + oz, bx + ox, h + 0.9, bz + oz));
        B.metal.addGeo(new CylinderGeometry(0.018, 0.018, 1, 6), between(ax + ox, h + 0.45, az + oz, bx + ox, h + 0.45, bz + oz));
      }
    }
  };
  seg(minX, minZ, maxX, minZ, 0, -1); seg(maxX, minZ, maxX, maxZ, 1, 0); seg(maxX, maxZ, minX, maxZ, 0, 1); seg(minX, maxZ, minX, minZ, -1, 0);
}
// 一面窗户墙：横向每 8 米一张贴图，纵向每 48 米（16 层）一张
function facade(mb, A, B, y0, y1) {
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const nx = B[2] - A[2], nz = -(B[0] - A[0]), nl = Math.hypot(nx, nz) || 1, n = [nx / nl, 0, nz / nl];
  const u1 = len / 8, v0 = y0 / 48, v1 = y1 / 48;
  mb.quadN([[A[0], y0, A[2]], [B[0], y0, B[2]], [B[0], y1, B[2]], [A[0], y1, A[2]]], [n, n, n, n], [[0, v0], [u1, v0], [u1, v1], [0, v1]]);
}
// 一栋楼：四面窗户 + 楼顶
function building(B, R, x, z, w, d, y0, y1, rot) {
  const k = Math.floor(R() * 3), mb = B['bld' + k];
  const c = Math.cos(rot), s = Math.sin(rot), P = (a, y, b) => [x + a * c + b * s, y, z - a * s + b * c];
  const hw = w / 2, hd = d / 2;
  const faces = [[[-hw, -hd], [hw, -hd]], [[hw, -hd], [hw, hd]], [[hw, hd], [-hw, hd]], [[-hw, hd], [-hw, -hd]]];
  for (const [[ax, az], [bx, bz]] of faces) {
    facade(mb, P(ax, y0, az), P(bx, y0, bz), y0, y1);
  }
  B.roofTop.poly([P(-hw, y1, -hd), P(hw, y1, -hd), P(hw, y1, hd), P(-hw, y1, hd)], [0, 1, 0]);
  if (R() < 0.5) B.ac.addGeo(new BoxGeometry(2 + R() * 3, 1.2, 2 + R() * 2), new Matrix4().makeRotationY(rot).setPosition(x + (R() - 0.5) * w * 0.5, y1 + 0.6, z + (R() - 0.5) * d * 0.5));
  if (R() < 0.3) { B.lamp.addGeo(new CylinderGeometry(1.4, 1.4, 3, 12), new Matrix4().makeTranslation(x, y1 + 3.5, z)); B.lamp.addGeo(new CylinderGeometry(0.15, 0.15, 2, 6), new Matrix4().makeTranslation(x + 1, y1 + 1, z)); }
}
function buildOutside(T, B, theme, group, mats) {
  const R = rng(T.id === 'roof' ? 99 : 11), { minX, maxX, minZ, maxZ } = T.bounds;
  const inside = (x, z, m) => x > minX - m && x < maxX + m && z > minZ - m && z < maxZ + m;
  const lamps = [];
  if (theme.outside === 'hdr') {
    // 远处是照片，不用再造树和楼；四个角放路灯（夜晚亮）
    for (const [x, z] of [[minX - 1, minZ - 1], [maxX + 1, minZ - 1], [minX - 1, maxZ + 1], [maxX + 1, maxZ + 1]]) lamps.push([x, z, 6]); // 放在墙外，不挡路
  } else if (theme.outside === 'grass') {
    for (let i = 0; i < 90; i++) {
      let x, z, k = 0;
      do { const a = R() * Math.PI * 2, d = 40 + R() * 80; x = Math.cos(a) * d; z = Math.sin(a) * d * 1.2; k++; } while (inside(x, z, 6) && k < 20);
      const s = 0.8 + R() * 0.9, g = 0.75 + R() * 0.35;
      B.trunk.col = [0.45, 0.33, 0.24]; B.trunk.addGeo(new CylinderGeometry(0.16 * s, 0.24 * s, 2.4 * s, 6), new Matrix4().makeTranslation(x, 1.2 * s, z));
      B.leaves.col = [0.26 * g, 0.48 * g, 0.24 * g]; B.leaves.addGeo(new IcosahedronGeometry(1.7 * s, 0), new Matrix4().makeTranslation(x, 3.2 * s, z));
      B.leaves.col = [0.3 * g, 0.55 * g, 0.27 * g]; B.leaves.addGeo(new IcosahedronGeometry(1.25 * s, 0), new Matrix4().makeTranslation(x + 0.6 * s, 4.3 * s, z - 0.3 * s));
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + R() * 0.08, d = 140 + R() * 60;
      building(B, R, Math.cos(a) * d, Math.sin(a) * d, 12 + R() * 16, 12 + R() * 14, 0, 14 + R() * 46, -a);
    }
    for (const [x, z] of [[minX - 2, minZ - 2], [maxX + 2, minZ - 2], [minX - 2, maxZ + 2], [maxX + 2, maxZ + 2], [minX - 2, 0], [maxX + 2, 0], [0, minZ - 2], [0, maxZ + 2]]) lamps.push([x, z, 8]);
    // 草地（中间挖掉公园）
    const gs = new Shape(); gs.moveTo(-450, 450); gs.lineTo(450, 450); gs.lineTo(450, -450); gs.lineTo(-450, -450); gs.closePath();
    const ph = new Path(); ph.moveTo(minX + 0.3, -minZ - 0.3); ph.lineTo(minX + 0.3, -maxZ + 0.3); ph.lineTo(maxX - 0.3, -maxZ + 0.3); ph.lineTo(maxX - 0.3, -minZ - 0.3); ph.closePath();
    gs.holes.push(ph);
    const gr = new ShapeGeometry(gs); gr.rotateX(-Math.PI / 2);
    const uv = gr.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6);
    const gm = new Mesh(gr, mats.grass); gm.position.y = -0.02; gm.receiveShadow = true; group.add(gm);
  } else {
    // 城市：楼下的街道 + 四周高低不一的楼
    const st = new PlaneGeometry(900, 900); st.rotateX(-Math.PI / 2);
    const su = st.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * 120, su.getY(i) * 120);
    const sm = new Mesh(st, mats.asphalt); sm.position.y = -46; group.add(sm);
    const ring = [[0, minZ - 22, 60, 20], [0, maxZ + 22, 60, 20], [minX - 22, 0, 20, 70], [maxX + 22, 0, 20, 70]];
    for (const [cx, cz, sx, sz] of ring) for (let i = 0; i < 4; i++) {
      const x = cx + (R() - 0.5) * sx, z = cz + (R() - 0.5) * sz;
      if (inside(x, z, 12)) continue;
      building(B, R, x, z, 10 + R() * 12, 10 + R() * 12, -46, -14 + R() * 60, (R() - 0.5) * 0.3);
    }
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, d = 70 + R() * 170, x = Math.cos(a) * d, z = Math.sin(a) * d;
      building(B, R, x, z, 12 + R() * 22, 12 + R() * 22, -46, -20 + R() * 110, -a);
    }
    // 旁边楼顶的水塔
    B.lamp.addGeo(new CylinderGeometry(2.2, 2.2, 3.5, 14), new Matrix4().makeTranslation(minX - 14, 6, minZ - 12));
    for (const [x, z] of [[minX + 1, minZ + 1], [maxX - 1, minZ + 1], [minX + 1, maxZ - 1], [maxX - 1, maxZ - 1]]) lamps.push([x, z, 5]);
  }
  for (const [x, z, h] of lamps) {
    const g = theme.outside === 'hdr' ? 0 : T.height(Math.max(minX, Math.min(maxX, x)), Math.max(minZ, Math.min(maxZ, z)));
    B.lamp.addGeo(new CylinderGeometry(0.1, 0.14, h, 8), new Matrix4().makeTranslation(x, g + h / 2, z));
    B.lampHead.addGeo(new BoxGeometry(1.2, 0.25, 0.45), new Matrix4().makeTranslation(x, g + h + 0.1, z));
  }
  return lamps;
}

export function buildScene(T, renderer) {
  const mats = getMats(renderer), theme = T.theme;
  const group = new Group();
  const names = ['w_yellow', 'w_blue', 'p_blue', 'p_yellow', 'p_red', 'fenceWood', 'angle', 'trans', 'side', 'wood', 'tile', 'metal', 'steel', 'rail', 'ground2', 'wall', 'fence', 'graf', 'soil', 'green', 'can', 'ac', 'dark', 'glass', 'benchWood', 'decal', 'facade', 'roofTop', 'lamp', 'lampHead', 'bld0', 'bld1', 'bld2'];
  const B = {}; for (const n of names) B[n] = new MB();
  B.trunk = new MB(true); B.leaves = new MB(true);
  for (const f of T.feats) {
    // 木头道具：顶面木板（可以刷漆），侧面也是木板（以前侧面是水泥，看着像一块石头）
    const wood = f.mat === 'wood';
    const top = wood ? (f.paint ? B['w_' + f.paint] : B.wood) : f.name === 'platform' ? B.ground2 : B.trans;
    const side = wood ? (f.side ? B['w_' + f.side] : B.wood) : B.side;
    if (f.deco) buildProp(f, B);
    else if (f.t === 'qp') buildQP(f, top, side, B.metal);
    else if (f.t === 'ramp') buildRamp(f, top, side);
    else if (f.t === 'box' && wood) buildBox(f, top, side);
    else if (f.t === 'box' && f.paint) buildBox(f, B['p_' + f.paint], B['p_' + f.paint]);
    else if (f.t === 'box') buildBox(f, top, f.name === 'platform' ? B.graf : B.side);
    else if (f.t === 'stairs') buildStairs(f, B.ground2, B.side);
    else if (f.t === 'pyr') buildPyr(f, B.trans, B.side);
  }
  for (const f of T.cuts) buildBowl(f, B.trans, B.tile, B.metal);
  buildRails(T, (x, z) => T.height(x, z), B.rail, B.metal, B.steel, B.angle);
  buildDecals(T, B.decal);
  buildWalls(T, B, theme);
  const lamps = buildOutside(T, B, theme, group, mats);
  // 地面（挖掉碗池）
  const { minX, maxX, minZ, maxZ } = T.bounds;
  const sh = new Shape();
  sh.moveTo(minX, -minZ); sh.lineTo(maxX, -minZ); sh.lineTo(maxX, -maxZ); sh.lineTo(minX, -maxZ); sh.closePath();
  for (const f of T.cuts) sh.holes.push(bowlHolePath(f));
  const gg = new ShapeGeometry(sh); gg.rotateX(-Math.PI / 2);
  const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  const ground = new Mesh(gg, mats.ground); ground.receiveShadow = true; group.add(ground);
  const map = { ground2: mats.ground, facade: mats.bld[0], bld0: mats.bld[0], bld1: mats.bld[1], bld2: mats.bld[2], trunk: mats.tree, leaves: mats.tree };
  const noCast = new Set(['fence', 'decal', 'facade', 'bld0', 'bld1', 'bld2', 'roofTop', 'glass']);
  for (const k in B) {
    if (B[k].empty) continue;
    const m = new Mesh(B[k].geo(), map[k] || mats[k]);
    m.receiveShadow = k !== 'decal'; m.castShadow = !noCast.has(k);
    if (k === 'decal' || k === 'glass') m.renderOrder = 1;
    group.add(m);
  }
  // 夜晚路灯光斑
  const glowG = new MB();
  for (const [x, z] of lamps) {
    const cx = Math.max(minX + 0.5, Math.min(maxX - 0.5, x)), cz = Math.max(minZ + 0.5, Math.min(maxZ - 0.5, z)), r = 11, y = 0.02;
    glowG.quadN([[cx - r, y, cz - r], [cx + r, y, cz - r], [cx + r, y, cz + r], [cx - r, y, cz + r]], [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  const glowM = new Mesh(glowG.geo(), mats.glow); glowM.renderOrder = 2; group.add(glowM);
  return {
    group, lamps,
    dispose() { group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); },
  };
}
