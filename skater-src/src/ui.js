// 界面：菜单 / 设置 / 改装 / 挑战 / 排行榜 / 对战面板 / 提示
import { DECKS, deckSwatch, GRIPS, grip, WHEELS, TRUCKS } from './textures.js';
import { CHALLENGES, UNLOCK } from './tricks.js';
import { MAPS } from './maps.js';
import { store, fmt } from './util.js';
import { Aud } from './audio.js';

export const $ = (id) => document.getElementById(id);
export const show = (id, on) => $(id).classList.toggle('hide', !on);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const settings = Object.assign({ easy: false, q: 2, time: 'auto', flick: 3, steer: 3, music: true, sfx: true, dots: true }, store.get('settings', {}));
// 画质只由玩家决定（旧版本存的“自动”= -1，统一换成“高”）
if (![0, 1, 2, 3].includes(settings.q)) settings.q = 2;
export const Q_NAME = ['低', '中', '高', '极高'];
const Q_NOTE = ['最省电：没有影子，分辨率最低', '有影子，分辨率中等', '推荐：清晰的影子和画面', '手机原生分辨率，最清晰，也更耗电发热'];
export function saveSettings() { store.set('settings', settings); }
const segPaint = {};
// 代码里改了设置（比如卡顿提示里点了“调低画质”）后，让设置面板同步显示
export function refreshSetting(key) { if (segPaint[key]) segPaint[key](); }
export const sens = () => ({ flick: [1.5, 1.22, 1, 0.82, 0.66][settings.flick - 1] || 1, steer: [0.6, 0.8, 1, 1.25, 1.5][settings.steer - 1] || 1 });

let toastTimer = 0;
export function toast(html, color, ms) {
  const e = $('toast'); e.innerHTML = html; e.style.color = color || '#fff'; e.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('on'), ms || 1000);
}
export function setCombo(c) {
  const n = $('cNames'), p = $('cPts');
  if (!c || !c.list.length) { n.textContent = ''; p.textContent = ''; return; }
  const names = c.list.slice(-3).map((e) => e.name + (e.live ? ' …' : ''));
  n.innerHTML = esc((c.list.length > 3 ? '… + ' : '') + names.join(' + '));
  p.textContent = fmt(c.base) + (c.mult > 1 ? '  ×' + c.mult : '');
}
const LOG = [];
export function logCombo(names, pts) {
  LOG.unshift({ t: names.slice(-2).join(' + ') + (names.length > 2 ? ' …' : ''), p: pts });
  if (LOG.length > 3) LOG.pop();
  $('log').innerHTML = LOG.map((e) => `<div><b>+${fmt(e.p)}</b> ${esc(e.t)}</div>`).join('');
}
export function clearLog() { LOG.length = 0; $('log').innerHTML = ''; }
export function setMeter(on, a) {
  show('meter', on);
  if (!on) return;
  const H = 150, max = 1.15, y = (v) => H - (Math.min(v, max) / max) * H;
  $('mZone').style.top = y(0.9) + 'px'; $('mZone').style.height = (y(0.3) - y(0.9)) + 'px';
  $('mBad').style.height = y(1.05) + 'px';
  $('mNdl').style.top = (y(a) - 2) + 'px';
}
export function setHint(t) { const h = $('hint'); h.textContent = t || ''; h.style.opacity = t ? 1 : 0; }

