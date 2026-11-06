// 联机管理：连接房间、发送自己的状态、显示别人的板子、表情、房间在线列表、对战消息转发
// 三条路自动选（每个玩家单独选，不用手动切换）：
//   1. 玩家直连（WebRTC）：最快，不经过 Supabase、不占实时消息额度
//   2. 实时通道：能连上 WebSocket 的人（比如开着 VPN）照常用；自己连不上时用 HTTP 广播发给他们
//   3. 数据库中转：直连失败、对方又收不到实时通道时，位置每秒写 5 次数据库，对方长轮询取走
// 同一条消息可能从几条路同时到达：事件按编号 sq 去重，位置按时间戳去重
import { Vector3, Quaternion } from 'three';
import { Net, Remote, keepalive } from './net.js';
import { Box, Link, rtcOk, rnd } from './netcn.js';
import { makeBoard, poseBoard, disposeBoard, normBoard, sameBoard, DECK } from './board.js';
import { clamp, fmt, angDiff } from './util.js';
import { esc } from './ui.js';
import { encodeState, decodeState } from './wire.js';

const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const MSG = new Set(['s', 'bye', 'hi', 'e', 'gi', 'gj', 'gs', 'ga', 'gx']);

export class Online {
  constructor(o) {
    this.o = o; this.net = null; this.box = null; this.key = null; this.playing = false; this.remotes = new Map();
    this.links = new Map(); this.fails = new Map(); this.seen = new Set(); this.seq = 0;
    this.lastSend = 0; this.lastDC = 0; this.lastRelay = 0; this.relayT = -1e9; this.relay0 = 0; this.syncT = 0;
    this.force = false; this.kept = false; this.status = 'off'; this.mode = ''; this.emoT = 0;
    this.tmp = new Vector3();
    this.secret = rnd(32); // 和 myId 一起代表“我”，换房间不变
  }
  get enabled() { return !!(this.o.url && this.o.key); }
  topicFor(room, map) { return (map + '-' + encodeURIComponent(room)).replace(/%/g, '_').slice(0, 90); }
  connect(room, map) {
    if (!this.enabled) return;
    if (!this.kept) { this.kept = true; keepalive(this.o.url, this.o.key); }
    const k = this.topicFor(room, map);
    if (this.net && this.key === k) return;
    this.disconnect();
    this.key = k; this.room = room; this.map = map;
    this.net = new Net(this.o.url, this.o.key, k, (ev, m) => this.onWS(ev, m), (s) => {
      this.updStatus();
      if (s === 'online') { this.route('hi', { i: this.o.myId }); this.force = true; if (this.box) this.box.beatT = 0; }
    });
    this.box = new Box({
      url: this.o.url, key: this.o.key, id: this.o.myId, secret: this.secret, room: k, topic: 'fskate-' + k,
      name: () => this.o.getName(), ws: () => !!(this.net && this.net.joined), playing: () => this.playing,
      onMembers: () => { this.syncLinks(); this.o.onList && this.o.onList(); },
      onSigs: (list) => this.onSigs(list), onStates: (list) => this.onStates(list), onStatus: () => this.updStatus(),
    });
    this.updStatus();
  }
  disconnect() {
    if (this.playing && (this.net || this.box)) this.route('bye', { i: this.o.myId }, true);
    for (const L of [...this.links.values()]) L.close('bye');
    this.links.clear(); this.fails.clear();
    if (this.net) { this.net.close(); this.net = null; }
    if (this.box) { this.box.close(); this.box = null; }
    this.key = null; this.status = 'off'; this.mode = '';
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }
  setPlaying(on) {
    const stop = this.playing && !on;
    if (stop) { this.route('bye', { i: this.o.myId }, true); for (const L of [...this.links.values()]) L.close('bye'); }
    this.playing = on; this.force = on;
    if (this.box) { if (stop) this.box.beatNow(); else this.box.beatT = 0; } // 马上报到，别人能更快看到 / 不再等我
  }
  remove(id) {
    const r = this.remotes.get(id); if (!r) return;
    this.o.scene.remove(r.board.root); disposeBoard(r.board); r.tag.remove(); this.remotes.delete(id);
    this.o.onList && this.o.onList();
  }
  players() {
    const a = this.playing ? [{ id: this.o.myId, name: this.o.getName() }] : [];
    for (const [id, r] of this.remotes) a.push({ id, name: r.R.name });
    return a;
  }
  // 房间里的其他人的名字（菜单里显示）：有数据库心跳就用心跳名单（国内网络也准），否则用正在滑的人
  memberNames() {
    if (this.box && this.box.ok) { const a = []; for (const m of this.box.members.values()) if (m.id !== this.o.myId) a.push(m.name || '玩家'); return a; }
    return [...this.remotes.values()].map((r) => r.R.name);
  }
  get full() { return !!(this.box && this.box.full); }

