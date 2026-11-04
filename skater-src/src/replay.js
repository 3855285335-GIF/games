// 回放：自动记录最近 15 秒，可以慢放、拖动、换机位
import { Vector3, Quaternion } from 'three';
const MAX = 15 * 60;
export class Recorder {
  constructor() { this.buf = []; this.acc = 0; }
  clear() { this.buf = []; }
  push(dt, sk, q, pitch, wheel, roll, comp) {
    this.acc += dt; if (this.acc < 1 / 60) return; this.acc = 0;
    this.buf.push({ p: [sk.p.x, sk.p.y, sk.p.z], q: [q.x, q.y, q.z, q.w], f: sk.flipA, h: sk.shoveA, a: pitch, w: wheel, m: sk.mode, r: roll || 0, c: comp || 0 });
    if (this.buf.length > MAX) this.buf.shift();
  }
}
const qa = new Quaternion(), qb = new Quaternion();
export class Player {
  constructor(frames) { this.f = frames.slice(); this.t = 0; this.speed = 1; this.playing = true; this.cam = 0; this.orbit = 0; }
  get dur() { return Math.max(0, (this.f.length - 1) / 60); }
  step(dt) { if (this.playing) { this.t += dt * this.speed; if (this.t >= this.dur) { this.t = this.dur; this.playing = false; } } }
  sample(out) {
    const n = this.f.length; if (n === 0) return false;
    const x = Math.min(n - 1, this.t * 60), i = Math.floor(x), j = Math.min(n - 1, i + 1), k = x - i, A = this.f[i], B = this.f[j];
    out.p.set(A.p[0] + (B.p[0] - A.p[0]) * k, A.p[1] + (B.p[1] - A.p[1]) * k, A.p[2] + (B.p[2] - A.p[2]) * k);
    qa.set(...A.q); qb.set(...B.q); out.q.slerpQuaternions(qa, qb, k);
    out.f = A.f + (B.f - A.f) * k; out.h = A.h + (B.h - A.h) * k; out.a = A.a + (B.a - A.a) * k; out.w = A.w + (B.w - A.w) * k; out.m = A.m; out.r = (A.r || 0) + ((B.r || 0) - (A.r || 0)) * k; out.c = (A.c || 0) + ((B.c || 0) - (A.c || 0)) * k;
    // 行进方向（用前后帧位置）
    const P = this.f[Math.max(0, i - 6)], N = this.f[Math.min(n - 1, i + 6)];
    out.dx = N.p[0] - P.p[0]; out.dz = N.p[2] - P.p[2];
    return true;
  }
}
