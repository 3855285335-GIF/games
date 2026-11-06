// 主程序：渲染、地图、玩家、相机、模式流程、联机
import { WebGLRenderer, Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, Fog, Color, Vector3, Quaternion, ACESFilmicToneMapping, SRGBColorSpace, PCFShadowMap, Mesh, CylinderGeometry, MeshBasicMaterial, AdditiveBlending, CanvasTexture, PlaneGeometry, Matrix4 } from 'three';
import { buildMap, MAPS } from './maps.js';
import { buildScene, getMats } from './scenery.js';
import { makeSky } from './parkmesh.js';
import { makeBoard, poseBoard, disposeBoard, DECK, normBoard } from './board.js';
import { Skater } from './physics.js';
import { Input } from './input.js';
import { Combo, airTrick, GRIND_RATE, CHALLENGES } from './tricks.js';
import { submitScore, topScores } from './net.js';
import { Online } from './online.js';
import { rnd } from './netcn.js';
import { Sk8 } from './skatemode.js';
import { FX } from './fx.js';
import { Lighting } from './lighting.js';
import { Practice } from './practice.js';
import { Recorder, Player } from './replay.js';
import { Aud } from './audio.js';
import { $, show, esc, settings, saveSettings, sens, toast, setCombo, logCombo, clearLog, setMeter, setHint, completeChal, refreshChal, chalCount, chalDone,
  bindSettings, buildMapChips, buildGarage, isUnlocked, renderBoard, renderSk8, Q_NAME, refreshSetting } from './ui.js';
import { clamp, damp, angDiff, store, fmt } from './util.js';

/* ======== 联机配置：和 Chatter 共用同一个 Supabase 项目（只用实时广播，不建表；排行榜用两个函数） ======== */
// 游戏总项目（games，和 Chatter 分开，额度互不影响）
const SUPABASE_URL = 'https://bjpagltblvejqrvefdur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gCid3ieFBirnSHBhAniBqw_0-wNm-LA';
/* ========================================================================================================= */

const errBox = $('err'); let errShown = 0;
function showErr(m) { if (errShown++ < 3) errBox.textContent = '出错了：' + m; }
addEventListener('error', (e) => showErr(e.message || e));
addEventListener('unhandledrejection', (e) => showErr((e.reason && e.reason.message) || e.reason));
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/* ---------------- 渲染 ---------------- */
const canvas = $('gl');
let renderer;
try { renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { document.body.innerHTML = '<div style="padding:30px;font-size:16px;color:#fff">你的浏览器不支持 WebGL2，无法运行游戏（需要 iOS 15 以上）。</div>'; throw e; }
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.type = PCFShadowMap;
const scene = new Scene();
scene.background = new Color(0xa9cdee);
scene.fog = new Fog(0xc4dcef, 70, 300);
const cam = new PerspectiveCamera(70, 1, 0.03, 900); scene.add(cam);
let baseFov = 70;
const sky = makeSky(); scene.add(sky);
const hemi = new HemisphereLight(0xcfe3f7, 0x8c826f, 0.85); scene.add(hemi);
const sun = new DirectionalLight(0xfff1dc, 2.6);
const SUN_DIR = new Vector3(-0.45, 0.82, -0.36).normalize(); sun.userData.dir = SUN_DIR;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 2;
scene.add(sun); scene.add(sun.target);
const mats = getMats(renderer);
const lighting = new Lighting(renderer, scene, sky, hemi, sun, cam, mats);

// 画质：0 低 / 1 中 / 2 高 / 3 极高（原生分辨率）。只在玩家自己改设置时变化
let qLevel = settings.q;
function applyQuality() {
  const q = qLevel, dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === 3 ? Math.min(dpr, 3) : q === 2 ? Math.min(dpr, 2) : q === 1 ? Math.min(dpr, 1.5) : 1);
  renderer.shadowMap.enabled = q > 0; sun.castShadow = q > 0;
  const size = q === 2 ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; else if (Array.isArray(o.material)) o.material.forEach((m) => (m.needsUpdate = true)); });
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / h; baseFov = cam.fov = cam.aspect < 1 ? 70 : 55; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250));

/* ---------------- 地图 ---------------- */
// 这一版新增「小院」：第一次打开时默认进小院（之后记住玩家自己选的地图）
if (store.get('mapv', 0) < 2) { store.set('map', 'yard'); store.set('mapv', 2); }
let mapId = MAPS.some((m) => m.id === store.get('map', 'spot')) ? store.get('map', 'spot') : MAPS[0].id;
let T = buildMap(mapId), world = buildScene(T, renderer); scene.add(world.group);
let WOOD = new Set(T.feats.filter((f) => f.mat === 'wood'));
function applyTime() { lighting.apply(settings.time === 'auto' ? T.theme.time : settings.time); }
function loadMap(id) {
  if (id === T.id) return;
  scene.remove(world.group); world.dispose();
  mapId = id; store.set('map', id);
  T = buildMap(id); world = buildScene(T, renderer); scene.add(world.group);
  WOOD = new Set(T.feats.filter((f) => f.mat === 'wood'));
  sk.T = T; sk.reset(T.spawn.x, T.spawn.z, T.spawn.yaw); sk.safe = { ...T.spawn };
  fx.clear(); applyTime(); applyQuality();
  online.connect(myRoom, mapId);
}

