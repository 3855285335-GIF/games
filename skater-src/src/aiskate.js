// 和电脑玩 S.K.A.T.E.：电脑用和玩家同一套物理真的滑一遍（看得见它的板子），出招 / 照做。
// 做没做成按招式难度和电脑水平掷骰子；做不成就是不接板，板子真的摔在那里。招式名字也按物理实际落地算，不是直接报名字
import { Quaternion } from 'three';
import { Skater } from './physics.js';
import { makeBoard, poseBoard, DECK } from './board.js';
import { airTrick } from './tricks.js';
import { railPosts } from './terrain.js';
import { clamp, damp } from './util.js';

const STEP = 1 / 240, PI = Math.PI;
// 电脑会出的招：d = 难度（0～1）；r = 配方（pop 'tail'|'nose'、fakie、flip 带方向的圈数、shove 带方向的半圈数、imp、spin 转体弧度）
export const AI_TRICKS = [
  { d: 0.05, r: {} }, { d: 0.15, r: { flip: -1 } }, { d: 0.2, r: { flip: 1 } }, { d: 0.15, r: { shove: -1 } }, { d: 0.2, r: { shove: 1 } },
  { d: 0.25, r: { pop: 'nose' } }, { d: 0.3, r: { spin: PI } }, { d: 0.35, r: { flip: -1, shove: -1 } }, { d: 0.4, r: { shove: -2 } },
  { d: 0.45, r: { flip: -2 } }, { d: 0.5, r: { pop: 'nose', flip: -1 } }, { d: 0.55, r: { fakie: true, flip: -1 } }, { d: 0.6, r: { flip: -1, shove: -2 } },
  { d: 0.65, r: { imp: 1 } }, { d: 0.7, r: { spin: PI, flip: -1 } }, { d: 0.8, r: { flip: -3 } }, { d: 0.85, r: { spin: 2 * PI } },
];
export const AI_LEVELS = [
  { name: '简单', maxD: 0.36, p0: 0.72, k: 0.6 },
  { name: '普通', maxD: 0.62, p0: 0.86, k: 0.5 },
  { name: '难', maxD: 0.9, p0: 0.96, k: 0.32 },
];
// 玩家落地的招式 → 配方（电脑照做用）
export function recipeOf(info) {
  const a = info.air, s = (x) => x.reduce((q, v) => q + v, 0);
  return { pop: a.pop === 'nose' ? 'nose' : 'tail', fakie: !!(a.fakie && a.pop !== 'nose'), flip: s(info.flips), shove: s(info.shoves), imp: info.imp | 0, spin: Math.abs(info.spin) > 2.5 ? Math.round(info.spin / PI) * PI : 0 };
}
export function difficulty(r) {
  return clamp(0.05 + 0.13 * Math.abs(r.flip || 0) + 0.1 * Math.abs(r.shove || 0) + 0.3 * (r.imp || 0) + 0.2 * Math.abs(r.spin || 0) / PI + (r.fakie ? 0.1 : 0) + (r.pop === 'nose' ? 0.1 : 0), 0, 0.97);
}
// 场地里找一条 8 米长、平的、两边空的直道（离玩家近的优先），电脑在这里滑
function runways(T) {
  if (T.__runways) return T.__runways;
  const B = T.bounds, out = [], rods = [];
  for (const r of T.rails) { rods.push([r.ax, r.az, r.bx, r.bz]); if (r.kind === 'rail') for (const [x, , z] of railPosts(r)) rods.push([x, z, x, z]); }
  const segD = (px, pz, [ax, az, bx, bz]) => { const hx = bx - ax, hz = bz - az, hh = hx * hx + hz * hz; let t = hh > 1e-9 ? ((px - ax) * hx + (pz - az) * hz) / hh : 0; t = clamp(t, 0, 1); return Math.hypot(px - ax - hx * t, pz - az - hz * t); };
  for (let x = B.minX + 1.5; x <= B.maxX - 1.5; x += 1) for (let z = B.minZ + 1.5; z <= B.maxZ - 1.5; z += 1) for (let k = 0; k < 8; k++) {
    const yaw = (k * PI) / 4, fx = Math.sin(yaw), fz = Math.cos(yaw), h0 = T.height(x, z);
    let good = true;
    for (let d = 0; d <= 8.5 && good; d += 0.25) for (const s of [-0.7, 0, 0.7]) {
      const px = x + fx * d + fz * s, pz = z + fz * d - fx * s;
      if (px < B.minX + 0.5 || px > B.maxX - 0.5 || pz < B.minZ + 0.5 || pz > B.maxZ - 0.5) { good = false; break; }
      const q = T.query(px, pz, {}); if (q.wall || Math.abs(q.h - h0) > 0.004 || Math.abs(q.gx) + Math.abs(q.gz) > 0.01) { good = false; break; }
      for (const r of rods) if (segD(px, pz, r) < 0.5) { good = false; break; }
    }
    if (good) out.push({ x, z, yaw });
  }
  T.__runways = out;
  return out;
}

