// 时间：白天 / 黄昏 / 夜晚
import { Color, PMREMGenerator, Scene, PointLight } from 'three';
import { makeSky } from './parkmesh.js';

export const TIMES = {
  day: { name: '白天', top: 0x4f8fd6, mid: 0xa9cdee, bot: 0xe6eef2, fog: 0xc4dcef, fn: 70, ff: 300, hs: 0xcfe3f7, hg: 0x8c826f, hi: 0.85, sc: 0xfff1dc, si: 2.6, dir: [-0.45, 0.82, -0.36], exp: 1.0, lamp: 0, glow: 0, win: 0, head: 0, env: 0.55 },
  dusk: { name: '黄昏', top: 0x2c3b78, mid: 0xf09a66, bot: 0xffd0a0, fog: 0xd99a78, fn: 55, ff: 260, hs: 0xffc49a, hg: 0x5a4a52, hi: 0.75, sc: 0xffad6a, si: 2.3, dir: [-0.82, 0.3, -0.48], exp: 1.05, lamp: 0.7, glow: 0.22, win: 0.55, head: 0.15, env: 0.5 },
  night: { name: '夜晚', top: 0x04060e, mid: 0x142039, bot: 0x26334f, fog: 0x0f1726, fn: 35, ff: 190, hs: 0x4a5a8c, hg: 0x1a1a22, hi: 0.5, sc: 0xa8bcff, si: 0.6, dir: [0.3, 0.82, 0.42], exp: 1.2, lamp: 1.4, glow: 0.8, win: 1.1, head: 0.75, env: 0.35 },
};
export class Lighting {
  constructor(renderer, scene, sky, hemi, sun, cam, mats) {
    Object.assign(this, { renderer, scene, sky, hemi, sun, cam, mats });
    this.dir = sun.userData.dir;
    this.head = new PointLight(0xfff2dd, 0, 7, 1.6); cam.add(this.head); this.head.position.set(0, 0.3, 0);
    this.env = null; this.cur = null;
  }
  apply(name) {
    const P = TIMES[name] || TIMES.day;
    if (this.cur === name) return; this.cur = name;
    const u = this.sky.material.uniforms; u.top.value.set(P.top); u.mid.value.set(P.mid); u.bot.value.set(P.bot);
    this.scene.fog.color.set(P.fog); this.scene.fog.near = P.fn; this.scene.fog.far = P.ff; this.scene.background = new Color(P.mid);
    this.hemi.color.set(P.hs); this.hemi.groundColor.set(P.hg); this.hemi.intensity = P.hi;
    this.sun.color.set(P.sc); this.sun.intensity = P.si; this.dir.set(P.dir[0], P.dir[1], P.dir[2]).normalize();
    this.renderer.toneMappingExposure = P.exp;
    const M = this.mats;
    M.lampHead.emissiveIntensity = P.lamp; M.glow.opacity = P.glow;
    for (const b of M.bld) b.emissiveIntensity = P.win;
    this.head.intensity = P.head;
    // 重新生成环境反射
    const pm = new PMREMGenerator(this.renderer), es = new Scene(), s2 = makeSky();
    const u2 = s2.material.uniforms; u2.top.value.set(P.top); u2.mid.value.set(P.mid); u2.bot.value.set(P.bot);
    es.add(s2);
    const env = pm.fromScene(es, 0.02).texture;
    if (this.env) this.env.dispose();
    this.env = env; this.scene.environment = env; this.scene.environmentIntensity = P.env;
    pm.dispose(); s2.geometry.dispose(); s2.material.dispose();
  }
}
