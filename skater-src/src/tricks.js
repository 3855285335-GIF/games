// 招式命名、计分、连击
const sum = (a) => a.reduce((s, x) => s + x, 0);

export function flipName(flips, shoves) {
  const k = sum(flips), sh = sum(shoves), nk = Math.abs(k), ns = Math.abs(sh);
  if (nk === 0) {
    if (ns === 0) return null;
    if (ns === 1) return { name: sh < 0 ? 'Pop Shove-it' : 'FS Shove-it', pts: 80 };
    if (ns === 2) return { name: sh < 0 ? '360 Shove-it' : 'FS 360 Shove-it', pts: 190 };
    return { name: ns * 180 + ' Shove-it', pts: 110 * ns };
  }
  const kick = k < 0, bs = sh < 0;
  const pre = nk === 2 ? 'Double ' : nk === 3 ? 'Triple ' : nk === 4 ? 'Quad ' : nk >= 5 ? nk + 'x ' : ''; // 圈数没有上限
  let n;
  if (ns === 0) n = kick ? 'Kickflip' : 'Heelflip';
  else if (ns === 1) n = kick ? (bs ? 'Varial Kickflip' : 'Hardflip') : (bs ? 'Inward Heelflip' : 'Varial Heelflip');
  else if (ns === 2) n = kick ? (bs ? '360 Flip' : '360 Hardflip') : (bs ? '360 Inward Heel' : 'Laser Flip');
  else n = (kick ? 'Kickflip ' : 'Heelflip ') + ns * 180;
  return { name: pre + n, pts: 100 * nk + 95 * ns + (ns ? 60 : 0) + (nk >= 2 ? 90 * (nk - 1) : 0) };
}

// 一次落地对应的空中招式；没有招式返回 null
export function airTrick(info) {
  const a = info.air;
  let f = flipName(info.flips, info.shoves), name, pts;
  // Impossible：板子竖着绕后脚翻一圈（可以和翻板、转板一起做）
  const ni = info.imp | 0;
  if (ni) { const pre = ni === 2 ? 'Double ' : ni >= 3 ? ni + 'x ' : ''; f = f ? { name: pre + 'Impossible ' + f.name, pts: f.pts + 260 * ni } : { name: pre + 'Impossible', pts: 240 * ni }; }
  if (f) { name = f.name; pts = f.pts; }
  else if (a.popped) { name = 'Ollie'; pts = 50; }
  else if (a.fromTrans && info.above > 0.15) { name = 'Air'; pts = 60; }
  else if (a.fromGrind) { name = null; pts = 0; }
  else { name = null; pts = 0; }
  // 从杆上翻下来（Flip out）：在杆上就拨好、起跳下杆的同时翻
  if (f && a.fromGrind && a.popped) { name += ' Out'; pts += 90; }
  if (name && a.popped && !a.fromGrind) {
    if (a.pop === 'nose') { name = name === 'Ollie' ? 'Nollie' : 'Nollie ' + name; pts += 40; }
    else if (a.fakie) { name = 'Fakie ' + name; pts += 30; }
  }
  const sp = Math.abs(info.spin), n = Math.round(sp / Math.PI);
  if (n >= 1 && Math.abs(sp - n * Math.PI) < 0.65) {
    const deg = n * 180;
    name = (info.spin > 0 ? 'BS ' : 'FS ') + deg + ' ' + (name || 'Spin');
    pts += [0, 100, 250, 450, 700, 1000][Math.min(n, 5)] + (n > 5 ? (n - 5) * 300 : 0);
  } else if (!name) return null;
  pts += Math.round(Math.max(0, info.t - 0.55) * 140);
  if (info.above > 0.2) pts += Math.round(info.above * 180);
  if (info.quality === 'sketchy') pts *= 0.7;
  else if (info.quality === 'clean') pts *= 1.1;
  return { name, pts: Math.round(pts) };
}

export const GRIND_RATE = { '50-50': 150, '5-0': 190, 'Nosegrind': 210, 'Crooked': 220, 'Boardslide': 180, 'Lipslide': 190, 'Nose Stall': 130, 'Tail Stall': 120 };

