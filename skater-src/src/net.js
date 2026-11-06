// 联机：Supabase Realtime 广播（不建表、不存数据）+ 保活签到
import { Quaternion, Vector3 } from 'three';

export class Net {
  constructor(url, key, room, onMsg, onStatus) {
    this.url = url.replace(/\/+$/, ''); this.key = key; this.topic = 'realtime:fskate-' + room;
    this.onMsg = onMsg; this.onStatus = onStatus;
    this.ref = 1; this.joined = false; this.ws = null; this.hb = null; this.dead = false; this.tries = 0;
    this.tokens = 8; this.lastFill = performance.now(); this.sent = 0;
    this.connect();
  }
  connect() {
    if (this.dead) return;
    this.onStatus('connecting');
    // 测试用：模拟国内网络（实时通道连不上）
    if (window.__noWS) { this.retry(); return; }
    const u = this.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(this.key) + '&vsn=1.0.0';
    let ws;
    try { ws = new WebSocket(u); } catch (e) { this.retry(); return; }
    this.ws = ws; this.joined = false;
    // 国内网络常见：连接卡住，既不成功也不报错。10 秒没加入成功就断开重来
    clearTimeout(this.jt);
    this.jt = setTimeout(() => { if (this.ws === ws && !this.joined) { try { ws.close(); } catch (_) {} } }, 10000);
    ws.onopen = () => {
      this.joinRef = String(this.ref++);
      // 与官方 supabase-js 相同：没有登录时 access_token 就是项目 key
      this.raw({ topic: this.topic, event: 'phx_join', ref: this.joinRef, join_ref: this.joinRef,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '', enabled: false }, postgres_changes: [], private: false }, access_token: this.key } });
      clearInterval(this.hb);
      this.hb = setInterval(() => this.raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(this.ref++) }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.topic !== this.topic) return;
      if (m.event === 'phx_reply' && m.ref === this.joinRef) {
        if (m.payload && m.payload.status === 'ok') { this.joined = true; this.tries = 0; this.onStatus('online'); }
        else { this.onStatus('error', JSON.stringify((m.payload && m.payload.response) || m.payload || '').slice(0, 80)); try { ws.close(); } catch (_) {} }
      } else if (m.event === 'broadcast' && m.payload) this.onMsg(m.payload.event, m.payload.payload);
      else if (m.event === 'phx_error' || m.event === 'phx_close' || m.event === 'system' && m.payload && m.payload.status === 'error') { this.joined = false; try { ws.close(); } catch (_) {} }
    };
    ws.onclose = () => { if (this.ws !== ws) return; this.joined = false; clearInterval(this.hb); clearTimeout(this.jt); if (!this.dead) { this.onStatus('offline'); this.retry(); } };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
  }
  retry() {
    if (this.dead) return;
    this.tries++;
    clearTimeout(this.rt);
    this.rt = setTimeout(() => this.connect(), Math.min(30000, 1000 * Math.pow(2, Math.min(5, this.tries - 1))));
  }
  raw(o) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(o)); return true; } return false; }
  // 每个客户端最多每秒 8 条（令牌桶），防止任何情况下刷爆免费额度
  send(event, payload, force) {
    if (!this.joined) return false;
    const now = performance.now();
    this.tokens = Math.min(8, this.tokens + ((now - this.lastFill) / 1000) * 8); this.lastFill = now;
    if (this.tokens < 1 && !force) return false;
    this.tokens = Math.max(0, this.tokens - 1);
    this.sent++;
    return this.raw({ topic: this.topic, event: 'broadcast', payload: { type: 'broadcast', event, payload }, ref: String(this.ref++) });
  }
  close() {
    this.dead = true; clearInterval(this.hb); clearTimeout(this.rt); clearTimeout(this.jt);
    if (this.ws) { try { this.ws.close(); } catch (_) {} }
    this.joined = false;
  }
}

// 调用 Supabase 里已经存在的 keepalive() 签到函数（没有也不影响游戏）
export function keepalive(url, key) {
  try {
    return fetch(url.replace(/\/+$/, '') + '/rest/v1/rpc/keepalive', {
      method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: '{}', keepalive: true,
    }).then((r) => r.status).catch(() => 0);
  } catch (e) { return Promise.resolve(0); }
}