export class AIRider {
  constructor(scene, labels) {
    this.scene = scene; this.on = false; this.T = null; this.q = new Quaternion();
    this.board = makeBoard({ deck: 2, grip: 0, wheel: 1, truck: 1 }, { noRecv: true }); this.board.root.visible = false; scene.add(this.board.root);
    this.tag = document.createElement('div'); this.tag.className = 'tag'; this.tag.textContent = '电脑'; this.tag.style.display = 'none'; labels.appendChild(this.tag);
  }
  setTerrain(T) {
    if (this.T === T) return;
    this.T = T;
    this.sk = new Skater(T, { onLand: (info) => this._land(info), onBail: (w) => this._bail(w) });
  }
  // recipe：要做的招；ok：这次做不做得成；near：玩家现在的位置（找附近的直道）；done({ ok, trick })
  start(recipe, ok, near, done) {
    const list = runways(this.T);
    const pick = list.length ? list.slice().sort((a, b) => Math.abs(Math.hypot(a.x - near.x, a.z - near.z) - 4) - Math.abs(Math.hypot(b.x - near.x, b.z - near.z) - 4))[Math.floor(Math.random() * Math.min(6, list.length))] : this.T.spawn;
    const r = recipe || {}, nF = Math.abs(r.flip || 0), nS = Math.abs(r.shove || 0);
    const popK = r.imp || nF >= 3 || Math.abs(r.spin || 0) > 4 ? 1 : nF >= 2 || nS >= 2 || r.spin ? 0.8 : 0.45;
    const kOf = (n) => (n <= 1 ? 0.15 : n === 2 ? 0.55 : 0.85);
    const tAir = (2 * (2.4 + 1.2 * popK)) / 5.5;
    this.plan = { r, ok, popK, kF: kOf(nF), kS: kOf(nS), spinRate: r.spin ? r.spin / (tAir * 0.75) : 0, spinT: tAir * 0.75, tPop: 0.75 };
    const sk = this.sk;
    sk.reset(pick.x, pick.z, pick.yaw); sk.s = 3.3; if (r.fakie) { sk.fakie = true; sk._groundFrame(); }
    this.q.copy(sk.qv); this.t = 0; this.acc = 0; this.res = null; this.endT = 0; this.flicked = false; this.popped = false; this.airT = 0;
    this.done = done; this.on = true; this.board.root.visible = true;
  }
  stop() { this.on = false; this.board.root.visible = false; this.tag.style.display = 'none'; this.done = null; }
  _land(info) { if (this.res) return; const tr = airTrick(info); this.res = { ok: !!tr && this.popped, trick: tr ? tr.name : null }; }
  _bail() { if (!this.res) this.res = { ok: false, trick: null }; }
  step(dt) {
    if (!this.on) return;
    const P = this.plan, sk = this.sk;
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= STEP) {
      this.acc -= STEP; this.t += STEP;
      const I = { lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: P.ok ? 2 : 0, touching: P.ok ? 2 : 0, caught: P.ok, capT: -9, auto: P.ok, fb: 0, kick: 0 };
      if (!this.popped && this.t >= P.tPop - 0.08 && !this.flicked) {
        this.flicked = true;
        if (P.r.imp) sk.flick('imp', 1, 0.5, P.ok ? undefined : 1);
        if (P.r.flip) sk.flick('front', Math.sign(P.r.flip), P.kF, P.ok ? undefined : 1);
        if (P.r.shove) sk.flick('back', Math.sign(P.r.shove), P.kS, P.ok ? undefined : 1);
      }
      if (!this.popped && this.t >= P.tPop) { this.popped = sk.pop(P.r.pop || 'tail', P.popK) !== false; }
      if (sk.mode === 'air') { this.airT += STEP; if (P.spinRate && this.airT < P.spinT) I.spinRate = P.spinRate; }
      sk.step(STEP, I);
      if (sk.shoveBaked) { this.q.multiply(new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, sk.shoveBaked)); sk.shoveBaked = 0; }
      if (sk.baked) { this.q.multiply(sk.bakeQ); sk.bakeQ.identity(); sk.baked = false; }
      if (sk.mode === 'ground' && this.res) sk.s *= Math.exp(-2 * STEP); // 落地后慢慢停下
      if (this.res && !this.endT) this.endT = this.t + (this.res.ok ? 0.8 : 1.3);
      if (this.t > 6 && !this.res) this.res = { ok: false, trick: null };
      if (this.endT && this.t >= this.endT) { const d = this.done, res = this.res; this.stop(); if (d) d(res); return; }
    }
    this.q.slerp(sk.qv, damp(sk.mode === 'bail' ? 60 : 32, dt));
    const pitch = sk.visPitch();
    poseBoard(this.board, sk.p, this.q, pitch, pitch >= 0 ? -DECK.truckZ : DECK.truckZ, sk.flipA, sk.shoveA, sk.wheelRot, 0, 0, 0);
  }
  // 名字标签跟着电脑的板子
  label(project) {
    if (!this.on) return;
    const s = project(this.sk.p.x, this.sk.p.y + 0.3, this.sk.p.z);
    if (!s || s[2] > 1) { this.tag.style.display = 'none'; return; }
    this.tag.style.display = ''; this.tag.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-100%)`;
  }
}