/* ---------- 挑战 ---------- */
export const chalDone = new Set(store.get('chal', []));
export function chalCount() { return chalDone.size + '/' + CHALLENGES.length; }
const chalQ = [];
function nextChalToast() {
  if (!chalQ.length) return;
  toast('挑战完成 ✓<small>' + esc(chalQ[0]) + '</small>', '#7dff9b', 1700);
  Aud.done();
  setTimeout(() => { chalQ.shift(); nextChalToast(); }, 1900);
}
export function completeChal(id) {
  if (chalDone.has(id)) return false;
  const c = CHALLENGES.find((x) => x.id === id); if (!c) return false;
  const before = unlockedCount();
  chalDone.add(id); store.set('chal', [...chalDone]);
  chalQ.push(c.t); if (chalQ.length === 1) nextChalToast();
  if (unlockedCount() > before) { chalQ.push('解锁了新的改装！去主菜单「改装滑板」看看'); }
  refreshChal();
  return true;
}
export function refreshChal() {
  $('chCount').textContent = chalCount(); $('chCount2').textContent = chalCount();
  $('chList').innerHTML = CHALLENGES.map((c) => `<div class="ch ${chalDone.has(c.id) ? 'ok' : ''}"><div class="ck">${chalDone.has(c.id) ? '✓' : ''}</div><span>${esc(c.t)}</span></div>`).join('');
}
export const isUnlocked = (k, i) => chalDone.size >= (UNLOCK[k][i] || 0);
function unlockedCount() { let n = 0; for (const k in UNLOCK) UNLOCK[k].forEach((v) => { if (chalDone.size >= v) n++; }); return n; }

/* ---------- 设置面板 ---------- */
export function bindSettings(apply) {
  const tg = (id, key) => {
    const el = $(id); el.classList.toggle('on', !!settings[key]);
    el.onclick = () => { settings[key] = !settings[key]; el.classList.toggle('on', settings[key]); saveSettings(); apply(key); Aud.click(); };
  };
  tg('sEasy', 'easy'); tg('sMus', 'music'); tg('sSfx', 'sfx'); tg('sDots', 'dots');
  const seg = (id, key, num) => {
    const el = $(id), paint = () => { [...el.children].forEach((s) => s.classList.toggle('on', String(settings[key]) === s.dataset.v)); if (key === 'q') $('sQNote').textContent = Q_NOTE[settings.q] || ''; };
    paint(); segPaint[key] = paint;
    [...el.children].forEach((s) => (s.onclick = () => { settings[key] = num ? +s.dataset.v : s.dataset.v; paint(); saveSettings(); apply(key); Aud.click(); }));
  };
  seg('sQ', 'q', true); seg('sTime', 'time', false);
  for (const [id, key] of [['sFlick', 'flick'], ['sSteer', 'steer']]) { const r = $(id); r.value = settings[key]; r.oninput = () => { settings[key] = +r.value; saveSettings(); apply(key); }; }
}

/* ---------- 地图选择 ---------- */
export function buildMapChips(box, cur, onPick) {
  box.innerHTML = '';
  box.style.display = MAPS.length > 1 ? '' : 'none'; // 只有一张地图时不用选
  for (const m of MAPS) {
    const d = document.createElement('div'); d.className = 'chip' + (m.id === cur ? ' on' : ''); d.innerHTML = esc(m.name) + '<small>' + esc(m.desc) + '</small>';
    d.onclick = () => { [...box.children].forEach((c) => c.classList.remove('on')); d.classList.add('on'); onPick(m.id); Aud.click(); };
    box.appendChild(d);
  }
}

