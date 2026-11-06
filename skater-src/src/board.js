// 滑板模型。原点 = 四个轮子着地平面的中心，+Z 板头，+Y 向上
// 结构：板面组（板面 + 螺丝 + 底座 + 桥胶，可以侧倾、落地下沉）+ 前后两个支架组（支架 + 轴 + 轮子，转弯时会跟着转一点）
import { Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, BoxGeometry, CylinderGeometry, LatheGeometry, ExtrudeGeometry, Shape, Vector2, Color, Matrix4, CanvasTexture, SRGBColorSpace } from 'three';
import { grip, gripNormal, deckTexture, DECKS, GRIPS, WHEELS, TRUCKS } from './textures.js';
import { MB } from './meshkit.js';

export const DECK = { L: 0.8, W: 0.21, kickZ: 0.265, rise: 0.058, base: 0.075, thick: 0.011, truckZ: 0.18 };
const AXY = 0.027, WR = 0.027, WW = 0.032, WX = 0.084; // 轴高、轮半径、轮宽、轮子中心离板中线
const PIV = 0.052; // 板面侧倾的转轴高度（支架的转轴附近）
const GRIPM = [], WHEELM = [], TRUCKM = [];
let GN = null;
const gripMat = (i) => GRIPM[i] || (GRIPM[i] = new MeshStandardMaterial({ map: grip(i), normalMap: GN || (GN = gripNormal()), normalScale: new Vector2(0.9, 0.9), roughness: 0.82 })); // 砂纸颗粒在灯下有一点点闪
const wheelMat = (i) => WHEELM[i] || (WHEELM[i] = new MeshStandardMaterial({ color: new Color(WHEELS[i]), roughness: 0.62 }));
const truckMat = (i) => TRUCKM[i] || (TRUCKM[i] = new MeshStandardMaterial({ color: TRUCKS[i].c, metalness: TRUCKS[i].m, roughness: TRUCKS[i].r }));
// 板子配置：{ deck, grip, wheel, truck }，兼容旧的数字写法
export function normBoard(o) {
  if (typeof o === 'number') o = { deck: o };
  o = o || {};
  const n = (v, m) => ((v | 0) % m + m) % m;
  return { deck: n(o.deck, DECKS.length), grip: n(o.grip, GRIPS.length), wheel: n(o.wheel == null ? 0 : o.wheel, WHEELS.length), truck: n(o.truck, TRUCKS.length) };
}
export const sameBoard = (a, b) => a && b && a.deck === b.deck && a.grip === b.grip && a.wheel === b.wheel && a.truck === b.truck;
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  // 板边：7 层枫木，中间夹两层染色的（一眼能看出是层压板）
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d');
  const plies = ['#e9cfa4', '#d9b98a', '#e9cfa4', '#2b6fb3', '#e9cfa4', '#d4423b', '#e2c597'];
  plies.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, (i * 64) / 7, 4, 64 / 7 + 1); });
  x.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 1; i < 7; i++) x.fillRect(0, Math.round((i * 64) / 7), 4, 1);
  const st = new CanvasTexture(c); st.colorSpace = SRGBColorSpace;
  SHARED = {
    side: new MeshStandardMaterial({ map: st, roughness: 0.75 }),
    dark: new MeshStandardMaterial({ color: 0x1d1e21, metalness: 0.3, roughness: 0.55 }),
    steel: new MeshStandardMaterial({ color: 0x45484d, metalness: 0.35, roughness: 0.5 }), // 板面上的螺丝：暗一点（以前反光像白点）
    bush: new MeshStandardMaterial({ color: 0xffa21f, roughness: 0.72 }),
  };
  return SHARED;
}