/* ---------------- 玩家 ---------------- */
let cfg = normBoard(store.get('board', { deck: store.get('deck', Math.floor(Math.random() * 8)) }));
for (const k of ['deck', 'grip', 'wheel', 'truck']) if (!isUnlocked(k, cfg[k])) cfg[k] = 0;
let board = makeBoard(cfg); scene.add(board.root);
/* 长按磨杆：能磨的那段杆子发光 + 前几次显示文字提示 */
const railGlow = new Mesh(new CylinderGeometry(0.055, 0.055, 1, 10, 1), new MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, fog: false, blending: AdditiveBlending }));
railGlow.visible = false; railGlow.renderOrder = 5; scene.add(railGlow);
/* 板子底下的接触阴影：很淡的一块椭圆暗影，贴着地最深、离地越高越淡（阴天里板子底下照不到天光，不加的话板子像飘着） */
const blob = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const geo = new PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const m = new Mesh(geo, new MeshBasicMaterial({ color: 0x000000, map: new CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 }));
  m.renderOrder = 3; m.matrixAutoUpdate = false; m.visible = false; scene.add(m); return m;
})();
const blobQ = { h: 0, gx: 0, gz: 0, f: null }, bF = new Vector3(), bN = new Vector3(), bR = new Vector3(), bM = new Matrix4();
function updateBlob(P, q, on) {
  const r = T.query(P.x, P.z, blobQ), up = P.y - r.h;
  const k = on && !r.wall ? Math.max(0, 1 - Math.max(0, up - 0.02) / 0.55) : 0;
  blob.visible = k > 0.01; if (!blob.visible) return;
  blob.material.opacity = 0.4 * k;
  bN.set(-r.gx, 1, -r.gz).normalize();
  bF.set(0, 0, 1).applyQuaternion(q); bF.addScaledVector(bN, -bF.dot(bN)); if (bF.lengthSq() < 1e-6) bF.set(0, 0, 1); bF.normalize();
  bR.crossVectors(bN, bF).normalize();
  const s = 1 + Math.max(0, up) * 0.6; // 离地高一点，影子散开一点
  bM.makeBasis(bR.multiplyScalar(0.34 * s), bN, bF.multiplyScalar(0.92 * s)).setPosition(P.x, r.h + 0.004, P.z);
  blob.matrix.copy(bM); blob.matrixWorldNeedsUpdate = true;
}
const glowA = new Vector3(), glowB = new Vector3(), glowDir = new Vector3(), glowUp = new Vector3(0, 1, 0);
function showRailTarget(tg, t, I) {
  if (!tg) { railGlow.visible = false; show('railTip', false); return; }
  const r = tg.r, u0 = Math.max(0, tg.u - 0.9), u1 = Math.min(r.L, tg.u + 0.9);
  glowA.set(r.ax + r.dx * u0, r.ay + r.dy * u0 + 0.03, r.az + r.dz * u0);
  glowB.set(r.ax + r.dx * u1, r.ay + r.dy * u1 + 0.03, r.az + r.dz * u1);
  railGlow.position.copy(glowA).add(glowB).multiplyScalar(0.5);
  railGlow.scale.set(1, Math.max(0.05, glowA.distanceTo(glowB)), 1);
  railGlow.quaternion.setFromUnitVectors(glowUp, glowDir.copy(glowB).sub(glowA).normalize());
  railGlow.material.opacity = 0.45 + 0.3 * Math.sin(t * 7);
  railGlow.visible = true;
  if (store.get('lockN', 0) < 6) {
    $('railTip').textContent = I && I.fingers >= 2 && !I.hold ? '抬指再按住 · 磨杆' : '两指按住 · 磨杆';
    const [px, py, pz] = project(tg.x, tg.y + 0.25, tg.z);
    if (pz < 1) {
      // 提示框不要出屏幕：左右各留 8px，上面避开顶部按钮
      const el = $('railTip'); show('railTip', true);
      const w = el.offsetWidth || 120, h = el.offsetHeight || 26;
      const x = clamp(px, w / 2 + 8, innerWidth - w / 2 - 8), y = clamp(py, h + 64, innerHeight - 40);
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    } else show('railTip', false);
  } else show('railTip', false);
}
function setCfg(k, i) {
  cfg = { ...cfg, [k]: i }; store.set('board', cfg);
  scene.remove(board.root); disposeBoard(board); board = makeBoard(cfg); scene.add(board.root);
  online.force = true;
}
let myName = store.get('name', ''), myRoom = store.get('room', '大厅');
const myId = rnd(10); // 10 位小写字母数字（国内联机的数据库要求 8～24 位）
const renderQ = new Quaternion(), tmpQ = new Quaternion(), UP = new Vector3(0, 1, 0);
let mode = 'free', state = 'menu', timeLeft = 0, trickSeq = 0, lastTrick = null;

const combo = new Combo({
  onChange: (c) => setCombo(c),
  onBank: (pts, mult, names) => {
    toast('+' + fmt(pts) + (mult > 1 ? '<small>' + mult + ' 个招式 ×' + mult + '</small>' : ''), '#ffd23f', 1300);
    Aud.bank(mult); logCombo(names, pts);
    if (pts >= 3000) completeChal('combo');
    if (mult >= 5) completeChal('combo5');
    lastTrick = [++trickSeq, names.slice(-2).join(' + '), pts];
    online.force = true;
  },
  onLose: () => Aud.lose(),
});
const sk = new Skater(T, {
  onPop: () => { Aud.pop(); feelHit(0.28, 0.1, 0); },
  onFlick: () => Aud.flick(),
  onCatch: () => Aud.catch(),
  onLand: (info) => {
    Aud.land(info.impact, info.quality); fx.land(sk.p, info.impact);
    feelHit(0.2 + 0.075 * info.impact, -(0.22 + 0.085 * info.impact), Math.max(0, info.impact - 4.5) * 0.004 + (info.quality === 'sketchy' ? 0.004 : 0));
    feel.wobV += (Math.sign(sk.slip) || (info.spin >= 0 ? 1 : -1)) * Math.min(2.4, 0.12 * info.impact + (info.quality === 'sketchy' ? 1.3 : info.quality === 'clean' ? 0 : 0.4));
    const tr = airTrick(info);
    if (tr) { combo.add(tr.name, tr.pts); fx.trick(tr.name + '  +' + tr.pts, info.quality === 'clean' ? '#7dff9b' : '#fff'); }
    else if (info.quality === 'sketchy') fx.trick('落地不稳', '#ffb36b');
    checkLandChal(info, tr);
    practice.land(info);
    sk8.attempt(tr ? tr.name : null, false);
  },
  onBail: (why) => {
    Aud.bail(); fx.bail(sk.p); feelHit(0, -0.3, 0.012);
    const msg = { catch: '没接住板！<small>拨完以后，落地前把手指重新放回板上（黄圈提示）</small>',
      flipShort: '板子没翻够！<small>拨快一点，或者晚一点接板</small>', flipOver: '板子翻过头了！<small>拨轻一点，或者早一点接板</small>',
      shoveShort: '板子没转够！<small>侧划快一点，或者晚一点接板</small>', shoveOver: '板子转过头了！<small>侧划轻一点，或者早一点接板</small>',
      angle: '落地太歪了！', hard: '摔太狠了！', wall: '撞墙了！' }[why] || '摔了！';
    toast(msg, '#ff6b5f', 1500);
    combo.lose();
    sk8.attempt(null, true);
  },
  onGrind: (on, g) => {
    if (on) { if (g.locked) store.set('lockN', store.get('lockN', 0) + 1); Aud.grindOn(); feelHit(0.22, -0.12, 0.003); combo.startLive(g.name, GRIND_RATE[g.name] || 150, 'grind'); fx.trick(g.name, '#ffd23f'); if (g.type === 'slide') completeChal('slide'); }
    else { combo.endLive(); if (g.name === '50-50' && g.t >= 2) completeChal('grind'); practice.grind(g.t); }
  },
  onManual: (on, kind, t) => {
    if (on) combo.startLive(kind === 'nose' ? 'Nose Manual' : 'Manual', kind === 'nose' ? 130 : 100, 'manual');
    else { if (t < 0.35) combo.cancelLive(); else combo.endLive(); if (t >= 3) completeChal('manual'); practice.manual(t); }
  },
  onSlide: (on, sl) => {
    if (on) { Aud.skid(); return; }
    if (sl.v0 > 2) { const n = (sl.dir > 0 ? 'FS' : 'BS') + ' Powerslide'; combo.add(n, 80); fx.trick(n, '#ffb36b'); completeChal('powerslide'); }
  },
  onImpact: (v) => { Aud.impact(v); feelHit(0.1, -0.08, Math.min(0.02, v * 0.004)); },
  // Kickturn：转够约 60° 才算招式
  onKick: (a) => {
    const n = a > 5.4 ? '360 Kickturn' : a > 2.6 ? '180 Kickturn' : 'Kickturn';
    combo.add(n, a > 5.4 ? 120 : a > 2.6 ? 60 : 30); fx.trick(n, '#9fe8ff'); Aud.kick();
    store.set('kickTipN', 9); // 会用了，以后不再提示
  },
  onRespawn: () => {},
});
sk.reset(T.spawn.x, T.spawn.z, T.spawn.yaw);
function checkLandChal(info, tr) {
  const n = tr ? tr.name : '', M = T.marks;
  if (info.air.popped) completeChal('ollie');
  if (info.air.popped && info.height >= 0.7) completeChal('high');
  if (/(^|\s)Kickflip/.test(n) && !/Varial|Double|Triple/.test(n)) completeChal('kick');
  if (/(^|\s)Heelflip/.test(n) && !/Varial|Inward|Double|Triple/.test(n)) completeChal('heel');
  if (/Pop Shove-it/.test(n)) completeChal('shove');
  if (/Varial Kickflip/.test(n)) completeChal('varial');
  if (/(^|\s)360 Flip/.test(n)) completeChal('tre');
  if (/Nollie/.test(n)) completeChal('nollie');
  if (Math.abs(info.spin) >= Math.PI * 2 - 0.65) completeChal('spin');
  if (info.air.fromTrans && info.air.lipY > M.bigQP && info.above >= 1.2) completeChal('vert');
  const S = M.stairs;
  if (info.air.popped && info.air.y0 > S.top && info.y < 0.05 && sk.p.z > S.zMin && sk.p.x > S.x0 && sk.p.x < S.x1) completeChal('stairs');
}

