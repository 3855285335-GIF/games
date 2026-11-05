// 国内网络也能联机（不开 VPN）：
//  · 在中国大陆，Supabase 的实时通道（WebSocket）常常连不上，但普通 HTTPS 请求都能用
//  · Box：用数据库「牵线」——心跳报到、长轮询收信号、发信号、直连失败时中转位置（对应 games-cn.sql 里的函数）
//  · Link：玩家之间的 WebRTC 直连，位置走「不保证送达、不排序」的通道（延迟最低），事件走可靠通道
//  · 发广播用 HTTP 接口（POST /realtime/v1/api/broadcast），不依赖自己的 WebSocket

const AZ = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function rnd(n) {
  const u = new Uint32Array(n); crypto.getRandomValues(u);
  let s = ''; for (const x of u) s += AZ[x % 36]; return s;
}

// 直连用的服务器：STUN 负责打洞（不花额度）；TURN 只在两台手机直连不上时才中转（花中转额度）
// 顺序就是优先级：ExpressTURN（官网写免费每月 1000 GB）在前，Metered（官网写免费 500 MB，标着 trial，和 Chatter 共用）做备用
// 打洞服务器（国内的在前，2026-11-05 国内真机实测都能用；腾讯 stun.qq.com 连不上，已去掉）
export const STUN_LIST = [
  ['小米', 'stun:stun.miwifi.com:3478'], ['芒果TV', 'stun:stun.hitv.com:3478'], ['B站', 'stun:stun.chat.bilibili.com:3478'],
  ['Cloudflare', 'stun:stun.cloudflare.com:3478'], ['谷歌', 'stun:stun.l.google.com:19302'],
];
const STUNS = STUN_LIST.map((s) => s[1]);
export const TURNS = [
  { name: 'ExpressTURN', urls: ['turn:free.expressturn.com:3478?transport=udp', 'turn:free.expressturn.com:3478?transport=tcp'], username: '000000002109207283', credential: 'F2O3wiOhufam3ieQHr7cTrp77u0=' },
  // Metered 只留 TLS 443：国内不开 VPN 时 ExpressTURN 的 UDP 不通（2026-11-05 真机实测），而浏览器选中转时 UDP 排在 TCP 前面，
  // 留着 Metered 的 UDP 就会优先走它，花的是 Metered 的 500 MB 而不是 ExpressTURN 的 1 TB；去掉后 ExpressTURN 的 TCP 排第一
  { name: 'Metered', urls: ['turns:global.relay.metered.ca:443?transport=tcp'], username: '8e04f6769d4effbe70fb66f7', credential: 'z8AVqW5ZnBQ0zgNV' },
];
// 中转测试（设置里的测试按钮已按用户要求删掉；这些函数留着，以后排查网络时可以临时加回按钮）
const proto = (u) => (/^turns:/.test(u) ? 'TLS' : /transport=tcp/.test(u) ? 'TCP' : 'UDP') + ' ' + ((u.match(/:(\d+)(\?|$)/) || [])[1] || '');
export const TURN_TESTS = TURNS.flatMap((t) => t.urls.map((u) => ({ name: t.name, label: proto(u), urls: [u], username: t.username, credential: t.credential })));
export const ICE = [{ urls: STUNS }, ...TURNS.map((t) => ({ urls: t.urls, username: t.username, credential: t.credential }))];
// 试一个连接配置：等到想要的那种地址就算成功；any = 至少拿到过一个地址（一个都没有 = 这个浏览器/App 把直连功能关了）
function probe(cfg, want, ms) {
  return new Promise((resolve) => {
    if (!rtcOk()) { resolve({ ok: false, any: false, ms: 0 }); return; }
    let pc = null, done = false, tm = 0, any = false; const t0 = performance.now();
    const fin = (ok, proto) => { if (done) return; done = true; clearTimeout(tm); try { pc && pc.close(); } catch (_) {} resolve({ ok, any, ms: Math.round(performance.now() - t0), proto }); };
    try { pc = new RTCPeerConnection(cfg); } catch (e) { resolve({ ok: false, any: false, ms: 0 }); return; }
    tm = setTimeout(() => fin(false), ms);
    pc.onicecandidate = (e) => {
      const c = e.candidate; if (!c) { fin(false); return; }
      if (!c.candidate) return; // 有的浏览器会先发一条空的「收集完了」
      any = true; if (want.test(c.candidate)) fin(true, c.relayProtocol);
    };
    pc.createDataChannel('t');
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => fin(false));
  });
}
// 中转测试：只允许走中转，看能不能从这家服务器拿到中转地址（拿到 = 能用）
export const testTurn = (t, ms) => probe({ iceServers: [{ urls: t.urls, username: t.username, credential: t.credential }], iceTransportPolicy: 'relay' }, / typ relay /, ms || 7000);
// 打洞测试（一次测一个服务器）：能不能拿到公网地址（拿得到，就有机会直连，不花中转额度）
export const testStun = (url, ms) => probe({ iceServers: [{ urls: url }] }, / typ srflx /, ms || 5000);
export const rtcOk = () => typeof RTCPeerConnection !== 'undefined' && !window.__noRTC; // __noRTC：测试用，模拟直连不可用

