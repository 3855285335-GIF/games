// 特效：磨杆火花 / 落地扬尘 / 擦地灰（3D 粒子）+ 手指光迹 / 接板提示圈（2D 叠加层）+ 弹字 / 表情
import { Points, BufferGeometry, BufferAttribute, PointsMaterial, AdditiveBlending, NormalBlending, CanvasTexture, SRGBColorSpace } from 'three';

let DOT = null;
function dotTex() {
  if (DOT) return DOT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  DOT = new CanvasTexture(c); DOT.colorSpace = SRGBColorSpace; return DOT;
}
class Particles {
  constructor(scene, max, o) {
    this.max = max; this.o = o; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('color', new BufferAttribute(this.col, 4));
    this.geo = g;
    this.pts = new Points(g, new PointsMaterial({ size: o.size, map: dotTex(), vertexColors: true, transparent: true, depthWrite: false, blending: o.add ? AdditiveBlending : NormalBlending, sizeAttenuation: true }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 3;
    scene.add(this.pts);
    this.alive = 0;
  }
  emit(x, y, z, vx, vy, vz, life, r, g, b, a) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.ml[i] = life; this.a0[i] = a;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.alive = this.max;
  }
  update(dt) {
    if (!this.alive) return;
    const o = this.o, k = Math.exp(-o.drag * dt); let any = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any++;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= o.grav * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] *= k; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.ml[i]);
      this.col[i * 4 + 3] = this.a0[i] * (o.add ? f : Math.min(1, f * 1.6));
    }
    if (!any) this.alive = 0;
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.col.fill(0); this.alive = 1; }
}

export class FX {
  constructor(scene) {
    this.sparks = new Particles(scene, 320, { size: 0.05, add: true, grav: 9, drag: 0.6 });
    this.sparks.pts.material.toneMapped = false; this.sparks.pts.material.fog = false;
    this.dust = new Particles(scene, 220, { size: 0.26, add: false, grav: -0.25, drag: 2.4 });
    this.acc = 0;
    // 2D 叠加层
    this.cv = document.getElementById('fx2d'); this.cx = this.cv.getContext('2d');
    this.pop = document.getElementById('pop'); this.popT = 0;
    this.emos = [];
  }
  grind(p, dx, dz, speed, dt, slide) {
    this.acc += dt * Math.min(90, 20 + speed * 12);
    while (this.acc > 1) {
      this.acc -= 1;
      const s = 0.6 + Math.random() * 1.6;
      const gcol = slide ? 0.8 : 0.55 + Math.random() * 0.35;
      this.sparks.emit(p.x, p.y + 0.02, p.z, -dx * speed * 0.3 + (Math.random() - 0.5) * s, 0.4 + Math.random() * 1.4, -dz * speed * 0.3 + (Math.random() - 0.5) * s, 0.25 + Math.random() * 0.25, 1, gcol, 0.18, 1);
    }
  }
  land(p, impact) {
    const n = Math.min(16, 4 + Math.round(impact * 2.5));
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.4 + Math.random() * 0.9; this.dust.emit(p.x + Math.cos(a) * 0.15, p.y + 0.03, p.z + Math.sin(a) * 0.15, Math.cos(a) * s, 0.15 + Math.random() * 0.2, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 0.78, 0.76, 0.72, 0.5); }
  }
  slide(p) { if (Math.random() < 0.6) this.dust.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.02, p.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4, 0.45, 0.35, 0.34, 0.33, 0.45); }
  bail(p) { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, s = 0.5 + Math.random(); this.dust.emit(p.x, p.y + 0.05, p.z, Math.cos(a) * s, 0.3 + Math.random() * 0.4, Math.sin(a) * s, 0.7, 0.75, 0.73, 0.7, 0.55); } }
  clear() { this.sparks.clear(); this.dust.clear(); }
  // 招式名弹在板子旁边
  trick(text, color) {
    const e = this.pop; e.textContent = text; e.style.color = color || '#fff';
    e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); this.popT = 1.1;
  }
  // name：发送者名字。发送者不在画面里时，表情显示在屏幕上方并带上名字（以前直接丢掉，看不到）
  emoji(e, anchor, name) {
    const el = document.createElement('div'); el.className = 'emo'; el.textContent = e;
    document.getElementById('labels').appendChild(el);
    this.emos.push({ el, anchor, t: 0, e, name: name || '' });
  }
  // 每帧：粒子 + 2D 层（光迹、接板圈）+ 弹字 / 表情跟随
  frame(dt, o) {
    this.sparks.update(dt); this.dust.update(dt);
    const cv = this.cv, cx = this.cx, dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
    const now = performance.now() / 1000;
    if (o.trails) for (const tr of o.trails) {
      const pts = tr.pts.filter((q) => now - q[2] < 0.22);
      if (pts.length < 2) continue;
      const fade = tr.end ? Math.max(0, 1 - (now - tr.end) / 0.35) : 1;
      const col = tr.kind === 'pop' ? '255,210,63' : tr.kind === 'flip' ? '80,220,255' : tr.kind === 'shove' ? '120,255,150' : '255,255,255';
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const k = i / pts.length;
        cx.strokeStyle = `rgba(${col},${(tr.kind ? 0.85 : 0.35) * k * fade})`; cx.lineWidth = (tr.kind ? 10 : 6) * k + 2;
        cx.beginPath(); cx.moveTo(pts[i - 1][0], pts[i - 1][1]); cx.lineTo(pts[i][0], pts[i][1]); cx.stroke();
      }
    }
    if (o.ring) {
      const [x, y, r, k] = o.ring;
      cx.strokeStyle = `rgba(255,210,63,${0.35 + 0.5 * k})`; cx.lineWidth = 4; cx.setLineDash([10, 8]);
      cx.beginPath(); cx.arc(x, y, r * (1.25 - 0.25 * k), 0, 6.283); cx.stroke(); cx.setLineDash([]);
    }
    if (this.popT > 0) {
      this.popT -= dt;
      if (o.board) this.pop.style.transform = `translate(${o.board[0]}px,${o.board[1] - 70}px) translate(-50%,-100%)`;
    }
    for (const m of this.emos) {
      m.t += dt;
      let at = o.anchor ? o.anchor(m.anchor) : null;
      if (m.t > 1.8) { m.el.remove(); m.dead = true; continue; }
      if (!at) { at = [innerWidth / 2, 150]; if (!m.top) { m.top = true; m.el.textContent = (m.name ? m.name + ' ' : '') + m.e; m.el.classList.add('emotop'); } }
      else if (m.top) { m.top = false; m.el.textContent = m.e; m.el.classList.remove('emotop'); }
      m.el.style.transform = `translate(${at[0]}px,${at[1] - 30 - m.t * 40}px) translate(-50%,-100%) scale(${Math.min(1, m.t * 5)})`;
      m.el.style.opacity = Math.min(1, (1.8 - m.t) * 2);
    }
    this.emos = this.emos.filter((m) => !m.dead);
  }
}