function deckY(z, x) {
  const az = Math.abs(z), half = DECK.L / 2;
  let y = DECK.base;
  if (az > DECK.kickZ) y += DECK.rise * Math.pow((az - DECK.kickZ) / (half - DECK.kickZ), 1.6);
  return y + 0.0075 * Math.pow(x / (DECK.W / 2), 2); // 板面凹弧（两边微微翘起）
}
export const deckTop = (z, x) => deckY(z, x || 0) + DECK.thick;
function halfW(z) {
  const R = DECK.W / 2, e = DECK.L / 2 - R, az = Math.abs(z);
  return az <= e ? R : Math.sqrt(Math.max(0, R * R - (az - e) * (az - e)));
}
function deckGeometry() {
  const NU = 48, NV = 10, pos = [], uv = [], idx = [], groups = [];
  const zs = [];
  for (let i = 0; i <= NU; i++) { const t = i / NU; zs.push(-DECK.L / 2 * Math.cos(t * Math.PI)); }
  // 顶面(0) 和 底面(1)：边缘往里收一点点，做出圆角板边
  const E = 0.0025;
  for (let side = 0; side < 2; side++) {
    const start = pos.length / 3, istart = idx.length;
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
      const z = zs[i], hw = Math.max(0, halfW(z) - E), x = -hw + (2 * hw * j) / NV;
      const zz = Math.sign(z) * Math.max(0, Math.abs(z) - (Math.abs(z) > DECK.L / 2 - 0.01 ? E : 0));
      const y = deckY(zz, x) + (side === 0 ? DECK.thick : 0);
      pos.push(x, y, zz); uv.push(j / NV, (z + DECK.L / 2) / DECK.L);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = start + i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
      if (side === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    groups.push([istart, idx.length - istart, side]);
  }
  // 侧边：上下各一条倒角 + 中间竖直的板边
  const ring = [];
  for (let i = 0; i <= NU; i++) ring.push([zs[i], halfW(zs[i]), 1]);
  for (let i = NU; i >= 0; i--) ring.push([zs[i], -halfW(zs[i]), -1]);
  const s0 = pos.length / 3, is0 = idx.length;
  const rows = [[0, -E], [0.18, 0], [0.82, 0], [1, -E]]; // [高度比例, 往里收]
  for (let k = 0; k < ring.length; k++) {
    const [z, x] = ring[k], hw = Math.abs(x), sx = Math.sign(x) || 1, y = deckY(z, x);
    for (const [hv, ins] of rows) {
      const r = Math.max(0, hw + ins);
      // 板头板尾的圆弧：沿半径方向往里收
      const e = DECK.L / 2 - DECK.W / 2, az = Math.abs(z);
      let px = sx * r, pz = z;
      if (az > e && ins) { const cz = Math.sign(z) * e, dx = x, dz = z - cz, dl = Math.hypot(dx, dz) || 1; px = x + (dx / dl) * ins; pz = z + (dz / dl) * ins; }
      pos.push(px, y + DECK.thick * hv, pz); uv.push(k / ring.length, hv);
    }
  }
  for (let k = 0; k < ring.length - 1; k++) for (let r = 0; r < rows.length - 1; r++) {
    const a = s0 + k * rows.length + r, b = a + 1, c = a + rows.length, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  groups.push([is0, idx.length - is0, 2]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  for (const [s, c, m] of groups) g.addGroup(s, c, m);
  g.computeVertexNormals();
  return g;
}
const M4 = () => new Matrix4();
// 轮子：外圈圆润的接地面 + 两侧锥面 + 中间轴承凹槽（两个轮子合成一个网格，绕同一根轴转）
function wheelPairGeometry() {
  const w = WW, r = WR, pts = [];
  const hub = 0.0115, rec = 0.0035;
  pts.push(new Vector2(hub, -w / 2 + rec));
  pts.push(new Vector2(hub + 0.001, -w / 2));
  pts.push(new Vector2(r - 0.008, -w / 2 + 0.0012));
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * (Math.PI / 2); pts.push(new Vector2(r - 0.007 + Math.sin(a) * 0.007, -w / 2 + 0.0012 + (1 - Math.cos(a)) * 0.006)); }
  for (let i = 5; i >= 0; i--) { const a = (i / 5) * (Math.PI / 2); pts.push(new Vector2(r - 0.007 + Math.sin(a) * 0.007, w / 2 - 0.0012 - (1 - Math.cos(a)) * 0.006)); }
  pts.push(new Vector2(r - 0.008, w / 2 - 0.0012));
  pts.push(new Vector2(hub + 0.001, w / 2));
  pts.push(new Vector2(hub, w / 2 - rec));
  const one = new LatheGeometry(pts, 28);
  one.rotateZ(Math.PI / 2); // 轴向 = x
  const mb = new MB();
  for (const sx of [-1, 1]) mb.addGeo(one.clone(), M4().makeTranslation(sx * WX, 0, 0));
  one.dispose();
  return mb.geo();
}
// 轴承（深色防尘盖）+ 轴头螺母
function bearingGeometry() {
  const mb = new MB();
  for (const sx of [-1, 1]) {
    const b = new CylinderGeometry(0.0112, 0.0112, WW - 0.006, 18); b.rotateZ(Math.PI / 2);
    mb.addGeo(b, M4().makeTranslation(sx * WX, 0, 0));
  }
  return mb.geo();
}
// 支架（不含轮子）：铸造的吊架 + 轴 + 螺母，原点在这只支架下方的地面
function hangerGeometry() {
  const mb = new MB();
  // 吊架横梁：两头细、中间粗
  const bar = new CylinderGeometry(0.0085, 0.0105, 0.066, 14); bar.rotateZ(Math.PI / 2);
  mb.addGeo(bar.clone(), M4().makeTranslation(-0.035, AXY + 0.001, 0));
  const bar2 = new CylinderGeometry(0.0105, 0.0085, 0.066, 14); bar2.rotateZ(Math.PI / 2);
  mb.addGeo(bar2, M4().makeTranslation(0.035, AXY + 0.001, 0)); bar.dispose();
  // 中间的三角形本体（往上收窄到转轴）
  const sh = new Shape();
  sh.moveTo(-0.052, -0.004); sh.lineTo(0.052, -0.004); sh.lineTo(0.016, 0.022); sh.lineTo(-0.016, 0.022); sh.closePath();
  const body = new ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, steps: 1 });
  body.translate(0, AXY, -0.008);
  mb.addGeo(body, M4());
  // 轴 + 两头螺母 + 垫片
  const ax = new CylinderGeometry(0.0038, 0.0038, 2 * (WX + WW / 2 + 0.006), 8); ax.rotateZ(Math.PI / 2);
  mb.addGeo(ax, M4().makeTranslation(0, AXY, 0));
  for (const sx of [-1, 1]) {
    const nut = new CylinderGeometry(0.0058, 0.0058, 0.006, 6); nut.rotateZ(Math.PI / 2);
    mb.addGeo(nut, M4().makeTranslation(sx * (WX + WW / 2 + 0.004), AXY, 0));
  }
  return mb.geo();
}
// 板面下的金属件（底座 + 转轴 + 大螺丝 + 底座螺母），tz = 支架位置（±），朝内的一侧放大螺丝
function plateGeometry(tz) {
  const mb = new MB(), inw = -Math.sign(tz);
  const yb = DECK.base;
  const plate = new BoxGeometry(0.058, 0.006, 0.084); mb.addGeo(plate, M4().makeTranslation(0, yb - 0.003, tz));
  // 转轴座（朝外）
  const cup = new BoxGeometry(0.03, 0.016, 0.022); mb.addGeo(cup, M4().makeTranslation(0, yb - 0.012, tz - inw * 0.024));
  const arm = new CylinderGeometry(0.0055, 0.007, 0.03, 10); mb.addGeo(arm, new Matrix4().makeRotationX(inw * 0.95).setPosition(0, yb - 0.019, tz - inw * 0.012));
  // 大螺丝（往里斜）
  const kp = new CylinderGeometry(0.0042, 0.0042, 0.04, 8); mb.addGeo(kp, new Matrix4().makeRotationX(-inw * 0.5).setPosition(0, yb - 0.023, tz + inw * 0.012));
  const kn = new CylinderGeometry(0.0065, 0.0065, 0.006, 6); mb.addGeo(kn, new Matrix4().makeRotationX(-inw * 0.5).setPosition(0, yb - 0.04, tz + inw * 0.021));
  // 底座四颗螺母
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const n = new CylinderGeometry(0.0034, 0.0034, 0.004, 6); mb.addGeo(n, M4().makeTranslation(sx * 0.02, yb - 0.008, tz + sz * 0.028)); }
  return mb.geo();
}
function bushGeometry(tz) {
  const mb = new MB(), inw = -Math.sign(tz), yb = DECK.base;
  for (const [dy, r] of [[0.015, 0.0115], [0.033, 0.0105]]) {
    const b = new CylinderGeometry(r, r, 0.009, 14);
    mb.addGeo(b, new Matrix4().makeRotationX(-inw * 0.5).setPosition(0, yb - dy, tz + inw * (0.009 + dy * 0.45)));
  }
  return mb.geo();
}
// 砂纸上露出来的 8 颗螺丝头
function boltGeometry() {
  const mb = new MB();
  for (const tz of [-DECK.truckZ, DECK.truckZ]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 0.02, z = tz + sz * 0.028, b = new CylinderGeometry(0.0036, 0.0036, 0.0012, 10);
    mb.addGeo(b, M4().makeTranslation(x, deckTop(z, x) + 0.0003, z));
  }
  return mb.geo();
}
let G = null;
function geos() {
  if (G) return G;
  G = { deck: deckGeometry(), wheels: wheelPairGeometry(), bearings: bearingGeometry(), hanger: hangerGeometry(), bolts: boltGeometry(), plates: {}, bush: {} };
  for (const tz of [-DECK.truckZ, DECK.truckZ]) { G.plates[tz] = plateGeometry(tz); G.bush[tz] = bushGeometry(tz); }
  return G;
}