/* ---------------- 特效 / 练习 / 回放 ---------------- */
const fx = new FX(scene);
const practice = new Practice({
  teleport: () => {
    const R = T.rails.find((r) => r.flat && r.kind === 'rail');
    if (!R) return;
    const dx = R.bx - R.ax, dz = R.bz - R.az, L = Math.hypot(dx, dz);
    combo.clear(); sk.reset(R.ax - (dx / L) * 7, R.az - (dz / L) * 7, Math.atan2(dx, dz)); sk.s = 4.2; camInit = false;
  },
  good: () => { Aud.done(); },
  finish: () => { completeChal('practice'); store.set('pracDone', true); },
});
const rec = new Recorder();
let player = null;

/* ---------------- 输入 ---------------- */
const dotEls = new Map();
const input = new Input(canvas, {
  easy: () => settings.easy, sens,
  // 手指按到板上：板面被轻轻压下去一点（触感反馈）
  onTouch: (ghost) => { Aud.resume(); show('emobar', false); if (!ghost && state === 'play' && sk.mode === 'ground') feel.compV += 0.12; },
  onDots: (ptrs) => {
    const box = $('dots');
    for (const [id, el] of dotEls) if (!ptrs.has(id)) { el.remove(); dotEls.delete(id); }
    if (!settings.dots) return;
    for (const p of ptrs.values()) {
      let el = dotEls.get(p.id);
      if (!el) { el = document.createElement('div'); el.className = 'dot'; box.appendChild(el); dotEls.set(p.id, el); }
      el.style.transform = `translate(${p.x}px,${p.y}px)`;
      el.className = 'dot' + (p.ghost ? ' ghost' : !p.on ? ' off' : p.role === 'back' ? ' back' : '');
    }
  },
});

/* ---------------- 联机 + 对战 ---------------- */
const sk8 = new Sk8({
  myId: () => myId, myName: () => myName, players: () => online.players(),
  send: (ev, p, f) => online.send(ev, p, f), toast: (t) => toast(esc(t), '#fff', 1600),
  ui: (v) => { renderSk8(v); bindSk8(); },
  win: () => { completeChal('skatewin'); Aud.done(); },
});
const online = new Online({
  url: SUPABASE_URL, key: SUPABASE_KEY, scene, myId, fx, sk, sk8,
  getName: () => myName, getCfg: () => cfg, getScore: () => combo.total, getTrick: () => lastTrick,
  toast: (h) => toast(h, '#fff', 1200),
  onStatus: (s, x) => setNet(s, x), onList: () => roomInfo(),
});
// mode：'' 正常 / 'cn' 国内模式（实时通道连不上，改用数据库牵线 + 玩家直连）/ 'slow' 正在用数据库中转
function setNet(s, mode) {
  const n = $('net');
  const base = (MAPS.find((m) => m.id === mapId) || {}).name + ' · 房间 ' + myRoom + (online.remotes.size ? ' · ' + (online.remotes.size + 1) + ' 人' : '');
  if (s === 'online') n.textContent = (mode === 'cn' ? '● 联机中（国内模式）· ' : '● 联机中 · ') + base + (mode === 'slow' ? ' · 网络受限，可能有延迟' : '');
  else if (s === 'connecting') n.textContent = '○ 连接中…';
  else if (s === 'full') n.textContent = '✕ 房间「' + myRoom + '」满了（最多 6 人），换个房间号';
  else if (s === 'nosql') n.textContent = '○ 连接中…（国内网络联机要先在 games 项目运行一次 SQL）';
  else n.textContent = '○ 已断开，正在重连…';
  roomInfo();
}
function roomInfo() {
  const el = $('roomInfo');
  if (!online.enabled) { el.textContent = '单人模式'; return; }
  if (online.status === 'full') { el.textContent = '房间「' + myRoom + '」满了（最多 6 人），换个房间号'; return; }
  if (online.status !== 'online') { el.textContent = online.status === 'nosql' ? '正在连接房间…（国内网络联机要先运行一次 SQL）' : '正在连接房间…'; return; }
  const names = online.memberNames();
  el.textContent = (names.length ? '房间「' + myRoom + '」在线：' + names.slice(0, 6).join('、') + (names.length > 6 ? ' 等 ' + names.length + ' 人' : '') : '房间「' + myRoom + '」现在没有别人') + (online.mode === 'cn' ? '（国内模式）' : '');
}
function bindSk8() {
  const c = $('sk8Close'); if (c) c.onclick = () => { sk8.state = null; sk8.ui(); };
  const s = $('sk8Stop'); if (s) s.onclick = () => sk8.cancel();
}
$('invYes').onclick = () => sk8.join(); $('invNo').onclick = () => sk8.decline();
$('lobbyGo').onclick = () => sk8.start(); $('lobbyNo').onclick = () => sk8.cancel();

