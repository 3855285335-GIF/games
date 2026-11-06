// 环境：真实照片全景（Poly Haven，CC0 公共领域）当远处的背景，也当光源（环境光和反射都来自照片）
// 白天：柏林波茨坦广场（阴天的城市广场）；黄昏：威尼斯海边步道。夜晚：用白天的照片调暗，路灯打光
import { DataTexture, RGBAFormat, HalfFloatType, EquirectangularReflectionMapping, LinearFilter, TextureLoader, SRGBColorSpace, Vector3, Color } from 'three';
import { GroundedSkybox } from './vendor/GroundedSkybox.js';
import bgDay from '../assets/bg_day.jpg';
import envDay from '../assets/env_day.txt';
import bgDusk from '../assets/bg_dusk.jpg';
import envDusk from '../assets/env_dusk.txt';

const SRC = { day: { bg: bgDay, env: envDay, h: 1.7, rot: 2.3 }, dusk: { bg: bgDusk, env: envDusk, h: 1.6, rot: 1.0 } }; // rot：照片转到出生点正前方是高楼（太阳方向在 lighting.js 里单独定）
const W = 128, H = 64;
const cache = {};
// 128×64 的半精度浮点全景（存的时候已经上下翻好）
function envTex(b64) {
  const bin = atob(b64), u16 = new Uint16Array(bin.length >> 1);
  for (let i = 0; i < u16.length; i++) u16[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  const t = new DataTexture(u16, W, H, RGBAFormat, HalfFloatType);
  t.mapping = EquirectangularReflectionMapping; t.magFilter = t.minFilter = LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  t.userData.raw = u16;
  return t;
}
const half = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 6.1e-5 * (f / 1024) : e === 31 ? 65504 : s * Math.pow(2, e - 15) * (1 + f / 1024); };
// 照片里天空最亮的方向（太阳 / 最亮的云），转成世界方向
function brightest(raw, rot) {
  let best = -1, bi = 0;
  for (let y = H / 2; y < H; y++) for (let x = 0; x < W; x++) { // 数据是上下翻过的：后半是天空
    const i = (y * W + x) * 4, l = 0.2126 * half(raw[i]) + 0.7152 * half(raw[i + 1]) + 0.0722 * half(raw[i + 2]);
    if (l > best) { best = l; bi = y * W + x; }
  }
  const u = ((bi % W) + 0.5) / W, v = (Math.floor(bi / W) + 0.5) / H;
  const phi = 2 * Math.PI * u + Math.PI + rot, lat = (v - 0.5) * Math.PI;
  return new Vector3(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat));
}
export function getEnv(name) {
  const k = SRC[name] ? name : 'day';
  if (cache[k]) return cache[k];
  const s = SRC[k], bg = new TextureLoader().load(s.bg);
  bg.colorSpace = SRGBColorSpace; bg.anisotropy = 4;
  const env = envTex(s.env);
  const sky = new GroundedSkybox(bg, s.h, 260, 96);
  sky.position.y = s.h - 0.02; sky.rotation.y = -s.rot; // 照片的地面和场地地面对齐；转到好看的方向（远处的楼对着出生点前方）
  const m = sky.material; m.toneMapped = false; m.fog = false; m.depthTest = false; m.depthWrite = false;
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.base = new Color(1, 1, 1);
  return (cache[k] = { sky, env, rot: s.rot, sun: brightest(env.userData.raw, s.rot) });
}
