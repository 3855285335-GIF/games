// 时间：白天 / 黄昏 / 夜晚。远处是真实照片全景（见 env.js），环境光和反射也来自照片，场地里的东西和背景光线一致
import { PMREMGenerator, PointLight } from 'three';
import { getEnv } from './env.js';

// env = 照片环境光强度；si = 太阳（只用来投影子）强度；elev = 太阳高度限制（阴天照片里最亮的云太低时，影子会拖得太长）；tint = 背景照片的颜色（夜晚调暗）
export const TIMES = {
  day: { name: '白天', env: 0.5, sc: 0xfff1de, si: 3.4, sunDir: [-0.83, 0.52, -0.2], elev: [0.55, 0.62], hs: 0xdde6f0, hg: 0x8a8378, hi: 0.15, exp: 0.8, fog: 0xc9ccd0, fn: 90, ff: 400, tint: [1, 1, 1], lamp: 0, glow: 0, win: 0, head: 0 },
  dusk: { name: '黄昏', env: 0.6, sc: 0xffb072, si: 3.0, elev: [0.12, 0.35], hs: 0xffc49a, hg: 0x5a4a52, hi: 0.12, exp: 0.9, fog: 0xd8b49a, fn: 80, ff: 380, tint: [1, 1, 1], lamp: 0.7, glow: 0.22, win: 0.55, head: 0.12 },
  night: { name: '夜晚', env: 0.09, sc: 0xa8bcff, si: 0.25, elev: [0.9, 1.1], hs: 0x4a5a8c, hg: 0x1a1a22, hi: 0.18, exp: 1.25, fog: 0x0f1726, fn: 60, ff: 300, tint: [0.1, 0.12, 0.2], lamp: 1.4, glow: 0.8, win: 1.1, head: 0.75 },
};
export class Lighting {
  constructor(renderer, scene, sky, hemi, sun, cam, mats) {
    Object.assign(this, { renderer, scene, sky, hemi, sun, cam, mats });
    this.dir = sun.userData.dir;
    this.head = new PointLight(0xfff2dd, 0, 7, 1.6); cam.add(this.head); this.head.position.set(0, 0.3, 0);
    this.cur = null; this.skyMesh = null; this.pm = {};
  }
  apply(name) {
    const P = TIMES[name] || TIMES.day;
    if (this.cur === name) return; this.cur = name;
    const key = name === 'dusk' ? 'dusk' : 'day', E = getEnv(key);
    // 远处的照片全景
    this.sky.visible = false;
    if (this.skyMesh !== E.sky) { if (this.skyMesh) this.scene.remove(this.skyMesh); this.scene.add(E.sky); this.skyMesh = E.sky; }
    E.sky.material.color.setRGB(P.tint[0], P.tint[1], P.tint[2]);
    // 环境光和反射：照片本身
    if (!this.pm[key]) { const pm = new PMREMGenerator(this.renderer); this.pm[key] = pm.fromEquirectangular(E.env).texture; pm.dispose(); }
    this.scene.environment = this.pm[key]; this.scene.environmentIntensity = P.env;
    this.scene.environmentRotation.set(0, -E.rot, 0);
    this.scene.background = null;
    this.scene.fog.color.set(P.fog); this.scene.fog.near = P.fn; this.scene.fog.far = P.ff;
    // 太阳：方向取照片里最亮的地方（高度限制在合理范围），只负责投出影子
    // 阴天的照片里没有明显的太阳：白天用固定的方向（从出生点右后方照过来，影子落在板子左边，看得清楚，和 Touchgrind 一样）
    const s = P.sunDir ? { x: P.sunDir[0], y: P.sunDir[1], z: P.sunDir[2] } : E.sun, az = Math.atan2(s.z, s.x), el = Math.min(P.elev[1], Math.max(P.elev[0], Math.asin(Math.max(-1, Math.min(1, s.y)))));
    this.dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    this.sun.color.set(P.sc); this.sun.intensity = P.si;
    this.hemi.color.set(P.hs); this.hemi.groundColor.set(P.hg); this.hemi.intensity = P.hi;
    this.renderer.toneMappingExposure = P.exp;
    const M = this.mats;
    // 材质是用到才做的：这张场地没有的东西（比如楼房窗户）就不用为了调亮度专门做出来
    const has = (k) => { const d = Object.getOwnPropertyDescriptor(M, k); return d && 'value' in d; };
    if (has('lampHead')) M.lampHead.emissiveIntensity = P.lamp;
    if (has('glow')) M.glow.opacity = P.glow;
    if (has('bld')) for (const b of M.bld) b.emissiveIntensity = P.win;
    this.head.intensity = P.head;
  }
}