/* ---------------- 手感反馈（只影响画面）：落地时板面下沉回弹、镜头跟着沉一下 / 轻震 ---------------- */
const feel = { comp: 0, compV: 0, dip: 0, dipV: 0, shake: 0, wob: 0, wobV: 0 };
function feelHit(compV, dipV, shake) { feel.compV += compV; feel.dipV += dipV; feel.shake = Math.max(feel.shake, shake); }
function feelStep(dt) {
  for (let left = dt; left > 1e-6; left -= 1 / 120) {
    const h = Math.min(left, 1 / 120);
    // 桥胶：硬、有一点弹（comp > 0 = 板面往下压）
    feel.compV += (-1400 * feel.comp - 26 * feel.compV) * h; feel.comp += feel.compV * h;
    if (feel.comp > 0.016) { feel.comp = 0.016; if (feel.compV > 0) feel.compV *= -0.3; }
    if (feel.comp < -0.005) { feel.comp = -0.005; if (feel.compV < 0) feel.compV = 0; }
    // 镜头：软一点，沉下去再回来（dip < 0 = 往下）
    feel.dipV += (-170 * feel.dip - 14 * feel.dipV) * h; feel.dip += feel.dipV * h;
    feel.dip = clamp(feel.dip, -0.12, 0.08);
    // 落地后板面左右晃两下（只是画面，不影响方向）
    feel.wobV += (-480 * feel.wob - 9 * feel.wobV) * h; feel.wob += feel.wobV * h;
  }
  feel.shake *= Math.exp(-10 * dt); if (feel.shake < 1e-4) feel.shake = 0;
}
function feelReset() { feel.comp = feel.compV = feel.dip = feel.dipV = feel.shake = feel.wob = feel.wobV = 0; }
// 水泥地每 4 米一条伸缩缝：前后轮压过去时「咔哒、咔哒」两声
const jCell = [null, null], jPos = [0, 0];
function joints() {
  const h = sk.heading, fx = Math.sin(h), fz = Math.cos(h);
  const flat = sk.mode === 'ground' && (!sk.feat || sk.feat.name === 'platform') && sk.s > 0.5;
  const jump = Math.hypot(sk.p.x - jPos[0], sk.p.z - jPos[1]) > 1; jPos[0] = sk.p.x; jPos[1] = sk.p.z;
  for (let k = 0; k < 2; k++) {
    const d = k ? DECK.truckZ : -DECK.truckZ, x = sk.p.x + fx * d, z = sk.p.z + fz * d;
    const c = Math.floor(x / 4) * 1000 + Math.floor(z / 4);
    if (jCell[k] !== null && c !== jCell[k] && flat && !jump) { Aud.clack(sk.s); feel.compV += 0.05 + 0.012 * Math.min(8, sk.s); feel.dipV -= 0.015; } // 板面跟着轻轻一顿
    jCell[k] = c;
  }
}
// 板面侧倾（画面）：物理侧倾放大一点更看得出来；Fakie 时板头朝后，方向相反
function visRoll() {
  const fk = sk.mode === 'air' ? !!(sk.air && sk.air.fakie) : sk.fakie;
  return (sk.roll * 1.25 + feel.wob) * (fk ? -1 : 1);
}

// 停着压板转不动时（新的压板转向停下来不会转），前几次提示 Kickturn 怎么用
const kickTip = { t: 0, on: false, hide: 0 };
function kickTipFrame(dt, I) {
  if (kickTip.on) {
    kickTip.hide -= dt;
    if (kickTip.hide <= 0 || sk.kickAcc > 0.5) { kickTip.on = false; setHint(''); store.set('kickTipN', store.get('kickTipN', 0) + 1); }
    return;
  }
  if (mode === 'practice' || store.get('kickTipN', 0) >= 3) return;
  const stuck = sk.mode === 'ground' && sk.s < 0.4 && I && I.fingers >= 1 && Math.abs(I.lean) > 0.5;
  kickTip.t = stuck ? kickTip.t + dt : 0;
  if (kickTip.t > 0.8) { kickTip.on = true; kickTip.t = 0; kickTip.hide = 4.5; setHint('停着压板不会转：一指按住板尾，另一指往旁边拨 = 原地转'); }
}