/* ---------- 改装 ---------- */
const gripThumb = [];
function gripSwatch(i) {
  if (gripThumb[i]) return gripThumb[i];
  const t = grip(i), c = document.createElement('canvas'); c.width = 160; c.height = 50; const x = c.getContext('2d');
  x.save(); x.translate(80, 25); x.rotate(-Math.PI / 2); x.drawImage(t.image, -25, -80, 50, 160); x.restore(); t.dispose();
  return (gripThumb[i] = c.toDataURL());
}
const deckThumb = [];
export function buildGarage(cfg, tab, onPick) {
  const grid = $('gGrid'); grid.innerHTML = '';
  [...$('gTabs').children].forEach((s) => s.classList.toggle('on', s.dataset.k === tab));
  const list = tab === 'deck' ? DECKS : tab === 'grip' ? GRIPS : tab === 'wheel' ? WHEELS : TRUCKS;
  list.forEach((it, i) => {
    const d = document.createElement('div'); d.className = 'gi' + (cfg[tab] === i ? ' on' : '');
    if (tab === 'deck') d.innerHTML = `<img src="${deckThumb[i] || (deckThumb[i] = deckSwatch(i, 192, 60))}">`;
    else if (tab === 'grip') d.innerHTML = `<img src="${gripSwatch(i)}">`;
    else if (tab === 'wheel') d.innerHTML = `<div class="sw2" style="background:${it}"></div>`;
    else d.innerHTML = `<div class="sw2" style="background:#${it.c.toString(16).padStart(6, '0')}"></div>`;
    const need = UNLOCK[tab][i] || 0;
    if (chalDone.size < need) { const l = document.createElement('div'); l.className = 'lock'; l.innerHTML = `<b>🔒</b>完成 ${need} 个挑战`; d.appendChild(l); }
    d.onclick = () => { if (chalDone.size < need) { toast('完成 ' + need + ' 个挑战解锁（现在 ' + chalDone.size + ' 个）', '#fff', 1300); return; } onPick(tab, i); Aud.click(); };
    grid.appendChild(d);
  });
  $('gNote').textContent = '已完成 ' + chalDone.size + ' 个挑战 · 完成更多挑战解锁更多改装';
}

/* ---------- 排行榜 ---------- */
export function renderBoard(res, myName) {
  const L = $('lbList'), N = $('lbNote');
  if (!res) { L.innerHTML = ''; N.textContent = '加载中…'; return; }
  if (res.missing) { L.innerHTML = ''; N.textContent = '排行榜还没开通：需要在 Supabase 运行一次排行榜的 SQL。'; return; }
  if (res.error || !Array.isArray(res.data)) { L.innerHTML = ''; N.textContent = '读取失败，稍后再试'; return; }
  if (!res.data.length) { L.innerHTML = ''; N.textContent = '还没有人上榜，去限时赛拿第一吧！'; return; }
  L.innerHTML = res.data.map((r, i) => `<div class="ch"><span>${i + 1}. ${esc(r.n)}${r.n === myName ? '（你）' : ''}</span><b>${fmt(r.s)}</b></div>`).join('');
  N.textContent = '每个名字只显示最好成绩';
}

/* ---------- S.K.A.T.E. 面板 ---------- */
export function renderSk8(v) {
  show('inv', v.kind === 'invite' && !v.joined);
  show('lobby', v.kind === 'lobby');
  show('sk8', v.kind === 'game');
  if (v.kind === 'invite') $('invT').textContent = v.host + ' 发起了 S.K.A.T.E. 对战';
  if (v.kind === 'lobby') $('lobbyS').textContent = '已加入：' + v.names.join('、') + (v.names.length < 2 ? '（等朋友点“加入”）' : '');
  if (v.kind === 'game') {
    const L = (n) => [...'SKATE'].map((c, i) => (i < n ? c : `<i>${c}</i>`)).join('');
    $('sk8').innerHTML = v.rows.map((r) => `<div class="r ${r.turn ? 'turn' : ''} ${r.out ? 'out' : ''}"><span>${r.turn ? '▶ ' : ''}${esc(r.name)}</span><span class="L">${L(r.letters)}</span></div>`).join('') +
      `<div class="m ${v.mine ? 'mine' : ''}">${esc(v.msg)}${v.over ? '' : ` <span class="small">${v.left}s</span>`}</div>` + (v.last ? `<div class="lst">${esc(v.last)}</div>` : '') +
      (v.over ? '<button class="btn" id="sk8Close" style="padding:8px">关闭</button>' : v.host ? '<button class="btn" id="sk8Stop" style="padding:8px;font-size:13px">结束对战</button>' : '');
  }
}

/* ---------- 图标（极简：深色底 + 斜放的板 + 两个手指点） ---------- */
