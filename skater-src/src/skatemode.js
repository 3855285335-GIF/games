// S.K.A.T.E. 对战（房主做裁判）：轮流出招，出招的人落地成功后，其他人要照做；做不出来记一个字母，拼满 SKATE 出局
const WORD = 'SKATE', ACT_TIME = 45000;
const rid = () => Math.random().toString(36).slice(2, 9);

export class Sk8 {
  constructor(h) { this.h = h; this.state = null; this.lobby = null; this.invite = null; this.pend = null; this.lastState = 0; this.lastBc = 0; }
  get me() { return this.h.myId(); }
  active() { return !!(this.state && this.state.phase !== 'over' && this.state.order.includes(this.me)); }
  /* ---------- 房主 ---------- */
  host() {
    if (this.state && this.state.phase !== 'over') return;
    if (this.h.players().length < 2) { this.h.toast('房间里至少要 2 个人才能对战'); return; }
    this.state = null;
    this.lobby = { gid: rid(), joined: { [this.me]: this.h.myName() } };
    this.h.send('gi', { gid: this.lobby.gid, h: this.me, hn: this.h.myName() }, true);
    this.ui();
  }
  start() {
    const L = this.lobby; if (!L) return;
    const ids = Object.keys(L.joined); if (ids.length < 2) { this.h.toast('还没有人加入'); return; }
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const letters = {}; for (const id of ids) letters[id] = 0;
    this.state = { gid: L.gid, host: this.me, order: ids, names: L.joined, letters, setter: ids[0], phase: 'set', trick: null, copier: null, queue: [], n: 1, until: Date.now() + ACT_TIME, winner: null, last: '' };
    this.lobby = null;
    this.bc(); this.ui();
  }
  cancel() {
    const gid = (this.lobby && this.lobby.gid) || (this.state && this.state.gid);
    if (gid) this.h.send('gx', { gid }, true);
    this.lobby = null; this.state = null; this.pend = null; this.ui();
  }
  bc() { if (this.state && this.state.host === this.me) { this.lastBc = Date.now(); this.h.send('gs', this.state, true); } }
  alive() { return this.state.order.filter((id) => this.state.letters[id] < WORD.length); }
  nextAlive(after) { const o = this.state.order, i = o.indexOf(after); for (let k = 1; k <= o.length; k++) { const id = o[(i + k) % o.length]; if (this.state.letters[id] < WORD.length) return id; } return after; }
  apply(id, res) {
    const S = this.state; if (!S || S.phase === 'over') return;
    const nm = (x) => S.names[x] || '玩家';
    if (S.phase === 'set' && id === S.setter) {
      if (res.ok && res.trick) {
        S.trick = res.trick; S.phase = 'copy';
        S.queue = []; let c = S.setter; for (let k = 0; k < S.order.length; k++) { c = this.nextAlive(c); if (c === S.setter) break; S.queue.push(c); }
        S.copier = S.queue.shift() || null; S.last = nm(id) + ' 出了 ' + res.trick;
        if (!S.copier) { S.phase = 'set'; S.trick = null; }
      } else { S.last = nm(id) + (res.timeout ? ' 超时了' : ' 没做成') + '，换人出招'; S.setter = this.nextAlive(S.setter); S.trick = null; }
    } else if (S.phase === 'copy' && id === S.copier) {
      if (res.ok) S.last = nm(id) + ' 照做成功';
      else { S.letters[id]++; S.last = nm(id) + (res.timeout ? ' 超时' : ' 没做成') + '，得到字母 ' + WORD[S.letters[id] - 1]; }
      S.copier = S.queue.shift() || null;
      while (S.copier && S.letters[S.copier] >= WORD.length) S.copier = S.queue.shift() || null;
      if (!S.copier) { S.phase = 'set'; S.trick = null; }
    } else return;
    const al = this.alive();
    if (al.length <= 1) { S.phase = 'over'; S.winner = al[0] || null; S.copier = null; }
    S.n++; S.until = Date.now() + ACT_TIME;
    this.bc(); this.ui();
    if (S.phase === 'over' && S.winner === this.me) this.h.win && this.h.win();
  }
  /* ---------- 收到的消息 ---------- */
  msg(ev, m) {
    if (!m || typeof m !== 'object') return;
    if (ev === 'gi') { if (!this.active() && !this.lobby && m.h !== this.me) { this.invite = { gid: m.gid, h: m.h, hn: String(m.hn || '玩家').slice(0, 10), t: Date.now() }; this.ui(); } }
    else if (ev === 'gj') { if (this.lobby && m.gid === this.lobby.gid && typeof m.i === 'string') { this.lobby.joined[m.i] = String(m.n || '玩家').slice(0, 10); this.ui(); } }
    else if (ev === 'gs') {
      if (!Array.isArray(m.order) || !m.letters || typeof m.gid !== 'string') return;
      if (this.state && this.state.host === this.me) return;
      const mine = m.order.includes(this.me), cur = this.state && this.state.gid === m.gid;
      if (!mine && !cur) return;
      const prevN = this.state && this.state.gid === m.gid ? this.state.n : -1;
      this.state = m; this.lastState = Date.now(); this.invite = null;
      if (this.pend && (m.n !== this.pend.n || m.gid !== this.pend.gid)) this.pend = null;
      if (m.n !== prevN) { this.ui(); if (m.phase === 'over' && m.winner === this.me) this.h.win && this.h.win(); }
    } else if (ev === 'ga') {
      const S = this.state; if (!S || S.host !== this.me || m.gid !== S.gid || m.n !== S.n || typeof m.i !== 'string') return;
      this.apply(m.i, { ok: !!m.ok, trick: typeof m.trick === 'string' ? m.trick.slice(0, 48) : null, timeout: !!m.to });
    } else if (ev === 'gx') {
      if ((this.state && this.state.gid === m.gid) || (this.invite && this.invite.gid === m.gid)) { const had = !!this.state; this.state = null; this.invite = null; this.pend = null; if (had) this.h.toast('对战已取消'); this.ui(); }
    }
  }
  join() {
    const iv = this.invite; if (!iv) return;
    this.h.send('gj', { gid: iv.gid, i: this.me, n: this.h.myName() }, true);
    this.invite = { ...iv, joined: true }; this.ui();
  }
  decline() { this.invite = null; this.ui(); }
  /* ---------- 自己的尝试 ---------- */
  myTurn() {
    const S = this.state; if (!S || S.phase === 'over') return null;
    if (S.phase === 'set' && S.setter === this.me) return 'set';
    if (S.phase === 'copy' && S.copier === this.me) return 'copy';
    return null;
  }
  attempt(trick, bailed) {
    const turn = this.myTurn(); if (!turn || this.pend) return;
    if (!bailed && !trick) return; // 没有招式的落地不算
    const S = this.state;
    const res = { ok: !bailed && (turn === 'set' ? true : trick === S.trick), trick: bailed ? null : trick };
    if (S.host === this.me) this.apply(this.me, res);
    else { this.pend = { gid: S.gid, n: S.n, ok: res.ok, trick: res.trick, t: 0 }; this.h.send('ga', { gid: S.gid, i: this.me, n: S.n, ok: res.ok, trick: res.trick }, true); }
  }
  tick() {
    const now = Date.now(), S = this.state;
    if (this.invite && !this.invite.joined && now - this.invite.t > 20000) { this.invite = null; this.ui(); }
    if (this.pend && now - this.pend.t > 1500) { this.pend.t = now; this.h.send('ga', { gid: this.pend.gid, i: this.me, n: this.pend.n, ok: this.pend.ok, trick: this.pend.trick }, true); }
    if (!S || S.phase === 'over') return;
    if (S.host === this.me) {
      // 掉线的人直接出局；超时算失败；每 3 秒重发一次状态
      const here = new Set(this.h.players().map((p) => p.id));
      let changed = false;
      for (const id of S.order) if (!here.has(id) && S.letters[id] < WORD.length) { S.letters[id] = WORD.length; changed = true; }
      if (changed) {
        if (S.letters[S.setter] >= WORD.length) { S.setter = this.nextAlive(S.setter); S.phase = 'set'; S.trick = null; }
        if (S.copier && S.letters[S.copier] >= WORD.length) { S.copier = S.queue.shift() || null; if (!S.copier) { S.phase = 'set'; S.trick = null; } }
        const al = this.alive(); if (al.length <= 1) { S.phase = 'over'; S.winner = al[0] || null; }
        S.n++; this.bc(); this.ui(); return;
      }
      if (now > S.until) { const who = S.phase === 'set' ? S.setter : S.copier; if (who) this.apply(who, { ok: false, timeout: true }); return; }
      if (now - this.lastBc > 3000) this.bc();
    } else if (now - this.lastState > 12000) { this.state = null; this.pend = null; this.h.toast('对战中断：房主离开了'); this.ui(); }
  }
  ui() { this.h.ui(this.view()); }
  view() {
    const S = this.state, me = this.me;
    if (this.lobby) return { kind: 'lobby', names: Object.values(this.lobby.joined) };
    if (S) {
      const nm = (x) => (x === me ? '你' : S.names[x] || '玩家');
      const rows = S.order.map((id) => ({ name: nm(id), letters: S.letters[id], out: S.letters[id] >= WORD.length, turn: id === (S.phase === 'set' ? S.setter : S.copier) }));
      let msg;
      if (S.phase === 'over') msg = S.winner === me ? '你赢了！' : (nm(S.winner) + ' 赢了！');
      else if (S.phase === 'set') msg = S.setter === me ? '轮到你出招：做一个招式，落地成功才算' : '等 ' + nm(S.setter) + ' 出招…';
      else msg = S.copier === me ? '轮到你照做：' + S.trick : '等 ' + nm(S.copier) + ' 照做 ' + S.trick + '…';
      const left = Math.max(0, Math.ceil((S.until - Date.now()) / 1000));
      return { kind: 'game', rows, msg, last: S.last, over: S.phase === 'over', mine: !!this.myTurn(), left, host: S.host === me, waiting: !!this.pend };
    }
    if (this.invite) return { kind: 'invite', host: this.invite.hn, joined: !!this.invite.joined };
    return { kind: 'none' };
  }
}