/* ---------------- 相机 ---------------- */
let camInit = false, camYaw = 0, orbitA = 0, camAir = null, camAirVert = false;
let camBlend = 0;
const camPos = new Vector3(), look = new Vector3(), tmpV = new Vector3(), tmpV2 = new Vector3(), projV = new Vector3(), tmpP = new Vector3();
function project(x, y, z) {
  projV.set(x, y, z).project(cam);
  return [(projV.x * 0.5 + 0.5) * innerWidth, (1 - (projV.y * 0.5 + 0.5)) * innerHeight, projV.z];
}
function previewPose(dt) {
  // 菜单 / 改装：板子在出生点上方慢慢转
  orbitA += dt * 0.7;
  const sp = T.spawn, h = T.height(sp.x, sp.z);
  tmpV.set(sp.x, h + 0.55, sp.z);
  renderQ.setFromAxisAngle(tmpV2.set(0, 1, 0), orbitA).multiply(new Quaternion().setFromAxisAngle(tmpV2.set(0, 0, 1), 1.15));
  poseBoard(board, tmpV, renderQ, 0, -DECK.truckZ, 0, 0, orbitA * 3);
  const portrait = cam.aspect < 1, d = portrait ? 1.75 : 1.35;
  if (cam.fov !== baseFov) { cam.fov = baseFov; cam.updateProjectionMatrix(); } // 滑快时视野加宽过，回菜单恢复
  cam.position.set(sp.x - Math.sin(sp.yaw) * d, h + 0.85, sp.z - Math.cos(sp.yaw) * d);
  cam.lookAt(sp.x, h + (portrait ? -0.35 : 0.3), sp.z);
  return tmpV;
}
function updateCamera(dt, P, travel, opts) {
  const portrait = cam.aspect < 1, grind = sk.mode === 'grind';
  // 镜头像 Touchgrind 一样贴着板子、压低：板子在屏幕上又大又长（板尾在屏幕下方 88% 左右，板头在中间），远处的地平线在上面 1/4
  const dist = (portrait ? 0.86 : 0.9) + (grind ? 0.25 : 0), hgt = (portrait ? 0.66 : 0.58) + (grind ? 0.1 : 0);
  const sp = sk.speed();
  // 只有从坡上“几乎竖直”飞出去才算 vert；跳台（30° 小坡）这种往前飞的按普通腾空处理
  if (!opts && sk.mode === 'air' && sk.air !== camAir) { camAir = sk.air; camAirVert = !!(sk.air && sk.air.fromTrans) && sk.v.y > 1.2 * Math.hypot(sk.v.x, sk.v.z); }
  const vertAir = !opts && sk.mode === 'air' && !!sk.air && camAirVert;
  const flatAir = !opts && sk.mode === 'air' && !vertAir;
  let want = travel;
  if (!opts && sk.mode === 'ground' && sk.s < 0.3) want = Math.atan2(sk.fwd.x, sk.fwd.z) + (sk.fakie ? Math.PI : 0);
  if ((!opts && sk.mode === 'bail') || vertAir || !isFinite(want)) want = camYaw;
  if (!camInit) camYaw = want;
  // 地面上镜头朝向紧跟板子：转弯时板子在屏幕上基本不歪、不跑，手指不会从板子上溜出去
  // Kickturn 时镜头慢慢跟：板子在屏幕上跟着手指转（手指不会滑出板子），松手后镜头再转过来
  const kicking = !opts && sk.mode === 'ground' && sk.kickT > 0 && sk.kickAcc > 0.05;
  const rate = !opts && sk.mode === 'air' ? 2.2 : grind ? 6 : opts ? 7 : kicking ? 0 : sk.mode === 'ground' && sk.s < 1 ? 4 + sk.s * 7 : 11;
  camYaw += angDiff(want, camYaw) * damp(rate, dt);
  const fx_ = Math.sin(camYaw), fz = Math.cos(camYaw);
  const tgt = tmpV.copy(P); tgt.y += 0.08;
  const d = dist + Math.min(0.12, sp * 0.015);
  const cx = tgt.x - fx_ * d, cz = tgt.z - fz * d;
  const gh = T.height(cx, cz), rise = tgt.y - gh;
  // 普通腾空：镜头跟住板子 85% 的高度、跟得更快，板子在屏幕上的位置和大小基本不变，手指不用追着按
  let cy = gh + hgt + (rise > 0 ? rise * (vertAir ? 0.35 : flatAir ? 0.85 : 0.55) : rise * 0.8);
  cy = Math.max(cy, gh + 0.3);
  // 平滑的是「镜头相对板子的偏移」而不是绝对位置：滑得再快镜头也不会落在后面，板子在屏幕上大小基本不变
  // 镜头始终在板子正后方（朝向本身已经平滑过）：滑得再快也不会落在后面，转弯时板子也不会在屏幕上横着跑
  if (!camInit) { camPos.set(cx, cy, cz); camInit = true; }
  if (!opts && sk.mode === 'bail') { camPos.x += (cx - camPos.x) * damp(10, dt); camPos.z += (cz - camPos.z) * damp(10, dt); } // 摔倒时板子乱滚，镜头稍微平滑一点不跟着抖
  else if (kicking) camBlend = 1; // Kickturn：镜头不动，板子在屏幕上绕着按住的那头转，手指一直在板子上；松手后镜头再慢慢转过来
  else if (camBlend > 0) { camBlend = Math.max(0, camBlend - dt * 1.6); const k = damp(7, dt); camPos.x += (cx - camPos.x) * k; camPos.z += (cz - camPos.z) * k; if (!camBlend) { camPos.x = cx; camPos.z = cz; } }
  else { camPos.x = cx; camPos.z = cz; }
  camPos.y += (cy - camPos.y) * damp(flatAir ? 16 : 7, dt);
  cam.position.copy(camPos);
  if (!opts) {
    cam.position.y += feel.dip;
    if (feel.shake) { const t = performance.now() / 1000; cam.position.x += Math.sin(t * 83) * feel.shake; cam.position.y += Math.sin(t * 97 + 1) * feel.shake; cam.position.z += Math.sin(t * 71 + 2) * feel.shake; }
  }
  if (vertAir) look.set(tgt.x + fx_ * 0.25, tgt.y + 0.08, tgt.z + fz * 0.25);
  else { const la = portrait ? 0.67 : 0.4; look.set(tgt.x + fx_ * la, tgt.y - 0.02, tgt.z + fz * la); } // 横屏少看远一点，板子不会贴着屏幕底边
  cam.lookAt(look);
  // 压板转弯时镜头跟着往弯里稍微歪一点（很小，板子自己的倾斜仍然看得清）
  if (!opts && sk.mode !== 'bail') cam.rotateZ(-0.22 * sk.roll);
  // 滑得快时视野稍微变宽，更有速度感
  const fov = baseFov + (opts ? 0 : Math.min(4, Math.max(0, sp - 2.5) * 0.8));
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * damp(4, dt); cam.updateProjectionMatrix(); }
}
// 板子在屏幕上的位置（给输入判断“手指是不是按在板上”）
const gA = new Vector3(), gB = new Vector3(), gC = new Vector3();
function boardGeo() {
  gA.set(0, 0.085, 0.4).applyQuaternion(renderQ).add(sk.p); gB.set(0, 0.085, -0.4).applyQuaternion(renderQ).add(sk.p); gC.set(0.105, 0.085, 0).applyQuaternion(renderQ).add(sk.p);
  const a = project(gA.x, gA.y, gA.z), b = project(gB.x, gB.y, gB.z), c = project(gC.x, gC.y, gC.z);
  if (a[2] > 1 || b[2] > 1) return null;
  const [r, f] = a[1] >= b[1] ? [a, b] : [b, a];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  return { rx: r[0], ry: r[1], fx: f[0], fy: f[1], halfW: Math.max(12, Math.hypot(c[0] - mx, c[1] - my)), cx: mx, cy: my };
}