// 远程玩家：快照插值（按发送方时间戳排列，渲染时延后一点点，画面就很顺）
const qa = new Quaternion(), qb = new Quaternion(), qt = new Quaternion(), UPV = new Vector3(0, 1, 0), TAU = Math.PI * 2;
export class Remote {
  constructor(id) { this.id = id; this.snaps = []; this.offset = null; this.offs = []; this.interval = 1000; this.ivs = []; this.lag = null; this.lastS = 0; this.lastRecv = 0; this.name = ''; this.design = -1; this.score = 0; this.trickSeq = -1; }
  push(m, nowMs) {
    if (typeof m.t !== 'number' || !Array.isArray(m.p) || !Array.isArray(m.q)) return false;
    const last = this.snaps[this.snaps.length - 1];
    if (last && m.t <= last.t) return false;
    // 发送间隔只按「上一条是在动的」来算：站着不动时本来就发得少，不能把显示延后拉长（不然对方一滑起来，延后突然变短，板子会往前瞬移）
    if (last && (last.v > 0.05 || last.m !== 0 || (last.w && Math.hypot(last.w[0], last.w[1], last.w[2]) > 0.05))) { const d = Math.min(4000, m.t - last.t); this.interval = this.interval * 0.7 + d * 0.3; this.ivs.push(d); if (this.ivs.length > 8) this.ivs.shift(); }
    this.lastRecv = nowMs;
    const o = nowMs - m.t;
    this.offs.push(o); if (this.offs.length > 30) this.offs.shift();
    this.offset = Math.min(...this.offs);
    const w = Array.isArray(m.w) && m.w.length === 3 && m.w.every(isFinite) ? m.w : null; // 旧版本没有速度，就用直线补间
    this.snaps.push({ t: m.t, p: m.p, q: m.q, f: +m.f || 0, h: +m.h || 0, a: +m.a || 0, z: +m.z || 0, v: +m.v || 0, m: m.m | 0, w, j: m.j | 0, ft: +m.ft || 0, ht: +m.ht || 0, l: +m.l || 0 });
    if (this.snaps.length > 20) this.snaps.shift();
    return true;
  }
  // 显示延后多少：按最近 8 条里最长的间隔算（偶尔补发的短间隔不会把延后拉短，免得画面断档）
  get delay() { const mx = this.ivs.length ? Math.max(...this.ivs) : this.interval; return Math.max(150, Math.min(1300, mx * 1.2 + 80)); }
  // 计算当前应显示的姿态
  sample(nowMs, out) {
    const S = this.snaps; if (!S.length) return false;
    // 延后量慢慢调：差得越多调得越快（最多快/慢 15%），差一点点就几乎不动，播放速度是平滑变化的，看不出顿挫
    const want = this.offset + this.delay, dms = Math.min(100, Math.max(0, nowMs - this.lastS));
    const rate = Math.max(-0.15, Math.min(0.15, (want - (this.lag === null ? want : this.lag)) / 1200));
    this.lag = this.lag === null || Math.abs(want - this.lag) > 2500 ? want : this.lag + rate * dms;
    this.lastS = nowMs;
    const rt = nowMs - this.lag;
    let a = S[0], b = null;
    for (let i = S.length - 1; i >= 0; i--) if (S[i].t <= rt) { a = S[i]; b = S[i + 1] || null; break; }
    if (rt < S[0].t) { a = S[0]; b = null; }
    if (b && b.j !== a.j) b = null; // 对方复位/传送了：不要从旧位置滑过去
    if (b) {
      const k = (rt - a.t) / Math.max(1, b.t - a.t), dt = Math.max(1, b.t - a.t) / 1000;
      // 位置：两头都有速度就用曲线（Hermite）补间，转弯和腾空弧线更圆；速度和位移对不上时退回直线
      // 从站着不动到起步（中间隔了很久）：先停在原地，快到下一条时才开始动；停下来时反过来
      const va = a.w ? Math.hypot(a.w[0], a.w[1], a.w[2]) : a.v, vb = b.w ? Math.hypot(b.w[0], b.w[1], b.w[2]) : b.v;
      let held = false;
      if (b.t - a.t > 350 && (va < 0.05) !== (vb < 0.05)) {
        const ch0 = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
        const tau = Math.min(b.t - a.t, Math.max(30, (2000 * ch0) / Math.max(0.2, Math.max(va, vb))));
        if (va < 0.05) { const t0 = b.t - tau; if (rt < t0) { for (let i = 0; i < 3; i++) out.p[i] = a.p[i]; } else { const u = (rt - t0) / tau, u2 = u * u, u3 = u2 * u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2; for (let i = 0; i < 3; i++) out.p[i] = a.p[i] + h01 * (b.p[i] - a.p[i]) + h11 * (tau / 1000) * (b.w ? b.w[i] : 0); } }
        else { const t1 = a.t + tau; if (rt > t1) { for (let i = 0; i < 3; i++) out.p[i] = b.p[i]; } else { const u = (rt - a.t) / tau, u2 = u * u, u3 = u2 * u, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2; for (let i = 0; i < 3; i++) out.p[i] = a.p[i] + h10 * (tau / 1000) * (a.w ? a.w[i] : 0) + h01 * (b.p[i] - a.p[i]); } }
        held = true;
      }
      let curve = !held && !!(a.w && b.w);
      if (curve) {
        const ch = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
        const ta = Math.hypot(a.w[0], a.w[1], a.w[2]) * dt, tb = Math.hypot(b.w[0], b.w[1], b.w[2]) * dt;
        if (Math.max(ta, tb) > ch * 2.5 + 0.3) curve = false;
      }
      if (curve) {
        const k2 = k * k, k3 = k2 * k, h00 = 2 * k3 - 3 * k2 + 1, h10 = k3 - 2 * k2 + k, h01 = -2 * k3 + 3 * k2, h11 = k3 - k2;
        for (let i = 0; i < 3; i++) out.p[i] = h00 * a.p[i] + h10 * dt * a.w[i] + h01 * b.p[i] + h11 * dt * b.w[i];
      } else if (!held) for (let i = 0; i < 3; i++) out.p[i] = a.p[i] + (b.p[i] - a.p[i]) * k;
      qa.set(a.q[0], a.q[1], a.q[2], a.q[3]).normalize(); qb.set(b.q[0], b.q[1], b.q[2], b.q[3]).normalize();
      let bf = b.f, bh = b.h;
      // 落地那一下：对方的翻板 / 转板角度归零了（转板角度并进了朝向），这里接着原来的方向转完，不会倒着转回去
      if (a.m === 1 && b.m === 3) {
        // 摔了：对方把翻板 / 转板角度并进了姿态（q）。姿态按最短的路转过去，这里补上整圈，板子不会在一瞬间多转一圈
        if (a.f !== 0) bf = b.f + Math.round(a.f / TAU) * TAU;
        if (a.h !== 0) bh = b.h + Math.round(a.h / TAU) * TAU;
      } else if (a.m === 1 && b.m !== 1) {
        // 落地 / 上杆：翻板角只剩一点点（或归零），接着原来的圈数算，不会倒着转回去
        if (a.f !== 0) bf = b.f + (a.ft ? Math.round(a.ft / TAU) : Math.round((a.f - b.f) / TAU)) * TAU;
        if (b.h === 0 && a.h !== 0) {
          bh = a.ht || Math.sign(a.h) * Math.PI * Math.ceil(Math.abs(a.h) / Math.PI - 1e-3);
          qb.multiply(qt.setFromAxisAngle(UPV, -bh)); // 把落地后的朝向换算回“还没并进转板角度”的样子
        }
      }
      out.q.slerpQuaternions(qa, qb, k);
      out.f = a.f + (bf - a.f) * k; out.h = a.h + (bh - a.h) * k; out.a = a.a + (b.a - a.a) * k;
      out.z = k < 0.5 ? a.z : b.z; out.v = a.v + (b.v - a.v) * k; out.m = k < 0.5 ? a.m : b.m; out.l = a.l + (b.l - a.l) * k;
    } else {
      // 没有更新的数据：按最后速度短暂外推
      const L = S[S.length - 1], P = S[S.length - 2];
      let ex = Math.min(250, Math.max(0, rt - L.t)) / 1000;
      if (L.m === 3 || L.v < 0.05) ex = 0;
      for (let i = 0; i < 3; i++) {
        const vel = L.w ? L.w[i] : P && P.j === L.j ? ((L.p[i] - P.p[i]) / Math.max(1, L.t - P.t)) * 1000 : 0;
        out.p[i] = L.p[i] + (i === 1 ? 0 : vel * ex);
      }
      out.q.set(L.q[0], L.q[1], L.q[2], L.q[3]).normalize();
      out.f = L.f; out.h = L.h; out.a = L.a; out.z = L.z; out.v = L.v; out.m = L.m; out.l = L.l;
    }
    return true;
  }
}

// 排行榜（需要在 Supabase 运行过 skate 排行榜 SQL；没运行时返回 missing）
async function rpc(url, key, fn, body) {
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 404) return { missing: true };
    if (!r.ok) return { error: r.status };
    return { data: await r.json() };
  } catch (e) { return { error: 'net' }; }
}
export const submitScore = (url, key, name, score, map) => rpc(url, key, 'skate_submit', { p_name: name, p_score: Math.round(score), p_map: map });
export const topScores = (url, key, map) => rpc(url, key, 'skate_top', { p_map: map, p_limit: 20 });