/* ---------------- 数据库牵线 ---------------- */
export class Box {
  // o: { url, key, id, secret, room, topic, name(), ws(), playing(), onMembers(), onSigs(list), onStates(list), onStatus() }
  // secret 跟着玩家 id 走（每次打开游戏生成一次）：服务器第一次见到这个 id 时记下密钥，换房间也必须用同一个
  constructor(o) {
    this.o = o; this.url = o.url.replace(/\/+$/, ''); this.key = o.key; this.id = o.id; this.room = o.room;
    this.secret = o.secret;
    this.members = new Map(); this.ok = false; this.full = false; this.missing = false; this.dead = false;
    this.needPoll = false; this.wantStates = false; this.since = 0;
    this.beatT = 0; this.beatBusy = false; this.lastOk = 0;
    this.pollRun = 0; this.pollBusy = false; this.pollTimer = 0; this.putBusy = false; this.bBusy = false;
    this._vis = () => { if (!document.hidden && !this.dead) { this.beatT = 0; this.kickPoll(); } };
    document.addEventListener('visibilitychange', this._vis);
    this.tick = setInterval(() => this.loop(), 250);
    this.loop();
  }
  body(x) { return Object.assign({ p_id: this.id, p_secret: this.secret }, x); }
  async rpc(fn, body, ms, keep) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms || 8000);
    try {
      const r = await fetch(this.url + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctl.signal, keepalive: !!keep,
      });
      if (r.status === 404) { this.missing = true; return { missing: true }; }
      if (!r.ok) return { error: r.status };
      return { data: await r.json() };
    } catch (e) { return { error: e && e.name === 'AbortError' ? 'abort' : 'net' }; }
    finally { clearTimeout(tm); }
  }
  // 每 0.25 秒看一下：该心跳就心跳；需要长轮询而没在跑就启动
  loop() {
    if (this.dead || this.missing) return;
    if (!this.beatBusy && performance.now() >= this.beatT) this.beat();
    if (this.needPoll && this.ok && !this.pollBusy && !this.pollTimer) this.kickPoll();
  }
  async beat() {
    this.beatBusy = true;
    const r = await this.rpc('game_beat', this.body({ p_room: this.room, p_name: this.o.name() || '', p_ws: !!this.o.ws(), p_playing: !!this.o.playing() }), 8000);
    this.beatBusy = false;
    if (this.dead) return;
    const now = performance.now(), d = r.data;
    if (d && d.ok) {
      this.ok = true; this.full = false; this.lastOk = now;
      this.members = new Map((d.members || []).filter((m) => m && typeof m.id === 'string').map((m) => [m.id, { id: m.id, name: String(m.n || '玩家').slice(0, 12), ws: !!m.ws, pl: !!m.pl }]));
      if (Array.isArray(d.sigs) && d.sigs.length) this.o.onSigs(d.sigs);
      this.o.onMembers();
    } else if (d && d.reason === 'full') { this.full = true; this.ok = false; this.members = new Map(); }
    else if (r.missing) { this.ok = false; }
    else if (now - this.lastOk > 15000) this.ok = false; // 偶尔一次网络失败不算掉线
    this.beatT = now + (d && d.ok ? (this.o.playing() ? 3000 : 5000) : 2500);
    this.o.onStatus();
  }
  // 马上报到一次（页面关闭 / 回菜单时用 keepalive 发：页面关了请求也能送达，别人立刻知道我不在玩了，不会白白给我广播 20 秒）
  beatNow() {
    if (this.dead || this.missing) return;
    this.rpc('game_beat', this.body({ p_room: this.room, p_name: this.o.name() || '', p_ws: !!this.o.ws(), p_playing: !!this.o.playing() }), 4000, true);
    this.beatT = performance.now() + (this.o.playing() ? 3000 : 5000);
  }
  kickPoll() { this.pollRun++; clearTimeout(this.pollTimer); this.pollTimer = setTimeout(() => this.poll(this.pollRun), 30); }
  // 长轮询：服务器有新东西马上返回，没有最多等 1.8 秒；拿到结果马上再问
  async poll(run) {
    this.pollTimer = 0;
    if (this.dead || run !== this.pollRun || !this.needPoll || !this.ok) return;
    if (document.hidden) { this.pollTimer = setTimeout(() => this.poll(run), 3000); return; }
    this.pollBusy = true;
    // 卡住 6 秒就放弃重发（服务器最多等 1.8 秒，正常不会超过 3 秒）
    const r = await this.rpc('game_poll', this.body({ p_room: this.room, p_since: this.since, p_states: !!this.wantStates, p_wait_ms: 1800 }), 6000);
    this.pollBusy = false;
    if (this.dead || run !== this.pollRun) return;
    let next = 30;
    const d = r.data;
    if (d && d.ok) {
      if (typeof d.seq === 'number' && d.seq > this.since) this.since = d.seq;
      if (Array.isArray(d.sigs) && d.sigs.length) this.o.onSigs(d.sigs);
      if (Array.isArray(d.states) && d.states.length) { this.o.onStates(d.states); next = 120; } // 中转位置每秒最多 8 次
    } else if (d && d.reason === 'member') { next = 1000; this.beatT = 0; } // 还没报到：先心跳
    else if (r.missing) return;
    else if (r.error === 'abort') next = 30;
    else next = 2000;
    this.pollTimer = setTimeout(() => this.poll(run), next);
  }
  signal(to, payload) { if (!this.ok) return Promise.resolve(false); return this.rpc('game_signal', this.body({ p_room: this.room, p_to: to || null, p_payload: payload }), 8000).then((r) => !!r.data); }
  putState(p) {
    if (this.putBusy || !this.ok) return;
    this.putBusy = true;
    this.rpc('game_put_state', this.body({ p_room: this.room, p_payload: p }), 5000).finally(() => { this.putBusy = false; });
  }
  // HTTP 广播（能连上实时通道的人会收到）；drop = 上一条还没发完就丢掉这条（位置数据用）
  bcast(ev, payload, drop) {
    if (drop && this.bBusy) return;
    this.bBusy = true;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
    fetch(this.url + '/realtime/v1/api/broadcast', {
      method: 'POST', headers: { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: this.o.topic, event: ev, payload, private: false }] }), signal: ctl.signal,
    }).then((r) => r.body && r.body.cancel && r.body.cancel()).catch(() => {}).finally(() => { clearTimeout(tm); this.bBusy = false; });
  }
  close() {
    if (this.dead) return;
    this.dead = true; clearInterval(this.tick); clearTimeout(this.pollTimer); this.pollRun++;
    document.removeEventListener('visibilitychange', this._vis);
    if (!this.missing) this.rpc('game_leave', this.body({ p_room: this.room }), 4000, true);
  }
}

