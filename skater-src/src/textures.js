// 程序生成贴图（不需要任何图片文件）
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { rng } from './util.js';

// willReadFrequently：画布放在内存里（撒点要读写像素，放显卡里每次都要读回来，很慢）
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function tex(c, rep) {
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
// 撒小点（颗粒感）：直接改像素，比一个个 fillRect 快几十倍（手机上打开游戏更快）；随机数的取用顺序和以前一样，图案不变
function speckle(x, w, h, n, R, a, light) {
  const tf = x.getTransform ? x.getTransform() : { e: 0, f: 0 }, ox = Math.round(tf.e), oy = Math.round(tf.f);
  const img = x.getImageData(ox, oy, w, h), d = img.data, v = light ? 255 : 0;
  for (let i = 0; i < n; i++) {
    const al = a * R(), s = Math.max(1, Math.round(1 + R() * 2.2)), px = Math.floor(R() * w), py = Math.floor(R() * h);
    if (al <= 0) continue;
    const x1 = Math.min(w, px + s), y1 = Math.min(h, py + s);
    for (let yy = py; yy < y1; yy++) for (let xx = px; xx < x1; xx++) {
      const o = (yy * w + xx) * 4, da = d[o + 3] / 255, oa = al + da * (1 - al);
      if (oa <= 0) continue;
      const k = (da * (1 - al)) / oa, kv = (al * v) / oa;
      d[o] = d[o] * k + kv; d[o + 1] = d[o + 1] * k + kv; d[o + 2] = d[o + 2] * k + kv; d[o + 3] = oa * 255;
    }
  }
  x.putImageData(img, ox, oy);
}
function blotches(x, w, h, n, R, color, a, rmax) {
  for (let i = 0; i < n; i++) {
    const cx = R() * w, cy = R() * h, r = 20 + R() * rmax;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color.replace('A', (a * (0.4 + R() * 0.6)).toFixed(3))); g.addColorStop(1, color.replace('A', '0'));
    x.fillStyle = g;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { x.save(); x.translate(ox, oy); x.fillRect(cx - r, cy - r, r * 2, r * 2); x.restore(); }
  }
}
// 混凝土：每张贴图对应 4 米 × 4 米
export function concrete(seed, base, joints) {
  const S = 512, [c, x] = cv(S, S), R = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  blotches(x, S, S, 26, R, 'rgba(0,0,0,A)', 0.07, 120);
  blotches(x, S, S, 18, R, 'rgba(255,255,255,A)', 0.06, 100);
  speckle(x, S, S, 9000, R, 0.12, false);
  speckle(x, S, S, 6000, R, 0.10, true);
  // 细小裂纹
  x.strokeStyle = 'rgba(0,0,0,0.10)'; x.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let px = R() * S, py = R() * S; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 9; k++) { px += (R() - 0.5) * 40; py += (R() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  if (joints) { x.fillStyle = 'rgba(40,40,40,0.35)'; x.fillRect(0, 0, S, 3); x.fillRect(0, 0, 3, S); }
  return tex(c);
}
// 刷了漆的水泥（边沿 / 路沿 / Manual 台）：漆面 + 磨掉漆露出的水泥 + 磨杆留下的黑色蜡痕。每张 = 4 米
export function painted(color, seed) {
  const S = 512, [c, x] = cv(S, S), R = rng(seed || 31);
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  blotches(x, S, S, 22, R, 'rgba(0,0,0,A)', 0.08, 90);
  blotches(x, S, S, 16, R, 'rgba(255,255,255,A)', 0.07, 80);
  // 掉漆：露出灰色水泥
  for (let i = 0; i < 70; i++) {
    const cx = R() * S, cy = R() * S, n = 6 + Math.floor(R() * 6), r = 3 + R() * 14;
    x.fillStyle = `rgba(${150 + R() * 30},${148 + R() * 30},${142 + R() * 30},${0.55 + R() * 0.4})`;
    x.beginPath(); for (let k = 0; k <= n; k++) { const a = (k / n) * 6.283, rr = r * (0.5 + R() * 0.8); k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill();
  }
  // 磨杆蜡痕：沿着长边方向的深色擦痕
  for (let i = 0; i < 40; i++) {
    const y = R() * S, x0 = R() * S, L = 40 + R() * 200;
    const g = x.createLinearGradient(x0, 0, x0 + L, 0); g.addColorStop(0, 'rgba(20,20,22,0)'); g.addColorStop(0.5, `rgba(20,20,22,${0.15 + R() * 0.25})`); g.addColorStop(1, 'rgba(20,20,22,0)');
    x.fillStyle = g; x.fillRect(x0, y, L, 1 + R() * 3);
  }
  speckle(x, S, S, 7000, R, 0.12, false); speckle(x, S, S, 4000, R, 0.1, true);
  return tex(c);
}
// 刷漆的胶合板（跳箱 / 跳台）：漆面 + 木纹透出来 + 螺丝眼 + 磨掉漆的地方露木头。每张 = 4 米
export function paintedWood(color, seed) {
  const S = 512, [c, x] = cv(S, S), R = rng(seed || 41);
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(0,0,0,0.06)'; x.lineWidth = 2;
  for (let k = 0; k < 60; k++) { x.beginPath(); const oy = R() * S; for (let px = 0; px <= S; px += 8) x.lineTo(px, oy + Math.sin(px / 50 + k) * 5); x.stroke(); }
  blotches(x, S, S, 18, R, 'rgba(0,0,0,A)', 0.07, 80);
  for (let i = 0; i < 45; i++) { // 磨掉漆露出木头
    const cx = R() * S, cy = R() * S, w = 8 + R() * 40, h = 2 + R() * 7;
    x.fillStyle = `rgba(${170 + R() * 30},${130 + R() * 25},${85 + R() * 20},${0.5 + R() * 0.4})`; x.fillRect(cx, cy, w, h);
  }
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, S, 2); x.fillRect(0, S / 2, S, 2); x.fillRect(0, 0, 2, S); x.fillRect(S / 2, 0, 2, S);
  x.fillStyle = 'rgba(30,30,30,0.6)';
  for (let a = 0; a < 4; a++) for (let b2 = 0; b2 < 4; b2++) { x.beginPath(); x.arc(12 + a * 128, 12 + b2 * 128, 2.5, 0, 7); x.fill(); }
  speckle(x, S, S, 5000, R, 0.1, false);
  return tex(c);
}
// 杆子：镀铬 + 一段段黄漆（磨久了漆掉了露出金属）。沿杆子方向每 0.6 米一个循环
export function railStripes() {
  const W = 64, H = 256, [c, x] = cv(W, H), R = rng(23);
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#d9dde3'); g.addColorStop(0.5, '#f4f6f8'); g.addColorStop(1, '#c9cdd3');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#f0c22e'; x.fillRect(0, 0, W, H * 0.5);
  for (let i = 0; i < 260; i++) { // 漆面磨损、斑驳
    const px = R() * W, py = R() * H * 0.5, w = 1 + R() * 6, h = 1 + R() * 4;
    x.fillStyle = R() < 0.6 ? 'rgba(220,225,230,0.9)' : 'rgba(40,35,20,0.35)'; x.fillRect(px, py, w, h);
  }
  for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(80,80,85,0.25)'; x.fillRect(R() * W, H * 0.5 + R() * H * 0.5, 1 + R() * 3, 1); }
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, H * 0.5 - 1, W, 2); x.fillRect(0, H - 1, W, 1);
  return tex(c);
}
// 木板围栏：竖着的木条，每张 = 2 米 × 2 米
export function planks() {
  const S = 256, [c, x] = cv(S, S), R = rng(57);
  x.fillStyle = '#3b2a1c'; x.fillRect(0, 0, S, S);
  const n = 14, w = S / n;
  for (let i = 0; i < n; i++) {
    const l = 0.75 + R() * 0.35, base = [150 * l, 108 * l, 70 * l].map(Math.round);
    x.fillStyle = `rgb(${base})`; x.fillRect(i * w + 1, 0, w - 2.5, S);
    x.strokeStyle = 'rgba(60,35,15,0.35)'; x.lineWidth = 1;
    for (let k = 0; k < 4; k++) { x.beginPath(); const ox = i * w + 2 + R() * (w - 5); for (let y = 0; y <= S; y += 8) x.lineTo(ox + Math.sin(y / 30 + k + i) * 1.2, y); x.stroke(); }
    if (R() < 0.5) { x.fillStyle = 'rgba(50,30,15,0.5)'; x.beginPath(); x.ellipse(i * w + w / 2, R() * S, 2, 3.5, 0, 0, 7); x.fill(); }
  }
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, S * 0.18, S, 5); x.fillRect(0, S * 0.78, S, 5);
  speckle(x, S, S, 2500, R, 0.12, false);
  return tex(c);
}
export function plywood(seed) {
  const W = 512, [c, x] = cv(W, W), R = rng(seed);
  x.fillStyle = '#6b5f55'; x.fillRect(0, 0, W, W);
  blotches(x, W, W, 30, R, 'rgba(30,20,10,A)', 0.12, 90);
  speckle(x, W, W, 7000, R, 0.12, false);
  speckle(x, W, W, 4000, R, 0.07, true);
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, W, 2); x.fillRect(0, W / 2, W, 2);
  x.fillStyle = 'rgba(0,0,0,0.5)';
  for (const [a, b] of [[20, 20], [W - 20, 20], [20, W / 2 + 20], [W - 20, W / 2 + 20], [W / 2, 20], [W / 2, W / 2 + 20]]) { x.beginPath(); x.arc(a, b, 3, 0, 7); x.fill(); }
  return tex(c);
}
// 砂纸图案（板面）：贴图沿板长方向 0..1
export const GRIPS = [
  { name: '经典黑' }, { name: '黄条' }, { name: '灰色' }, { name: '格子' }, { name: '火焰' }, { name: '彩点' },
];
export function grip(i) {
  i = i || 0;
  const W = 256, H = 1024, [c, x] = cv(W, H), R = rng(5 + i);
  x.fillStyle = i === 2 ? '#5d5f63' : '#26272b'; x.fillRect(0, 0, W, H);
  if (i === 1) { x.fillStyle = '#e8b923'; x.fillRect(W * 0.42, 0, W * 0.16, H); }
  if (i === 3) { for (let a = 0; a < 4; a++) for (let b = 0; b < 16; b++) if ((a + b) % 2) { x.fillStyle = '#3c3e43'; x.fillRect(a * 64, b * 64, 64, 64); } }
  if (i === 4) {
    for (const end of [0, 1]) for (let k = 0; k < 7; k++) {
      x.fillStyle = ['#ff5a2b', '#ff9f1c', '#ffd23f'][k % 3];
      x.beginPath(); const bx = 16 + k * 34, by = end ? H : 0, hgt = 120 + R() * 140, sg = end ? -1 : 1;
      x.moveTo(bx - 20, by); x.quadraticCurveTo(bx - 28, by + sg * hgt * 0.6, bx, by + sg * hgt); x.quadraticCurveTo(bx + 28, by + sg * hgt * 0.6, bx + 20, by); x.fill();
    }
  }
  if (i === 5) for (let k = 0; k < 60; k++) { x.fillStyle = ['#ff5a4f', '#2fa8ff', '#45d483', '#ffd23f', '#b273ff'][k % 5]; x.beginPath(); x.arc(R() * W, R() * H, 6 + R() * 10, 0, 7); x.fill(); }
  // 砂纸颗粒：很细、很密、对比度低（以前颗粒太粗，近看像水泥）
  { const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let k = 0; k < 60000; k++) { const lt = R() < 0.5, al = (lt ? 0.07 : 0.16) * (0.4 + R()), o = (Math.floor(R() * H) * W + Math.floor(R() * W)) * 4, v = lt ? 255 : 0;
      d[o] += (v - d[o]) * al; d[o + 1] += (v - d[o + 1]) * al; d[o + 2] += (v - d[o + 2]) * al; }
    x.putImageData(img, 0, 0); }
  // 两头被鞋磨过、稍微发白
  for (const end of [0, 1]) { const g = x.createLinearGradient(0, end ? H : 0, 0, end ? H * 0.82 : H * 0.18); g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, end ? H * 0.82 : 0, W, H * 0.18); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4;
  return t;
}
// 轮子颜色：白、灰要一眼能分开（以前米白和白看起来一样）
export const WHEELS = ['#ffffff', '#7d848e', '#ffd23f', '#ff5a4f', '#2fa8ff', '#45d483', '#b273ff', '#151515'];
// 支架：金属度不要太高（太高时主要靠反射环境，环境暗就发黑），本身颜色要能被灯照出来
export const TRUCKS = [{ name: '银', c: 0xe4e8ef, m: 0.5, r: 0.26 }, { name: '黑', c: 0x232529, m: 0.35, r: 0.5 }, { name: '金', c: 0xe6be5c, m: 0.55, r: 0.28 }, { name: '红', c: 0xd94a3d, m: 0.45, r: 0.34 }, { name: '蓝', c: 0x3b7bd9, m: 0.45, r: 0.34 }];
export function tiles() {
  const S = 256, [c, x] = cv(S, S / 4), R = rng(9);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
    const l = 46 + R() * 10; x.fillStyle = `hsl(${196 + R() * 8},62%,${l}%)`; x.fillRect(i * 16, j * 16, 16, 16);
  }
  x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5;
  for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, 64); x.stroke(); }
  for (let j = 0; j <= 4; j++) { x.beginPath(); x.moveTo(0, j * 16); x.lineTo(256, j * 16); x.stroke(); }
  return tex(c);
}
export function grass() {
  const S = 256, [c, x] = cv(S, S), R = rng(3);
  x.fillStyle = '#5f8a3e'; x.fillRect(0, 0, S, S);
  blotches(x, S, S, 30, R, 'rgba(40,70,20,A)', 0.3, 60);
  blotches(x, S, S, 20, R, 'rgba(150,180,80,A)', 0.2, 50);
  for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '30,60,15' : '160,200,90'},${0.25 * R()})`; x.fillRect(R() * S, R() * S, 1, 2 + R() * 3); }
  return tex(c);
}
export function fence() {
  const S = 128, [c, x] = cv(S, S);
  x.clearRect(0, 0, S, S); x.strokeStyle = 'rgba(190,195,200,1)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(S, S); x.moveTo(S, 0); x.lineTo(0, S);
  x.moveTo(-S / 2, S / 2); x.lineTo(S / 2, -S / 2); x.moveTo(S / 2, S + S / 2); x.lineTo(S + S / 2, S / 2);
  x.moveTo(S / 2, -S / 2); x.lineTo(S + S / 2, S / 2); x.moveTo(-S / 2, S / 2); x.lineTo(S / 2, S + S / 2);
  x.stroke();
  return tex(c);
}
// 原创涂鸦：抽象色块 + 描边，不含任何真实文字或品牌
export function graffiti(seed, w, h) {
  const [c, x] = cv(w, h), R = rng(seed);
  x.fillStyle = '#8f8f8c'; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 4000, R, 0.12, false);
  const pal = ['#ff5a4f', '#ffd23f', '#2fa8ff', '#45d483', '#b273ff', '#ff8fd0', '#ff9f1c', '#00c2a8'];
  for (let i = 0; i < Math.round(w / 90); i++) {
    const cx = R() * w, cy = h * (0.25 + R() * 0.5), r = h * (0.18 + R() * 0.22), col = pal[Math.floor(R() * pal.length)];
    x.beginPath();
    const n = 7 + Math.floor(R() * 5);
    for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, rr = r * (0.65 + R() * 0.5); const px = cx + Math.cos(a) * rr * 1.5, py = cy + Math.sin(a) * rr; k ? x.quadraticCurveTo(cx + Math.cos(a - 0.3) * rr * 1.9, cy + Math.sin(a - 0.3) * rr * 1.2, px, py) : x.moveTo(px, py); }
    x.closePath(); x.fillStyle = col; x.fill(); x.lineWidth = 6; x.strokeStyle = '#151515'; x.stroke();
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.7)';
    x.beginPath(); x.arc(cx - r * 0.4, cy - r * 0.3, r * 0.18, 3.6, 5.2); x.stroke();
  }
  return tex(c);
}
export function windows(seed, base) {
  const W = 128, H = 256, [c, x] = cv(W, H), [c2, x2] = cv(W, H), R = rng(seed);
  x.fillStyle = base || '#9aa3ad'; x.fillRect(0, 0, W, H);
  x2.fillStyle = '#000'; x2.fillRect(0, 0, W, H);
  speckle(x, W, H, 1500, R, 0.08, false);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 6; i++) {
    const lit = R() < 0.3; x.fillStyle = lit ? '#dfe6ee' : `rgba(35,48,66,${0.75 + R() * 0.25})`;
    x.fillRect(6 + i * 20, 6 + j * 16, 13, 10);
    if (lit && R() < 0.8) { x2.fillStyle = R() < 0.5 ? '#ffd890' : '#fff1c9'; x2.fillRect(6 + i * 20, 6 + j * 16, 13, 10); }
  }
  const t = tex(c), e = tex(c2);
  return [t, e];
}
// 地面贴花图集：8 格（涂鸦圆、井盖、排水篦子、轮印、裂缝、污渍、黄线、箭头）
export const DECAL_CELLS = { paint: 0, manhole: 1, drain: 2, skid: 3, crack: 4, stain: 5, line: 6, arrow: 7 };
export function decalAtlas() {
  const [c, x] = cv(1024, 512), R = rng(42), S = 256;
  x.clearRect(0, 0, 1024, 512);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * S, Math.floor(i / 4) * S); x.beginPath(); x.rect(0, 0, S, S); x.clip(); fn(); x.restore(); };
  cell(0, () => { const g = ['#ff5a4f', '#ffd23f', '#2fa8ff', '#45d483']; for (let k = 0; k < 4; k++) { x.strokeStyle = g[k]; x.lineWidth = 16; x.globalAlpha = 0.8; x.beginPath(); x.arc(128, 128, 110 - k * 22, 0, 7); x.stroke(); }
    x.globalAlpha = 0.9; x.fillStyle = '#fff'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SK8', 128, 130); });
  cell(1, () => { x.fillStyle = '#3d3d3f'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill(); x.strokeStyle = '#59595c'; x.lineWidth = 6;
    for (let k = 1; k < 5; k++) { x.beginPath(); x.arc(128, 128, k * 24, 0, 7); x.stroke(); } for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); x.stroke(); } });
  cell(2, () => { x.fillStyle = '#2b2b2d'; x.fillRect(8, 60, 240, 136); x.fillStyle = '#111'; for (let k = 0; k < 11; k++) x.fillRect(20 + k * 21, 72, 10, 112); });
  cell(3, () => { for (let k = 0; k < 2; k++) { const y = 96 + k * 64; const g = x.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(20,20,20,0)'); g.addColorStop(0.3, 'rgba(20,20,20,0.55)'); g.addColorStop(1, 'rgba(20,20,20,0.1)'); x.fillStyle = g; x.fillRect(0, y, 256, 18); } });
  cell(4, () => { x.strokeStyle = 'rgba(30,30,30,0.55)'; x.lineWidth = 3; for (let k = 0; k < 3; k++) { let px = 20, py = 128 + (R() - 0.5) * 60; x.beginPath(); x.moveTo(px, py); while (px < 236) { px += 10 + R() * 18; py += (R() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); x.lineWidth = 1.5; } });
  cell(5, () => { for (let k = 0; k < 6; k++) { const cx = 70 + R() * 116, cy = 70 + R() * 116, r = 30 + R() * 50; const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(25,22,18,0.35)'); g.addColorStop(1, 'rgba(25,22,18,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); } });
  cell(6, () => { x.fillStyle = 'rgba(240,195,40,0.9)'; x.fillRect(0, 108, 256, 40); speckle(x, 256, 256, 600, R, 0.3, false); });
  cell(7, () => { x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.moveTo(128, 20); x.lineTo(220, 120); x.lineTo(160, 120); x.lineTo(160, 236); x.lineTo(96, 236); x.lineTo(96, 120); x.lineTo(36, 120); x.closePath(); x.fill(); });
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
}
export function asphalt() {
  const S = 256, [c, x] = cv(S, S), R = rng(77);
  x.fillStyle = '#3a3b3e'; x.fillRect(0, 0, S, S); speckle(x, S, S, 6000, R, 0.2, true); speckle(x, S, S, 6000, R, 0.3, false);
  return tex(c);
}
// 夜晚路灯照在地上的光斑
export function glow() {
  const S = 128, [c, x] = cv(S, S), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,214,150,0.9)'); g.addColorStop(0.5, 'rgba(255,190,120,0.35)'); g.addColorStop(1, 'rgba(255,180,110,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

// 板底图案（原创）：每套 = 名字 + 配色 + 花纹
export const DECKS = [
  { name: '黄昏', a: '#ff7a59', b: '#ffd23f', p: 'sun', wheel: '#f4efe6' },
  { name: '海浪', a: '#0f4c81', b: '#2fa8ff', p: 'wave', wheel: '#e8f4ff' },
  { name: '薄荷', a: '#0e9f6e', b: '#a7f3d0', p: 'stripe', wheel: '#ffffff' },
  { name: '夜紫', a: '#2d1b69', b: '#b273ff', p: 'dots', wheel: '#ffd23f' },
  { name: '樱花', a: '#ff8fd0', b: '#fff1f8', p: 'circle', wheel: '#ffffff' },
  { name: '原木', a: '#c79a6b', b: '#8a5a33', p: 'grain', wheel: '#f4efe6' },
  { name: '警戒', a: '#151515', b: '#ffd23f', p: 'hazard', wheel: '#151515' },
  { name: '极简', a: '#f2f2f2', b: '#151515', p: 'mono', wheel: '#ff5a4f' },
];
export function deckTexture(i) {
  const d = DECKS[i % DECKS.length], W = 128, H = 512, [c, x] = cv(W, H), R = rng(i * 17 + 3);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, d.a); g.addColorStop(1, d.b);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = d.b; x.strokeStyle = d.b;
  if (d.p === 'sun') { x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(W / 2, H * 0.42, 40, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 6; k++) x.fillRect(0, H * 0.42 + 8 + k * 12, W, 5); }
  else if (d.p === 'wave') { x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 5; for (let k = 0; k < 9; k++) { x.beginPath(); for (let px = 0; px <= W; px += 4) x.lineTo(px, 60 + k * 48 + Math.sin(px / 14 + k) * 9); x.stroke(); } }
  else if (d.p === 'stripe') { x.fillStyle = 'rgba(255,255,255,0.75)'; for (let k = -10; k < 20; k++) { x.save(); x.translate(W / 2, k * 40); x.rotate(-0.5); x.fillRect(-W, 0, W * 2, 12); x.restore(); } }
  else if (d.p === 'dots') { for (let k = 0; k < 70; k++) { x.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.6})`; x.beginPath(); x.arc(R() * W, R() * H, 2 + R() * 6, 0, 7); x.fill(); } }
  else if (d.p === 'circle') { x.strokeStyle = d.a; x.lineWidth = 9; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(W / 2, H / 2, 18 + k * 18, 0, 7); x.stroke(); } }
  else if (d.p === 'grain') { x.strokeStyle = 'rgba(60,30,10,0.35)'; x.lineWidth = 2; for (let k = 0; k < 26; k++) { x.beginPath(); const ox = R() * W; for (let py = 0; py <= H; py += 8) x.lineTo(ox + Math.sin(py / 40 + k) * 6, py); x.stroke(); } }
  else if (d.p === 'hazard') { x.fillStyle = d.b; for (let k = -10; k < 30; k++) { x.save(); x.translate(0, k * 32); x.rotate(-0.6); x.fillRect(-W, 0, W * 3, 14); x.restore(); } x.fillStyle = d.a; x.fillRect(W * 0.2, H * 0.38, W * 0.6, H * 0.24); }
  else if (d.p === 'mono') { x.fillStyle = d.b; x.fillRect(W * 0.46, H * 0.12, W * 0.08, H * 0.76); }
  // 游戏标志：一个圆 + 两个手指点
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.arc(W / 2, H * 0.78, 18, 0, 7); x.fill();
  x.fillStyle = '#151515'; x.beginPath(); x.arc(W / 2 - 6, H * 0.78 + 4, 4, 0, 7); x.arc(W / 2 + 6, H * 0.78 - 4, 4, 0, 7); x.fill();
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
}
export function deckSwatch(i, w, h) {
  // 菜单里用的小预览图
  const t = deckTexture(i); const [c, x] = cv(w, h);
  x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2); x.drawImage(t.image, -h / 2 + 4, -w / 2 + 2, h - 8, w - 4); x.restore();
  t.dispose();
  return c.toDataURL();
}