  /* ---------- 选路 ---------- */
  // 正在玩的其他人（来自数据库心跳，带“能不能收实时通道”）；没有数据库时返回 null，照旧只用实时通道
  peers() {
    if (!this.box || !this.box.ok) return null;
    const a = []; for (const m of this.box.members.values()) if (m.id !== this.o.myId && m.pl) a.push(m);
    return a;
  }
  dcOpen(id) { const L = this.links.get(id); return !!(L && L.open); }
  // 能收实时通道、但数据库名单里还没有（或还没标成在玩）的人：刚打过招呼的、或者已经收到过他位置的。这些人要照常走广播，不然会漏消息
  wsUnknown(peers) {
    if (!(this.net && this.net.joined) || !peers) return false;
    const now = performance.now(), known = (id) => peers.some((m) => m.id === id);
    if (this.hiIds) for (const [id, t] of this.hiIds) { if (now - t > 5000 || known(id) || this.dcOpen(id)) this.hiIds.delete(id); else return true; }
    for (const [id, r] of this.remotes) if (!this.dcOpen(id) && !known(id) && now - r.R.lastRecv < 3000 && r.viaWS) return true;
    return false;
  }
  sqn() { return this.o.myId + ':' + Date.now().toString(36) + ':' + (++this.seq); }
  dup(sq) {
    if (typeof sq !== 'string') return false;
    if (this.seen.has(sq)) return true;
    this.seen.add(sq);
    if (this.seen.size > 600) this.seen = new Set([...this.seen].slice(300));
    return false;
  }
  // 发事件：直连的走可靠通道；能收实时通道的人走广播；其余的人走数据库信箱。只要有一条路成功就算发出
  route(ev, p, force) {
    p = Object.assign({}, p, { sq: this.sqn() });
    let ok = false;
    const str = JSON.stringify({ ev, p });
    for (const L of this.links.values()) if (L.open && L.sendR(str)) ok = true;
    const peers = this.peers(), others = peers ? peers.filter((m) => !this.dcOpen(m.id)) : null;
    const ws = !!(this.net && this.net.joined);
    if (!others || others.some((m) => m.ws) || this.wsUnknown(peers)) {
      if (ws) ok = this.net.send(ev, p, force) || ok;
      else if (others && this.box) { this.box.bcast(ev, p); ok = true; }
    }
    if (others && others.some((m) => !m.ws) && this.box) { this.box.signal(null, { ev, p }); ok = true; }
    return ok;
  }
  send(ev, p, force) { return this.route(ev, p, force); }
  // 直连握手信号：一定走数据库信箱；对方能收实时通道时再走一遍广播（更快），重复的按 sq 丢掉
  sendRtc(to, m) {
    const p = Object.assign({ to, i: this.o.myId, sq: this.sqn() }, m);
    const mem = this.box && this.box.members.get(to);
    if (mem && mem.ws) {
      if (this.net && this.net.joined) this.net.send('rtc', p, true);
      else if (this.box) this.box.bcast('rtc', p);
    }
    if (this.box) this.box.signal(to, { ev: 'rtc', p });
  }