/* ---------------- WebRTC 直连 ---------------- */
export class Link {
  // init：我负责发起（id 小的一方），避免双方同时发起；sig(m)：把握手信号发给对方；cb：{ onOpen, onClose, onMsg }
  constructor(me, peer, init, sig, cb) {
    this.me = me; this.peer = peer; this.init = init; this.sig = sig; this.cb = cb;
    this.pc = null; this.du = null; this.dr = null; this.sid = ''; this.open = false; this.dead = false;
    this.t0 = performance.now(); this.buf = []; this.bufT = 0; this.pend = []; this.remote = false; this.early = null;
  }
  _pc() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = (e) => { if (this.pc !== pc) return; if (e.candidate) this._cand(e.candidate.toJSON()); else this._flush(); };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.close('failed');
      else if (s === 'disconnected') { clearTimeout(this.dT); this.dT = setTimeout(() => { if (this.pc === pc && pc.connectionState === 'disconnected') this.close('failed'); }, 6000); }
    };
    pc.ondatachannel = (e) => { if (this.pc === pc) this._dc(e.channel); };
    return pc;
  }
  _dc(ch) {
    if (ch.label === 'u') this.du = ch; else if (ch.label === 'r') this.dr = ch; else return;
    ch.binaryType = 'arraybuffer'; // 紧凑格式的位置消息是二进制
    ch.onopen = () => this._chk();
    ch.onclose = () => { if (this.du === ch || this.dr === ch) this.close('closed'); };
    ch.onmessage = (e) => {
      if (typeof e.data !== 'string') { if (e.data instanceof ArrayBuffer && this.cb.onBin) this.cb.onBin(this, e.data); return; }
      let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m && typeof m === 'object') this.cb.onMsg(this, m);
    };
  }
  _chk() {
    if (!this.open && !this.dead && this.du && this.dr && this.du.readyState === 'open' && this.dr.readyState === 'open') { this.open = true; this.cb.onOpen(this); }
  }
  _cand(c) { this.buf.push(c); if (!this.bufT) this.bufT = setTimeout(() => this._flush(), 150); } // 候选地址攒一下再发，少发几条信号
  _flush() { clearTimeout(this.bufT); this.bufT = 0; if (this.buf.length && !this.dead) { this.sig({ k: 'cand', sid: this.sid, c: this.buf }); this.buf = []; } }
  _drain() { for (const c of this.pend) this.pc.addIceCandidate(c).catch(() => {}); this.pend = []; }
  async start() {
    this.sid = rnd(8); this.pc = this._pc();
    this._dc(this.pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
    this._dc(this.pc.createDataChannel('r'));
    try {
      const o = await this.pc.createOffer(); if (this.dead) return;
      await this.pc.setLocalDescription(o); if (this.dead) return;
      this.sig({ k: 'offer', sid: this.sid, sdp: this.pc.localDescription.sdp });
    } catch (e) { this.close('failed'); }
  }
  async onSignal(m) {
    if (this.dead || !m || typeof m.sid !== 'string') return;
    try {
      if (m.k === 'offer' && !this.init && typeof m.sdp === 'string') {
        if (m.sid === this.sid) return; // 同一个 offer 从两条路都到了（或者正在处理）：只处理一次
        if (this.pc) { try { this.pc.close(); } catch (_) {} }
        this.sid = m.sid; this.pc = this._pc(); this.remote = false; this.du = this.dr = null; this.pend = [];
        if (this.early && this.early.sid === m.sid) this.pend = this.early.c.slice();
        this.early = null;
        await this.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp }); if (this.dead) return;
        this.remote = true; this._drain();
        const a = await this.pc.createAnswer(); if (this.dead) return;
        await this.pc.setLocalDescription(a); if (this.dead) return;
        this.sig({ k: 'answer', sid: this.sid, sdp: this.pc.localDescription.sdp });
      } else if (m.k === 'answer' && this.init && m.sid === this.sid && !this.gotAns && typeof m.sdp === 'string') {
        this.gotAns = true; // 两条路都送到时只处理一次
        await this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); if (this.dead) return;
        this.remote = true; this._drain();
      } else if (m.k === 'cand' && Array.isArray(m.c)) {
        if (m.sid !== this.sid) {
          // offer 还没到（两条路先后不定）：先存着
          if (!this.init) { if (!this.early || this.early.sid !== m.sid) this.early = { sid: m.sid, c: [] }; this.early.c.push(...m.c.slice(0, 40)); }
          return;
        }
        for (const c of m.c.slice(0, 40)) { if (this.remote) this.pc.addIceCandidate(c).catch(() => {}); else this.pend.push(c); }
      }
    } catch (e) { this.close('failed'); }
  }
  // 查这条直连实际走的是不是中转服务器（TURN）：走中转时少发一点，省中转流量额度。查不出来时当作直连
  async checkPath() {
    const pc = this.pc; if (!pc || !this.open || this.dead || !pc.getStats) return;
    try {
      const st = await pc.getStats(); let pair = null; const by = new Map();
      st.forEach((r) => { by.set(r.id, r); });
      st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId && by.get(r.selectedCandidatePairId)) pair = by.get(r.selectedCandidatePairId); });
      if (!pair) st.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected) && !pair) pair = r; });
      if (!pair) return;
      const lc = by.get(pair.localCandidateId), rc = by.get(pair.remoteCandidateId);
      const t = (c) => c && (c.candidateType || c.type);
      this.relayed = t(lc) === 'relay' || t(rc) === 'relay';
    } catch (_) {}
  }
  sendU(s) { const c = this.du; if (c && c.readyState === 'open' && c.bufferedAmount < 65536) { try { c.send(s); return true; } catch (_) {} } return false; }
  sendR(s) { const c = this.dr; if (c && c.readyState === 'open') { try { c.send(s); return true; } catch (_) {} } return false; }
  close(why) {
    if (this.dead) return;
    this.dead = true; const was = this.open; this.open = false;
    clearTimeout(this.bufT); clearTimeout(this.dT);
    for (const c of [this.du, this.dr]) { if (c) { try { c.close(); } catch (_) {} } }
    if (this.pc) { try { this.pc.close(); } catch (_) {} }
    this.cb.onClose(this, why || 'closed', was);
  }
}