export function makeBoard(cfg, opts) {
  opts = opts || {};
  cfg = normBoard(cfg);
  const g = geos(), S = shared();
  const design = cfg.deck;
  const bottom = new MeshStandardMaterial({ map: deckTexture(design), roughness: 0.55 });
  const wm = wheelMat(cfg.wheel), METAL = truckMat(cfg.truck), GRIP = gripMat(cfg.grip);
  const root = new Group(), pitchG = new Group(), shoveG = new Group(), flipG = new Group(), model = new Group();
  root.add(pitchG); pitchG.add(shoveG); shoveG.add(flipG); flipG.add(model);
  const CY = 0.06; flipG.position.y = CY; model.position.y = -CY;
  // 板面组：绕 PIV 高度的纵轴侧倾
  const deckG = new Group(), deckIn = new Group();
  deckG.position.y = PIV; deckIn.position.y = -PIV; deckG.add(deckIn); model.add(deckG);
  deckIn.add(new Mesh(g.deck, [GRIP, bottom, S.side]));
  deckIn.add(new Mesh(g.bolts, S.steel));
  const trucks = [];
  for (const tz of [-DECK.truckZ, DECK.truckZ]) {
    deckIn.add(new Mesh(g.plates[tz], METAL));
    deckIn.add(new Mesh(g.bush[tz], S.bush));
    const tg = new Group(); tg.position.z = tz; model.add(tg);
    tg.add(new Mesh(g.hanger, METAL));
    const spin = new Group(); spin.position.y = AXY; tg.add(spin);
    const wh = new Mesh(g.wheels, wm); spin.add(wh);
    const br = new Mesh(g.bearings, S.dark); spin.add(br);
    trucks.push({ g: tg, spin });
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = !opts.noRecv; } });
  return { root, pitchG, shoveG, flipG, model, deckG, deckIn, trucks, design, cfg, mats: [bottom] };
}
export function disposeBoard(b) {
  // 几何体是所有板子共用的，只释放这块板自己的板底贴图
  for (const m of b.mats) { if (m.map) m.map.dispose(); m.dispose(); }
}
// 把物理姿态套到模型上
// roll = 板面侧倾（绕板子纵轴，正 = 左边抬起），steer = 支架转角，comp = 落地时板面下沉（米）
export function poseBoard(b, p, q, pitch, pivotZ, flip, shove, wheelRot, roll, steer, comp) {
  b.root.position.copy(p);
  b.root.quaternion.copy(q);
  b.pitchG.position.set(0, 0, pivotZ);
  b.pitchG.rotation.set(-pitch, 0, 0);
  b.shoveG.position.set(0, 0, -pivotZ);
  b.shoveG.rotation.set(0, shove, 0);
  b.flipG.rotation.set(0, 0, flip);
  b.deckG.rotation.z = roll || 0;
  b.deckIn.position.y = -PIV - (comp || 0);
  const st = steer || 0;
  b.trucks[0].g.rotation.y = st; b.trucks[1].g.rotation.y = -st; // 后支架 / 前支架反向转
  for (const t of b.trucks) t.spin.rotation.x = wheelRot;
}
