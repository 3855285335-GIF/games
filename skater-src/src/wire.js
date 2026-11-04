// 联机位置消息的紧凑格式（二进制，52 字节；原来的文字格式约 200 字节，算上每条消息的固定开销，走中转的流量约为原来的 1/4）
// 只在玩家直连（WebRTC）时用：双方都是新版才用（连上时互相声明 caps），旧版照样收发文字格式
// 名字、板子配置、招式这些不常变的，改成变化时才单独发一次（meta），不再每条都带
const SIZE = 52, MAGIC = 0xb5, VER = 1;
const MODES = ['ground', 'air', 'grind', 'bail'];
const i16 = (v, k) => Math.max(-32767, Math.min(32767, Math.round((+v || 0) * k)));
const u16 = (v, k) => Math.max(0, Math.min(65535, Math.round((+v || 0) * k)));

// p：和文字格式一样的对象（t, p, q, w, f, h, ft, ht, a, l, v, j, z, m, sc）
export function encodeState(p) {
  const b = new ArrayBuffer(SIZE), d = new DataView(b);
  d.setUint8(0, MAGIC); d.setUint8(1, VER);
  d.setUint32(2, (Math.round(p.t) >>> 0), true);
  for (let i = 0; i < 3; i++) d.setFloat32(6 + i * 4, +p.p[i] || 0, true);
  for (let i = 0; i < 4; i++) d.setInt16(18 + i * 2, i16(p.q[i], 32767), true);
  const w = p.w || [0, 0, 0];
  for (let i = 0; i < 3; i++) d.setInt16(26 + i * 2, i16(w[i], 100), true);
  d.setInt16(32, i16(p.f, 1000), true); d.setInt16(34, i16(p.h, 1000), true);
  d.setInt16(36, i16(p.ft, 1000), true); d.setInt16(38, i16(p.ht, 1000), true);
  d.setInt16(40, i16(p.a, 1000), true); d.setInt16(42, i16(p.l, 1000), true);
  d.setUint16(44, u16(p.v, 100), true);
  d.setUint8(46, (p.j | 0) & 255);
  d.setUint8(47, ((p.m | 0) & 3) | (p.z > 0 ? 4 : 0));
  d.setUint32(48, Math.max(0, Math.min(4294967295, Math.round(+p.sc || 0))), true);
  return b;
}
// 解不出来（长度不对 / 不是这个格式）返回 null
export function decodeState(buf) {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength < SIZE) return null;
  const d = new DataView(buf);
  if (d.getUint8(0) !== MAGIC || d.getUint8(1) !== VER) return null;
  const p = [0, 1, 2].map((i) => d.getFloat32(6 + i * 4, true));
  if (!p.every(Number.isFinite)) return null;
  const fl = d.getUint8(47);
  return {
    t: d.getUint32(2, true), p,
    q: [0, 1, 2, 3].map((i) => d.getInt16(18 + i * 2, true) / 32767),
    w: [0, 1, 2].map((i) => d.getInt16(26 + i * 2, true) / 100),
    f: d.getInt16(32, true) / 1000, h: d.getInt16(34, true) / 1000,
    ft: d.getInt16(36, true) / 1000, ht: d.getInt16(38, true) / 1000,
    a: d.getInt16(40, true) / 1000, l: d.getInt16(42, true) / 1000,
    v: d.getUint16(44, true) / 100, j: d.getUint8(46), m: fl & 3, z: fl & 4 ? 1 : -1,
    sc: d.getUint32(48, true),
  };
}
export const WIRE_SIZE = SIZE;
export { MODES };
