// 网格拼装工具：把同材质的面合并成一个几何体，减少绘制次数
import { BufferGeometry, Float32BufferAttribute, Vector3, Matrix3, Matrix4, Quaternion } from 'three';

const _a = new Vector3(), _b = new Vector3(), _n = new Vector3();
export class MB {
  constructor(color) { this.p = []; this.n = []; this.uv = []; this.c = color ? [] : null; this.col = [1, 1, 1]; }
  _v(p, n, uv) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); if (this.c) this.c.push(this.col[0], this.col[1], this.col[2]); }
  // 平面面片：自动按 hint（期望外法线）调整朝向，UV 按主轴平面投影（单位：米 / S）
  poly(pts, hint, S) {
    S = S || 4;
    _a.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
    _b.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-14 && pts.length > 3) { _b.set(pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]); _n.crossVectors(_a, _b); }
    if (_n.lengthSq() < 1e-14) return;
    _n.normalize();
    if (hint && _n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) { pts = pts.slice().reverse(); _n.negate(); }
    const n = [_n.x, _n.y, _n.z], ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvf = ay >= ax && ay >= az ? (p) => [p[0] / S, p[2] / S] : ax >= az ? (p) => [p[2] / S, p[1] / S] : (p) => [p[0] / S, p[1] / S];
    for (let i = 1; i < pts.length - 1; i++) { this._v(pts[0], n, uvf(pts[0])); this._v(pts[i], n, uvf(pts[i])); this._v(pts[i + 1], n, uvf(pts[i + 1])); }
  }
  // 带逐顶点法线与 UV 的四边形（用于曲面）；按 N[0] 自动调整朝向
  quadN(P, N, UV) {
    _a.set(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]);
    _b.set(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]);
    _n.crossVectors(_a, _b);
    let o = [0, 1, 2, 0, 2, 3];
    if (_n.x * N[0][0] + _n.y * N[0][1] + _n.z * N[0][2] < 0) o = [0, 2, 1, 0, 3, 2];
    for (const i of o) this._v(P[i], N[i], UV[i]);
  }
  addGeo(geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    const nm = new Matrix3().getNormalMatrix(matrix), v = new Vector3(), n = new Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      this._v([v.x, v.y, v.z], [n.x, n.y, n.z], ua ? [ua.getX(i), ua.getY(i)] : [0, 0]);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  geo() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.p.length === 0; }
}
// 两点之间放一个圆柱
const _q = new Quaternion(), _m = new Matrix4(), _Y = new Vector3(0, 1, 0), _d = new Vector3(), _mid = new Vector3(), _s = new Vector3();
export function between(ax, ay, az, bx, by, bz) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length(); _d.divideScalar(L || 1);
  _q.setFromUnitVectors(_Y, _d); _mid.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); _s.set(1, L, 1);
  return _m.compose(_mid, _q, _s).clone();
}