  /* ---------- 收 ---------- */
  onWS(ev, m) {
    if (ev === 'rtc') { if (m && m.to === this.o.myId) this.onRtc(m); return; }
    this.onMsg(ev, m);
    if (ev === 's' && m && typeof m.i === 'string') { const r = this.remotes.get(m.i); if (r) r.viaWS = true; }
  }
  // 数据库信箱（已按 id 排序）；发件人以服务器记录为准，防冒充
  onSigs(list) {
    for (const s of list) {
      const pl = s && s.p;
      if (!pl || typeof pl.ev !== 'string' || !pl.p || typeof pl.p !== 'object' || typeof s.f !== 'string') continue;
      const m = Object.assign({}, pl.p, { i: s.f });
      if (pl.ev === 'rtc') { m.to = this.o.myId; this.onRtc(m); } else this.onMsg(pl.ev, m);
    }
  }
  // 数据库中转的位置
  onStates(list) {
    this.relayT = performance.now();
    for (const s of list) if (s && s.p && typeof s.p === 'object' && typeof s.f === 'string') this.onMsg('s', Object.assign({}, s.p, { i: s.f }));
  }
  onDC(L, m) {
    if (typeof m.ev !== 'string' || !m.p || typeof m.p !== 'object' || m.ev === 'rtc') return;
    if (m.ev === 'caps') { if (!window.__noBin) L.peerBin = !!m.p.bin; return; }
    if (m.ev === 'meta') { L.meta = { n: String(m.p.n || '').slice(0, 10), d: Array.isArray(m.p.d) ? m.p.d.slice(0, 4) : [0, 0, 0, 0], k: Array.isArray(m.p.k) ? m.p.k.slice(0, 3) : [0, '', 0] }; return; }
    this.onMsg(m.ev, Object.assign({}, m.p, { i: L.peer }));
  }
  // 紧凑格式的位置：拼上之前收到的名字、板子配置，交给和文字格式同一套处理（还没收到名字时先不显示，免得板子闪一下）
  onBin(L, buf) {
    if (window.__noBin || !L.meta) return;
    const st = decodeState(buf); if (!st) return;
    this.binRx = (this.binRx | 0) + 1;
    this.onMsg('s', Object.assign(st, L.meta, { i: L.peer, iv: 250 }));
  }
  // 名字 / 板子 / 招式：变了才发（可靠通道），另外每 5 秒补发一次
  sendMeta(L, force) {
    const c = this.o.getCfg(), k = this.o.getTrick() || [0, '', 0];
    const meta = { n: this.o.getName(), d: [c.deck, c.grip, c.wheel, c.truck], k };
    const str = JSON.stringify({ ev: 'meta', p: meta }), now = performance.now();
    if (force || str !== L.metaStr || now - (L.metaT || 0) > 5000) { if (L.sendR(str)) { L.metaStr = str; L.metaT = now; } }
  }
  onRtc(m) {
    if (!m || typeof m.i !== 'string' || m.i === this.o.myId || this.dup(m.sq)) return;
    if (!this.playing || !rtcOk()) return;
    let L = this.links.get(m.i);
    if (!L) {
      // 对方 id 小才是发起方（我 id 小时我自己会发起，不接受对方新建）
      if (!(m.i < this.o.myId) || (m.k !== 'offer' && m.k !== 'cand')) return;
      L = this.mkLink(m.i, false);
    }
    L.onSignal(m);
  }
  mkLink(peer, init) {
    const L = new Link(this.o.myId, peer, init, (m) => this.sendRtc(peer, m), {
      onOpen: (L2) => {
        this.fails.delete(peer); this.force = true; this.updStatus();
        // 告诉对方「我认识紧凑格式」，并先把名字、板子这些发过去（旧版不认识这两种消息，会直接忽略）
        if (!window.__noBin) { L2.sendR(JSON.stringify({ ev: 'caps', p: { bin: 1 } })); this.sendMeta(L2, true); }
        L2.checkPath(); setTimeout(() => L2.checkPath(), 1500);
      },
      onClose: (L2, why) => {
        if (this.links.get(peer) === L2) this.links.delete(peer);
        const now = performance.now();
        if (why === 'failed' || why === 'timeout') {
          // 连不上：先用其他路，过一会儿再试（15 秒、30 秒……最多 60 秒）
          const f = this.fails.get(peer) || { n: 0 }; f.n++; f.until = now + Math.min(60000, 15000 * Math.pow(2, f.n - 1)); this.fails.set(peer, f);
        } else this.fails.set(peer, { n: 0, until: now + 3000 });
        this.updStatus();
      },
      onMsg: (L2, m) => this.onDC(L2, m),
      onBin: (L2, b) => this.onBin(L2, b),
    });
    this.links.set(peer, L);
    return L;
  }
  // 和正在玩的每个人都建一条直连（id 小的一方发起）；超时的关掉、走了的人关掉
  syncLinks() {
    const now = performance.now();
    if (!this.playing || !rtcOk()) { for (const L of [...this.links.values()]) L.close('bye'); return; }
    const peers = this.peers(); if (!peers) return;
    const ids = new Set(peers.map((m) => m.id));
    for (const [id, L] of [...this.links]) {
      if (!ids.has(id)) { L.goneT = L.goneT || now; if (now - L.goneT > 8000) { L.close('bye'); continue; } } else L.goneT = 0;
      if (!L.open && now - L.t0 > 15000) L.close('timeout');
    }
    for (const m of peers) {
      if (this.links.has(m.id) || !(this.o.myId < m.id)) continue;
      const f = this.fails.get(m.id); if (f && now < f.until) continue;
      this.mkLink(m.id, true).start();
    }
  }
  updStatus() {
    const ws = !!(this.net && this.net.joined), db = !!(this.box && this.box.ok);
    const s = ws || db ? 'online' : this.full ? 'full' : this.box && this.box.missing ? 'nosql' : 'connecting';
    // 正在用数据库中转（3 秒内用过）而且已经持续 6 秒以上，才提示“网络受限”
    const now = performance.now(), relaying = now - this.relayT < 3000;
    if (!relaying) this.relay0 = 0; else if (!this.relay0) this.relay0 = now;
    const mode = relaying && now - this.relay0 > 6000 ? 'slow' : !ws && db ? 'cn' : '';
    if (s !== this.status || mode !== this.mode) { this.status = s; this.mode = mode; this.o.onStatus && this.o.onStatus(s, mode); }
  }