/* ---------------- 流程 ---------------- */
const PANELS = ['menu', 'pause', 'settings', 'help', 'chal', 'result', 'lb', 'garage'];
let panelBack = 'menu';
function hideAll() { for (const id of PANELS) show(id, false); }
function readInputs() {
  myName = ($('inName').value.trim() || store.get('name', '') || '滑手' + Math.floor(100 + Math.random() * 900)).slice(0, 10);
  myRoom = ($('inRoom').value.trim() || '大厅').slice(0, 16);
  $('inName').value = myName; $('inRoom').value = myRoom;
  store.set('name', myName); store.set('room', myRoom);
}
function startGame(m) {
  mode = m; readInputs();
  Aud.sfx = settings.sfx; Aud.music = settings.music;
  Aud.init(); Aud.resume(); Aud.setSfx(settings.sfx); Aud.setMusic(settings.music);
  combo.clear(); combo.total = 0; setCombo(null); clearLog(); lastTrick = null; rec.clear(); fx.clear();
  sk.reset(T.spawn.x, T.spawn.z, T.spawn.yaw); sk.safe = { ...T.spawn }; renderQ.copy(sk.qv);
  camInit = false; feelReset(); kickTip.on = false; kickTip.t = 0;
  timeLeft = mode === 'timed' ? 100 : 0; show('timer', mode === 'timed'); // 限时赛 100 秒（和 Touchgrind Skate 2 一样，用户定的）
  hideAll(); show('hud', true); show('rp', false); show('rpTag', false);
  state = 'play'; input.enabled = true; input.clear();
  online.connect(myRoom, mapId); online.setPlaying(true);
  if (mode === 'practice') practice.start(); else practice.stop();
  setHint(mode === 'free' && !store.get('pracDone', false) && !chalDone.size ? '第一次玩？回主菜单点「练习」，一步步教你' : '');
  if (mode !== 'practice') setTimeout(() => setHint(''), 6000);
  qTipReset(4);
}
/* 卡顿提示：只提醒，不替玩家改画质 */
const qTip = { t: 0, n: 0, wait: 4, done: false, hideT: 0 };
function qTipReset(wait) { qTip.t = 0; qTip.n = 0; qTip.wait = wait; }
function qTipHide() { show('qTip', false); clearTimeout(qTip.hideT); }
function qTipFrame(dt) { // dt = 真实帧间隔（不截断，帧率才算得准）
  if (qTip.done || !$('qTip').classList.contains('hide')) return;
  if (dt > 0.5) return; // 切到后台再回来、偶尔一次的长卡顿：这一帧不算
  if (qTip.wait > 0) { qTip.wait -= dt; return; } // 刚开局 / 刚换画质时的卡顿不算
  qTip.t += dt; qTip.n++;
  if (qTip.t < 5) return;
  const fps = qTip.n / qTip.t; qTipReset(0);
  if (fps >= 40) return;
  // 练习、对战、表情面板开着时先不打扰，过一会儿再看
  if (['prac', 'sk8', 'inv', 'lobby', 'emobar'].some((id) => !$(id).classList.contains('hide'))) return;
  // iPhone 低电量模式会把网页锁在 30 帧，这时调低画质也没用
  const near30 = fps > 26 && fps < 33;
  if (qLevel === 0 && !near30) return;
  $('qTipT').textContent = near30 ? '只有约 30 帧：低电量模式会限帧' + (qLevel > 0 ? '，也可以调低画质' : '') : '画面有点卡（约 ' + Math.round(fps) + ' 帧）';
  show('qTipDown', qLevel > 0); show('qTip', true);
  clearTimeout(qTip.hideT); qTip.hideT = setTimeout(() => { qTipHide(); qTip.done = true; }, 10000);
}
$('qTipDown').onclick = () => {
  settings.q = qLevel = Math.max(0, qLevel - 1); saveSettings(); applyQuality(); refreshSetting('q'); Aud.click();
  $('qTipT').textContent = '已调到「' + Q_NAME[qLevel] + '」，设置里随时可以改'; show('qTipDown', false);
  clearTimeout(qTip.hideT); qTip.hideT = setTimeout(qTipHide, 2500);
  qTipReset(15); // 15 秒后再看一次，还卡才再提醒
};
$('qTipX').onclick = () => { qTipHide(); qTip.done = true; Aud.click(); }; // 关掉后这次打开不再提醒
function pause(on) {
  if (on && state === 'play') { state = 'pause'; input.enabled = false; input.clear(); show('pause', true); show('emobar', false); }
  else if (!on && state === 'pause') { state = 'play'; input.enabled = true; show('pause', false); }
}
function toMenu() {
  state = 'menu'; input.enabled = false; input.clear();
  hideAll(); show('hud', false); show('rp', false); show('rpTag', false); show('menu', true); setHint('');
  practice.stop(); online.setPlaying(false); sk8.cancel(); refreshChal(); roomInfo();
  for (const el of dotEls.values()) el.remove(); dotEls.clear();
}
function openPanel(id) {
  panelBack = PANELS.find((p) => !$(p).classList.contains('hide') && p !== id) || (state === 'play' ? 'play' : 'menu');
  if (state === 'play') { state = 'pause'; input.enabled = false; input.clear(); panelBack = 'play'; }
  hideAll(); show(id, true);
}
function closePanel(id) {
  show(id, false);
  if (panelBack === 'play') { state = 'play'; input.enabled = true; }
  else show(panelBack, true);
}
function openGarage() {
  state = 'garage'; hideAll(); show('garage', true);
  let tab = 'deck';
  const draw = () => buildGarage(cfg, tab, (k, i) => { setCfg(k, i); draw(); });
  [...$('gTabs').children].forEach((s) => (s.onclick = () => { tab = s.dataset.k; draw(); Aud.click(); }));
  draw();
}
let lbMap = 'yard';
async function openBoard(back) {
  openPanel('lb'); if (back) panelBack = back;
  lbMap = mapId;
  const load = async () => {
    buildMapChips($('lbMaps'), lbMap, (id) => { lbMap = id; load(); });
    renderBoard(null);
    if (!online.enabled) { renderBoard({ error: 'off' }); return; }
    const res = await topScores(SUPABASE_URL, SUPABASE_KEY, lbMap);
    if (!$('lb').classList.contains('hide')) renderBoard(res, myName);
  };
  load();
}
function endTimed() {
  if (combo.active && sk.mode !== 'bail') combo.bank();
  state = 'result'; input.enabled = false; input.clear(); setHint('');
  const sc = combo.total, key = 'best_' + mapId, best = Math.max(store.get(key, 0), sc); store.set(key, best);
  $('rScore').textContent = fmt(sc); $('rBest').textContent = sc >= best && sc > 0 ? '新纪录！' : '本机最高分 ' + fmt(best);
  $('rRank').textContent = '';
  if (sc >= 15000) completeChal('timed');
  if (online.enabled && sc > 0) {
    $('rRank').textContent = '正在上传成绩…';
    submitScore(SUPABASE_URL, SUPABASE_KEY, myName, sc, mapId).then((r) => {
      if (r.missing) $('rRank').textContent = '排行榜还没开通（需要运行一次 SQL）';
      else if (r.data && r.data.ok) {
        const d = r.data;
        $('rRank').textContent = d.best === undefined ? '全服第 ' + d.rank + ' 名'
          : d.pb ? '个人新纪录！全服第 ' + d.rank + ' 名'
          : '本局第 ' + d.rank + ' 名 · 你的最好 ' + fmt(d.best) + '（第 ' + d.best_rank + ' 名）';
      }
      else if (r.data && r.data.reason === 'too_fast') $('rRank').textContent = '提交太快了，这次没上榜';
      else $('rRank').textContent = '成绩上传失败';
    });
  }
  show('result', true);
}
function startReplay() {
  if (rec.buf.length < 30) { toast('还没有可以回放的内容', '#fff', 1200); return; }
  player = new Player(rec.buf); state = 'replay';
  hideAll(); show('rp', true); show('rpTag', true); show('hud', false);
  $('rpPlay').textContent = '暂停'; $('rpSpd').textContent = '1×'; $('rpCam').textContent = '跟随';
  player.t = Math.max(0, player.dur - 6); camInit = false;
}
function exitReplay() { player = null; show('rp', false); show('rpTag', false); show('hud', true); state = 'pause'; show('pause', true); camInit = false; }
$('rpPlay').onclick = () => { if (!player) return; if (!player.playing && player.t >= player.dur) player.t = 0; player.playing = !player.playing; $('rpPlay').textContent = player.playing ? '暂停' : '播放'; };
$('rpSpd').onclick = () => { if (!player) return; player.speed = player.speed === 1 ? 0.5 : player.speed === 0.5 ? 0.25 : 1; $('rpSpd').textContent = player.speed + '×'; };
$('rpCam').onclick = () => { if (!player) return; player.cam = (player.cam + 1) % 3; $('rpCam').textContent = ['跟随', '环绕', '侧面'][player.cam]; };
$('rpBar').oninput = () => { if (!player) return; player.t = (+$('rpBar').value / 1000) * player.dur; player.playing = false; $('rpPlay').textContent = '播放'; };
$('rpExit').onclick = () => exitReplay();

