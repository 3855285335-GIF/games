export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
// 最短角差 a-b，范围 (-PI, PI]
export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}
export const wrap = (a) => angDiff(a, 0);
// 帧率无关的指数平滑系数
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const store = {
  get(k, d) { try { const v = localStorage.getItem('fs_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fs_' + k, JSON.stringify(v)); } catch (e) {} },
};
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