  onMsg(ev, m) {
    if (!MSG.has(ev) || !m || typeof m !== 'object' || m.i === this.o.myId) return;
    if (ev !== 's' && this.dup(m.sq)) return;
    if (ev === 'bye') { const r = this.remotes.get(m.i); if (r) { this.o.toast && this.o.toast(esc(r.R.name || '玩家') + ' 离开了'); this.remove(m.i); } return; }
    // 有人刚进房间：马上发一次自己的位置，并立刻报到一次（拿到新名单）；名单更新前先照常广播几秒，新来的人不用等
    if (ev === 'hi') { this.force = true; (this.hiIds || (this.hiIds = new Map())).set(m.i, performance.now()); if (this.box) this.box.beatT = 0; return; }
    if (ev === 'e') {
      // 对方的板子暂时没显示（网络卡了几秒）也照样显示表情：在屏幕上方，带名字
      const r = this.remotes.get(m.i), mem = this.box && this.box.members.get(m.i);
      const name = r ? r.R.name : mem ? mem.name : null;
      if (name && typeof m.e === 'string') this.o.fx.emoji(m.e.slice(0, 4), r ? m.i : null, name);
      return;
    }
    if (ev !== 's') { this.o.sk8 && this.o.sk8.msg(ev, m); return; }
    if (typeof m.i !== 'string') return;
    let r = this.remotes.get(m.i);
    const cfg = normBoard(Array.isArray(m.d) ? { deck: m.d[0], grip: m.d[1], wheel: m.d[2], truck: m.d[3] } : { deck: m.d | 0 });
    if (!r) {
      if (this.remotes.size >= 12) return;
      const tag = document.createElement('div'); tag.className = 'tag'; document.getElementById('labels').appendChild(tag);
      r = { R: new Remote(m.i), board: makeBoard(cfg, { noRecv: true }), cfg, tag, wheel: 0, pose: { p: [0, 0, 0], q: new Quaternion() }, trickT: 0, trickText: '' };
      this.o.scene.add(r.board.root); this.remotes.set(m.i, r);
      if (this.playing) this.o.toast && this.o.toast(esc(String(m.n || '玩家').slice(0, 10)) + ' 加入了');
      this.force = true;
    }
    if (!sameBoard(cfg, r.cfg)) { this.o.scene.remove(r.board.root); disposeBoard(r.board); r.board = makeBoard(cfg, { noRecv: true }); r.cfg = cfg; this.o.scene.add(r.board.root); }
    if (typeof m.iv === 'number') r.R.interval = clamp(m.iv, 100, 4000);
    r.R.push(m, performance.now());
    r.R.name = String(m.n || '玩家').slice(0, 10);
    r.R.score = +m.sc || 0;
    if (Array.isArray(m.k) && m.k[0] !== r.R.trickSeq) {
      if (r.R.trickSeq !== -1 && m.k[0]) { r.trickText = String(m.k[1]).slice(0, 40) + '  +' + fmt(+m.k[2] || 0); r.trickT = 2.2; }
      r.R.trickSeq = m.k[0];
    }
    r.tag.innerHTML = esc(r.R.name) + (r.trickT > 0 ? '<i>' + esc(r.trickText) + '</i>' : '');
    this.o.onList && this.o.onList();
  }
  emoji(e) {
    const now = performance.now(); if (now - this.emoT < 1200) return false;
    this.emoT = now;
    this.o.fx.emoji(e, 'me');
    if (this.playing) this.route('e', { i: this.o.myId, e });
    return true;
  }
  // 每帧
  update(dt, now, ctx) {
    const { cam, project, showTags } = ctx;
    for (const [id, r] of this.remotes) {
      if (now - r.R.lastRecv > Math.max(7000, r.R.interval * 3.5)) { this.remove(id); continue; }
      if (!r.R.sample(now, r.pose)) continue;
      const P = this.tmp.set(r.pose.p[0], r.pose.p[1], r.pose.p[2]);
      r.wheel += (r.pose.v * dt) / 0.027;
      const f = r.pose.f || 0, gl = r.pose.m === 0 && f ? Math.max(0, 0.1 * Math.abs(Math.sin(f)) - 0.06 * (1 - Math.cos(f))) : 0; // 落地时板子侧着：抬高一点，轮子不陷进地里
      if (gl) P.y += gl;
      poseBoard(r.board, P, r.pose.q, r.pose.a, r.pose.z * DECK.truckZ, r.pose.f, r.pose.h, r.wheel, r.pose.l || 0, (r.pose.l || 0) * 0.45, 0);
      if (r.trickT > 0) { r.trickT -= dt; if (r.trickT <= 0) r.tag.innerHTML = esc(r.R.name); }
      const [px, py, pz] = project(P.x, P.y + 0.45, P.z), far = P.distanceTo(cam.position) > 70;
      r.screen = pz < 1 ? [px, py] : null;
      if (pz > 1 || far || !showTags) r.tag.style.display = 'none';
      else { r.tag.style.display = ''; r.tag.style.transform = `translate(${px}px,${py}px) translate(-50%,-100%)`; }
    }
    // 每 0.5 秒：整理直连；没有实时通道时开长轮询（只在玩的时候）
    if (now - this.syncT > 500) {
      this.syncT = now;
      this.syncLinks();
      if (now - (this.pathT || 0) > 4000) { this.pathT = now; for (const L of this.links.values()) if (L.open) L.checkPath(); } // 直连路线可能中途换（直连 ↔ 中转）
      if (this.box) {
        const ws = !!(this.net && this.net.joined), peers = this.peers();
        this.box.needPoll = !ws && this.playing;
        this.box.wantStates = !ws && this.playing && !!peers && peers.some((m) => !this.dcOpen(m.id));
      }
      this.updStatus();
    }
    this.sendState(now, ctx);
  }
  sendState(now, ctx) {
    if (!this.playing) return;
    const net = this.net, ws = !!(net && net.joined), box = this.box, db = !!(box && box.ok);
    if (!ws && !db) return;
    const sk = this.o.sk;
    // 速度（按帧差分）：发给对方做曲线补间；一帧跳 2 米以上 = 复位/传送，通知对方别滑过去
    const dtv = this.vT ? (now - this.vT) / 1000 : 0;
    if (this.vP && dtv > 0.003) {
      const dx = sk.p.x - this.vP[0], dy = sk.p.y - this.vP[1], dz = sk.p.z - this.vP[2];
      if (dx * dx + dy * dy + dz * dz > 4) { this.jseq = ((this.jseq | 0) + 1) % 100; this.vel = [0, 0, 0]; this.force = true; }
      else { const v = sk.velWorld ? sk.velWorld(this.tmpV || (this.tmpV = new Vector3())) : null; this.vel = v && isFinite(v.x + v.y + v.z) ? [v.x, v.y, v.z] : [dx / dtv, dy / dtv, dz / dtv]; }
      const tr = Math.abs(angDiff(sk.heading, this.vHd)) / dtv;
      this.turn = (this.turn || 0) * 0.85 + Math.min(tr, 20) * 0.15;
    }
    this.vP = [sk.p.x, sk.p.y, sk.p.z]; this.vT = now; this.vHd = sk.heading;
    // 起跳、落地、上杆、下杆、摔倒：马上补发一条，招式时间点才准
    if (sk.mode !== this.lastMode) { if (this.lastMode) this.modeForce = true; this.lastMode = sk.mode; }
    // 起步 / 停下的一瞬间也补发一条：站着不动时很久才发一次，不补的话对方看到的是「先慢慢挪、再突然全速」
    const movingNow = sk.mode !== 'ground' || sk.s > 0.05;
    if (movingNow !== this.wasMoving) { if (this.wasMoving !== undefined) this.modeForce = true; this.wasMoving = movingNow; }
    const urgent = this.force || this.modeForce;
    const peers = this.peers(), others = peers ? peers.filter((m) => !this.dcOpen(m.id)) : null;
    let payload = null, sent = false;
    const mk = () => {
      if (payload) return payload;
      const q = ctx.q, pitch = ctx.pitch, c = this.o.getCfg(), w = this.vel || [0, 0, 0];
      return (payload = {
        i: this.o.myId, n: this.o.getName(), d: [c.deck, c.grip, c.wheel, c.truck], t: Math.round(now), iv: 250,
        p: [r2(sk.p.x), r2(sk.p.y), r2(sk.p.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)],
        w: [r2(w[0]), r2(w[1]), r2(w[2])], j: this.jseq | 0, ft: r2(sk.flipT), ht: r2(sk.shoveT),
        f: r2(sk.flipA), h: r2(sk.shoveA), a: r2(pitch), z: pitch >= 0 ? -1 : 1, v: r2(sk.speed()), l: r2(ctx.roll || 0),
        m: { ground: 0, air: 1, grind: 2, bail: 3 }[sk.mode], sc: this.o.getScore(), k: this.o.getTrick() || [0, '', 0],
      });
    };
    // 1) 直连（不占 Supabase 额度）：双方都是新版就用紧凑格式（52 字节，原来约 450 字节）
    //    手机之间真直连：每秒 15 次；走了中转服务器（TURN）：每秒 10 次，平地直线滑行时 5 次（中转流量有免费额度）
    const cruiseDC = sk.mode === 'ground' && !sk.manual && !sk.slide && sk.n.y > 0.985 && (this.turn || 0) < 0.6;
    let str = null, bin = null;
    for (const L of this.links.values()) {
      if (!L.open) continue;
      const gap = L.relayed ? (cruiseDC ? 200 : 100) : 66;
      if (!(now - (L.lastS || 0) >= gap || (urgent && now - (L.lastS || 0) >= 30))) continue;
      let ok;
      if (L.peerBin) { if (!bin) bin = encodeState(mk()); ok = L.sendU(bin); this.sendMeta(L, false); }
      else { if (!str) str = JSON.stringify({ ev: 's', p: mk() }); ok = L.sendU(str); }
      if (ok) { L.lastS = now; L.txB = (L.txB | 0) + (L.peerBin ? bin.byteLength : str.length); L.txN = (L.txN | 0) + 1; }
      this.lastDC = now; sent = true;
    }
    // 2) 实时通道广播：给没有直连、但能收实时通道的人（没有数据库信息时照旧广播）。频率按人数省额度
    const needB = (others ? others.some((m) => m.ws) : ws) || this.wsUnknown(peers);
    if (needB) {
      const N = (peers ? peers.length : this.remotes.size) + 1;
      let hz = N === 1 ? 0.25 : clamp(32 / (N * N), 0.5, 4);
      const moving = movingNow;
      const cruise = sk.mode === 'ground' && !sk.manual && !sk.slide && sk.n.y > 0.985 && (this.turn || 0) < 0.6;
      if (!moving) hz = Math.min(hz, 0.5);
      else if (cruise) hz = Math.max(hz * 0.6, Math.min(hz, 0.5));
      if (!ws) hz = Math.min(hz, 4); // 自己连不上实时通道时用 HTTP 广播
      if ((urgent && now - this.lastSend >= 60) || now - this.lastSend >= 1000 / hz) {
        let ok;
        if (ws) ok = net.send('s', mk());
        else { box.bcast('s', mk(), true); ok = true; }
        if (ok) { this.lastSend = now; sent = true; }
      }
    }
    // 3) 数据库中转：给既没有直连、又收不到实时通道的人，每秒 5 次（画面会延迟一点）
    const needR = !!others && db && others.some((m) => !m.ws);
    if (needR && (now - this.lastRelay >= 200 || (urgent && now - this.lastRelay >= 120))) {
      box.putState(mk()); this.lastRelay = now; this.relayT = now; sent = true;
    }
    if (sent || (peers && !peers.length)) { this.force = false; this.modeForce = false; }
  }
}