$('inName').value = myName; $('inRoom').value = myRoom;
$('inRoom').addEventListener('change', () => { readInputs(); online.connect(myRoom, mapId); roomInfo(); });
$('inName').addEventListener('change', () => readInputs());
buildMapChips($('maps'), mapId, (id) => loadMap(id));
$('mFree').onclick = () => startGame('free');
$('mTimed').onclick = () => startGame('timed');
$('mPrac').onclick = () => startGame('practice');
$('mChal').onclick = () => { refreshChal(); openPanel('chal'); };
$('mLb').onclick = () => openBoard();
$('mGarage').onclick = () => openGarage();
$('gDone').onclick = () => { state = 'menu'; hideAll(); show('menu', true); };
$('chGo').onclick = () => { show('chal', false); if (panelBack === 'menu') startGame('free'); else closePanel('chal'); };
$('chClose').onclick = () => closePanel('chal');
$('lbClose').onclick = () => closePanel('lb');
$('mSet').onclick = () => openPanel('settings'); $('pSet').onclick = () => openPanel('settings');
$('mHelp').onclick = () => openPanel('help'); $('pHelp').onclick = () => openPanel('help');
$('sClose').onclick = () => closePanel('settings'); $('hClose').onclick = () => closePanel('help');
$('bPause').onclick = () => { Aud.click(); pause(true); };
$('bReset').onclick = () => { if (state !== 'play') return; combo.lose(); sk.respawn(); camInit = false; Aud.click(); };
$('bEmo').onclick = () => { $('emobar').classList.toggle('hide'); };
[...$('emobar').children].forEach((s) => (s.onclick = () => { if (online.emoji(s.textContent)) Aud.click(); show('emobar', false); }));
$('pResume').onclick = () => pause(false);
$('pSpawn').onclick = () => { combo.lose(); sk.reset(T.spawn.x, T.spawn.z, T.spawn.yaw); camInit = false; pause(false); };
$('pReplay').onclick = () => startReplay();
$('pSk8').onclick = () => { pause(false); sk8.host(); };
$('pRestart').onclick = () => startGame(mode);
$('pMenu').onclick = () => toMenu();
$('rAgain').onclick = () => startGame('timed');
$('rLb').onclick = () => openBoard('result');
$('rMenu').onclick = () => toMenu();
$('pracSkip').onclick = () => { if (practice.on) practice.next(); };
$('mNote').textContent = online.enabled ? '联机已开启：同一张地图、同一个房间号的朋友会在一起' : '单人模式';
bindSettings((k) => {
  if (k === 'q') { qLevel = settings.q; applyQuality(); qTipHide(); qTipReset(4); }
  if (k === 'time') applyTime();
  if (k === 'music') { Aud.init(); Aud.setMusic(settings.music); }
  if (k === 'sfx') { Aud.init(); Aud.setSfx(settings.sfx); }
  if (k === 'dots' && !settings.dots) { for (const el of dotEls.values()) el.remove(); dotEls.clear(); }
});
refreshChal();
addEventListener('pagehide', () => online.setPlaying(false));
// 从后台缓存回来（iOS 切回 Safari 时可能这样）：如果还在游戏里，重新算在玩（不然别人看不到自己）
addEventListener('pageshow', (e) => { if (e.persisted && (state === 'play' || state === 'pause')) online.setPlaying(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(true); });

/* ---------------- 主循环 ---------------- */
const STEP = 1 / 240;
let acc = 0, last = performance.now(), hudT = 0, geo = null;
const rpOut = { p: new Vector3(), q: new Quaternion() };
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000, dt = clamp(rawDt, 0, 0.05); last = now;
  try {
    let I = null;
    if (state === 'play') {
      input.geo = geo;
      I = input.update(dt, sk.mode !== 'air');
      for (const e of input.drain()) {
        if (e.type === 'pop') sk.pop(e.kind, e.k);
        else if (e.type === 'flick') sk.flick(e.which, e.dir, e.k, e.t);
        else if (e.type === 'powerslide') { if (!sk.powerslide(e.dir)) { sk.flick('front', e.dir); sk.flick('back', e.dir); } }
        else if (e.type === 'reset') { combo.lose(); sk.respawn(); camInit = false; }
      }
      // 两指长按（键盘 G）：附近有能磨的就自动跳上去
      if (I.hold && !sk.hop && (sk.mode === 'ground' || sk.mode === 'air')) sk.lockGrind();
      acc += dt; let n = 0;
      const I2 = Object.assign({}, I);
      while (acc >= STEP && n < 24) { sk.step(STEP, I2); I2.push = 0; I2.twist = 0; I2.kick = 0; combo.tick(STEP, sk); acc -= STEP; n++; }
      if (sk.shoveBaked) { renderQ.multiply(tmpQ.setFromAxisAngle(UP, sk.shoveBaked)); sk.shoveBaked = 0; } // 转板落地：画面朝向一起转，不闪
      if (sk.baked) { renderQ.multiply(sk.bakeQ); sk.bakeQ.identity(); sk.baked = false; } // 摔倒时板子翻到一半：画面朝向一起转
      if (n >= 24) acc = 0;
      if (sk.mode === 'ground' && sk.s * 3.6 >= 20) completeChal('speed');
      if (sk.mode === 'grind' && sk.grind && sk.grind.r.handSlope) completeChal('hand');
      if (mode === 'timed') { timeLeft -= dt; $('timer').textContent = Math.max(0, Math.ceil(timeLeft)); if (timeLeft <= 0) endTimed(); }
      practice.update(dt, sk, I, geo);
      kickTipFrame(dt, I);
      sk8.tick();
      // 特效
      if (sk.mode === 'grind' && sk.grind) { const r = sk.grind.r, k = Math.sign(sk.grind.sp) || 1; fx.grind(sk.p, r.dx * k, r.dz * k, Math.abs(sk.grind.sp), dt, sk.grind.type === 'slide'); }
      if (sk.slide && sk.slide.ang && sk.s > 0.7) fx.slide(sk.p);
      qTipFrame(rawDt);
    } else if (state === 'pause' || state === 'result') sk8.tick();
    // 滑板姿态
    let P = sk.p, travel = sk.travelYaw(), pitch = sk.visPitch();
    if (state === 'menu' || state === 'garage') P = previewPose(dt);
    else if (state === 'replay' && player) {
      player.step(dt); player.sample(rpOut);
      renderQ.copy(rpOut.q); P = rpOut.p; pitch = rpOut.a;
      poseBoard(board, P, renderQ, pitch, pitch >= 0 ? -DECK.truckZ : DECK.truckZ, rpOut.f, rpOut.h, rpOut.w, rpOut.r, rpOut.r * 0.45, rpOut.c);
      travel = Math.hypot(rpOut.dx, rpOut.dz) > 0.05 ? Math.atan2(rpOut.dx, rpOut.dz) : camYaw;
      $('rpBar').value = Math.round((player.t / Math.max(0.01, player.dur)) * 1000);
      if (!player.playing && $('rpPlay').textContent !== '播放') $('rpPlay').textContent = '播放';
    } else {
      renderQ.slerp(sk.qv, damp(sk.mode === 'bail' ? 60 : sk.mode === 'grind' ? 22 : 32, dt));
      feelStep(dt);
      const vr = visRoll();
      const gl = sk.groundLift(); if (gl) { tmpP.copy(sk.p); tmpP.y += gl; }
      poseBoard(board, gl ? tmpP : sk.p, renderQ, pitch, pitch >= 0 ? -DECK.truckZ : DECK.truckZ, sk.flipA, sk.shoveA, sk.wheelRot, vr, vr * 0.45, feel.comp);
      if (state === 'play') rec.push(dt, sk, renderQ, pitch, sk.wheelRot, vr, feel.comp);
    }
    updateBlob(board.root.position, board.root.quaternion, state !== 'menu' && state !== 'garage');
    // 相机
    if (state === 'replay' && player && player.cam > 0) {
      orbitA += dt * 0.5;
      const r = player.cam === 1 ? 3.2 : 2.6, a = player.cam === 1 ? orbitA : camYaw + Math.PI / 2;
      cam.position.set(P.x + Math.sin(a) * r, P.y + (player.cam === 1 ? 1.3 : 0.6), P.z + Math.cos(a) * r);
      cam.lookAt(P.x, P.y + 0.15, P.z);
    } else if (state !== 'menu' && state !== 'garage') updateCamera(dt, P, travel, state === 'replay');
    // 阴影跟着板子
    const tx = 26 / (sun.shadow.mapSize.x || 2048), sx = Math.round(P.x / tx) * tx, sz = Math.round(P.z / tx) * tx;
    sun.target.position.set(sx, P.y, sz); sun.position.set(sx + SUN_DIR.x * 40, P.y + SUN_DIR.y * 40, sz + SUN_DIR.z * 40);
    const ext = state === 'menu' || state === 'garage' ? 6 : 13;
    if (sun.shadow.camera.right !== ext) { sun.shadow.camera.left = sun.shadow.camera.bottom = -ext; sun.shadow.camera.right = sun.shadow.camera.top = ext; sun.shadow.camera.updateProjectionMatrix(); }
    sky.position.copy(cam.position);
    // 输入用的板子位置 + 接板提示圈 + 脚位提示
    cam.updateMatrixWorld();
    geo = state === 'play' ? boardGeo() : null;
    showRailTarget(state === 'play' && sk.mode !== 'grind' && sk.mode !== 'bail' ? sk.railTarget() : null, now / 1000, I);
    let ring = null;
    if (state === 'play' && geo && sk.mode === 'air' && I && !settings.easy && sk.needsCatch(I)) {
      const R = Math.hypot(geo.fx - geo.rx, geo.fy - geo.ry) / 2 + 26;
      if (sk.air.flicked) { const h = sk.catchHint(); if (h > 0) ring = [geo.cx, geo.cy, R, h]; } // 拨过板：板子转到能接正的角度时亮
      else if (sk.v.y < 0) { const hb = sk.p.y - T.height(sk.p.x, sk.p.z); if (hb < 1.1) ring = [geo.cx, geo.cy, R, clamp(1 - hb / 1.1, 0, 1)]; }
    }
    const showSpots = state === 'play' && geo && settings.dots && I && I.touching === 0 && sk.mode === 'ground' && mode !== 'practice' && !store.get('pracDone', false) && chalDone.size < 2;
    show('spots', !!showSpots);
    if (showSpots) {
      const ux = geo.fx - geo.rx, uy = geo.fy - geo.ry;
      $('spotB').style.transform = `translate(${geo.rx + ux * 0.2}px,${geo.ry + uy * 0.2}px)`; $('spotF').style.transform = `translate(${geo.fx - ux * 0.2}px,${geo.fy - uy * 0.2}px)`;
    }
    const bp = project(P.x, P.y + 0.1, P.z);
    fx.frame(dt, { trails: state === 'play' ? input.trails : null, ring, board: bp, anchor: (a) => {
      if (a === 'me') return state === 'menu' || state === 'garage' ? null : [bp[0], bp[1] - 40];
      const r = online.remotes.get(a); return r && r.screen ? r.screen : null; } });
    online.update(dt, now, { cam, project, showTags: state === 'play' || state === 'pause' || state === 'replay', q: renderQ, pitch, roll: state === 'play' ? visRoll() : 0 });
    const surf = sk.mode === 'grind' && sk.grind && sk.grind.r ? (sk.grind.r.kind === 'ledge' ? 'ledge' : 'metal') : sk.feat && WOOD.has(sk.feat) ? 'wood' : 'conc';
    Aud.update(state === 'play' ? sk.speed() : 0, state === 'play' ? sk.mode : 'none', surf, sk.grind && sk.grind.type, state === 'play' ? Math.abs(sk.yawRate * sk.s) : 0, state === 'play' ? Math.abs(sk.slip) : 0);
    if (state === 'play') joints(); 
    hudT += dt;
    if (hudT > 0.08 && (state === 'play' || state === 'pause')) {
      hudT = 0;
      $('sc').textContent = fmt(combo.total);
      $('spd').textContent = Math.round(sk.speed() * 3.6);
      setMeter(!!sk.manual, sk.manA);
      if (online.remotes.size) {
        const arr = [['你', combo.total, 1]]; for (const r of online.remotes.values()) arr.push([r.R.name, r.R.score, 0]);
        arr.sort((a, b) => b[1] - a[1]);
        $('plist').innerHTML = arr.slice(0, 8).map((a) => (a[2] ? '<b>' : '') + esc(a[0]) + ' ' + fmt(a[1]) + (a[2] ? '</b>' : '')).join('<br>');
      } else $('plist').innerHTML = '';
      setNet(online.status, online.mode);
      if (sk8.state && sk8.state.phase !== 'over') sk8.ui();
    }
    if (window.__camHook) window.__camHook(cam, P); // 测试用：近景检查模型
    if (!window.__noRender && glReady) renderer.render(scene, cam);
  } catch (e) { showErr(e && e.message ? e.message : String(e)); console.error(e); }
}
applyTime(); applyQuality();
online.connect(myRoom, mapId); roomInfo();
requestAnimationFrame(frame);
// 先让菜单（网页部分）显示出来，再编译 3D 画面的着色器：手机上编译要卡一下，放在菜单出来之后，看起来打开得更快
let glReady = false;
requestAnimationFrame(() => setTimeout(() => { try { renderer.compile(scene, cam); } catch (e) { console.error(e); } glReady = true; }, 0));
Aud.prep(1200); // 菜单出来以后趁空闲把音效算好，点开始时不用再等
window.__dbg = { __setTime: (v) => { timeLeft = v; }, renderer, mats, get sk() { return sk; }, get T() { return T; }, input, combo, get remotes() { return online.remotes; }, online, cam, sk8, practice, rec, startGame, toMenu, loadMap, settings, renderQ, get board() { return board; }, scene, CHALLENGES, chalCount, lighting, get geo() { return geo; }, get state() { return state; }, fx, applyTime, qTip };