export class Combo {
  constructor(cb) { this.cb = cb || {}; this.total = 0; this.clear(); }
  clear() { this.list = []; this.live = null; this.grace = 0; this.active = false; }
  get base() { return this.list.reduce((s, e) => s + e.pts, 0); }
  get mult() { return Math.max(1, new Set(this.list.map((e) => e.name)).size); }
  add(name, pts) {
    this.list.push({ name, pts }); this.active = true; this.grace = 0.8;
    this.cb.onChange && this.cb.onChange(this);
  }
  startLive(name, rate, kind) {
    this.endLive();
    const e = { name, pts: kind === 'grind' ? 60 : 0, rate, live: true, kind };
    this.list.push(e); this.live = e; this.active = true; this.grace = 0.8;
    this.cb.onChange && this.cb.onChange(this);
  }
  endLive() { if (this.live) { this.live.live = false; this.live.pts = Math.round(this.live.pts); this.live = null; this.grace = 0.8; } }
  // 太短的 Manual（比如放手指时一瞬间只按了板尾）不算招式
  cancelLive() {
    if (!this.live) return;
    const i = this.list.indexOf(this.live); if (i >= 0) this.list.splice(i, 1);
    this.live = null;
    if (!this.list.length) this.clear();
    this.cb.onChange && this.cb.onChange(this);
  }
  tick(dt, sk) {
    if (!this.active) return;
    if (this.live) {
      if (this.live.kind !== 'manual' || sk.s > 0.5) this.live.pts += this.live.rate * dt;
      this.cb.onChange && this.cb.onChange(this);
      return;
    }
    if (sk.mode === 'ground' && !sk.manual) {
      this.grace -= dt;
      if (this.grace <= 0) this.bank();
    } else if (sk.mode !== 'bail') this.grace = 0.8;
  }
  bank() {
    if (!this.list.length) { this.clear(); return; }
    this.endLive();
    const base = this.base, mult = this.mult, pts = Math.round(base * mult);
    this.total += pts;
    const names = this.list.map((e) => e.name);
    this.clear();
    this.cb.onBank && this.cb.onBank(pts, mult, names, base);
    this.cb.onChange && this.cb.onChange(this);
  }
  lose() {
    const had = this.list.length > 0;
    this.clear();
    if (had) this.cb.onLose && this.cb.onLose();
    this.cb.onChange && this.cb.onChange(this);
  }
}

// 挑战（完成后保存在本机）
export const CHALLENGES = [
  // 力度：划得轻 / 重、拨得轻 / 重，结果不一样（带 ★ 的是第 4 步以后加的）
  { id: 'speed', t: '推板加速到 20 km/h' },
  { id: 'ollie', t: '完成一个 Ollie' },
  { id: 'ollieLow', t: '★ 轻轻一划：小 Ollie（不到 0.6 米高）' },
  { id: 'high', t: 'Ollie 高度超过 0.7 米' },
  { id: 'high1', t: '★ 用力一划：Ollie 超过 1 米高' },
  { id: 'kick', t: '完成 Kickflip' },
  { id: 'perfect', t: '★ 踩点：板子刚转完的那一刻接住' },
  { id: 'heel', t: '完成 Heelflip' },
  { id: 'shove', t: '完成 Pop Shove-it' },
  { id: 'shove360', t: '★ 用力侧拨：360 Shove-it' },
  { id: 'double', t: '★ 用力拨：Double Kickflip（翻两圈）' },
  { id: 'triple', t: '★ 跳高再狠狠一拨：Triple Kickflip（翻三圈）' },
  { id: 'grindTurn', t: '★ 磨杆时后指侧划：在杆上转成 Boardslide' },
  { id: 'flipOut', t: '★ 在杆上拨板再起跳：Kickflip Out' },
  { id: 'stall', t: '★ Stall：只按前指（或后指），板头卡在台边停 1 秒' },
  { id: 'impossible', t: '★ 两指一起往板尾划：Impossible' },
  { id: 'aiWin', t: '★ 和电脑玩 S.K.A.T.E. 赢一次' },
  { id: 'stairs5', t: '在小公园跳下 5 级台阶' },
  { id: 'varial', t: '完成 Varial Kickflip' },
  { id: 'tre', t: '完成 360 Flip' },
  { id: 'nollie', t: '完成任意 Nollie 招式' },
  { id: 'spin', t: '空中转体 360°' },
  { id: 'grind', t: '50-50 磨杆超过 2 秒' },
  { id: 'ledgeFull', t: '★ 一口气滑完整根长台（10 米）' },
  { id: 'slide', t: '完成 Boardslide' },
  { id: 'hand', t: '在台阶扶手上磨下去' },
  { id: 'manual', t: 'Manual 保持 3 秒' },
  { id: 'manualPad', t: '★ 在 Manual 台上从头翘到尾（压板力度要稳）' },
  { id: 'vert', t: '四分之一管飞出唇边 1.2 米' },
  { id: 'powerslide', t: '完成 Powerslide（两指一起横甩）' },
  { id: 'stairs', t: '从台阶顶上跳下去并落地' },
  { id: 'combo', t: '一次连击拿到 3000 分' },
  { id: 'combo5', t: '一次连击包含 5 个不同招式' },
  { id: 'timed', t: '限时赛拿到 15000 分' },
  { id: 'run', t: '★ 连续模式：摔之前拿到 5000 分' },
  { id: 'practice', t: '完成练习模式' },
  { id: 'skatewin', t: '赢一局 S.K.A.T.E. 对战' },
];
// 完成多少个挑战解锁对应的改装
export const UNLOCK = { deck: [0, 0, 0, 0, 3, 6, 10, 15], grip: [0, 0, 2, 5, 8, 12], wheel: [0, 0, 0, 0, 1, 4, 7, 11], truck: [0, 0, 3, 9, 14] };
