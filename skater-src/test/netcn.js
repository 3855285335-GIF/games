// 国内模式联机专项：全员连不上实时通道 / 直连不可用走中转 / 有人开 VPN 有人没开 / 请求卡住自动恢复 / 没运行 SQL
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const waitFor = async (fn, ms, step = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return { v, t: Date.now() - t0 }; await sleep(step); } return null; };

(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const M = await L.mock(ctx); const errs = [];
  const mk = async (name, room, flags) => {
    const p = await ctx.newPage(); L.errs(p, errs, name + ': ');
    await p.addInitScript((f) => { localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: true, music: false, sfx: false, dots: false, time: 'day' })); if (f.noWS) window.__noWS = true; if (f.noRTC) window.__noRTC = true; }, flags || {});
    await p.goto(L.URL); await p.waitForTimeout(1000); await p.evaluate(() => { window.__noRender = true; });
    await p.fill('#inName', name); await p.fill('#inRoom', room); await p.evaluate(() => document.getElementById('inRoom').dispatchEvent(new Event('change')));
    await p.tap('#mFree'); p.nm = name; return p;
  };
  const info = (p) => p.evaluate(() => { const o = __dbg.online; return { id: o.o.myId, remotes: [...o.remotes.values()].map((r) => r.R.name).sort().join(','), links: [...o.links.values()].filter((L) => L.open).length, net: document.getElementById('net').textContent, mode: o.mode }; });
  const seesAll = (p, names) => async () => { const i = await info(p); return names.every((n) => i.remotes.split(',').includes(n)) ? i : null; };
  // 在 B 的画面里记录 A 的板子位置（每次游戏更新后），看更新是否连续
  const track = (B) => B.evaluate(() => { window.__trk = []; const o = __dbg.online, u = o.update.bind(o); o.update = (dt, now, c) => { u(dt, now, c); const r = [...o.remotes.values()][0]; if (r && __trk.length < 300) __trk.push([r.board.root.position.x, r.board.root.position.z, now, r.R.snaps.length ? r.R.snaps[r.R.snaps.length - 1].t : 0]); }; });
  const rate = async (B) => { const t = await B.evaluate(() => __trk); const ts = [...new Set(t.map((x) => x[3]))]; const span = (ts[ts.length - 1] - ts[0]) / 1000; return { hz: span > 0 ? +((ts.length - 1) / span).toFixed(1) : 0, n: t.length }; };
  const wsB = () => Object.values(M.log.ev).reduce((a, b2) => a + b2, 0) + Object.values(M.log.hev).reduce((a, b2) => a + b2, 0);
  const circle = async (p) => { await p.evaluate(() => { const sk = __dbg.sk; sk.reset(-6, -14, 0); sk.s = 3; }); await p.keyboard.down('KeyW'); await p.keyboard.down('KeyD'); };

  // ---------- 1 全员国内：实时通道都连不上 → 数据库牵线 + 玩家直连 ----------
  {
    const b0 = wsB();
    const A = await mk('甲', '国内1', { noWS: true }), B = await mk('乙', '国内1', { noWS: true }), C = await mk('丙', '国内1', { noWS: true });
    const r = await waitFor(async () => (await seesAll(A, ['乙', '丙'])()) && (await seesAll(B, ['甲', '丙'])()) && (await seesAll(C, ['甲', '乙'])()), 25000);
    ok(!!r, `1a 三个人都连不上实时通道，互相看见用了 ${r ? (r.t / 1000).toFixed(1) : '超时'} 秒`);
    const l = await waitFor(async () => { const xs = await Promise.all([A, B, C].map(info)); return xs.every((x) => x.links === 2) ? xs : null; }, 20000);
    ok(!!l, `1b 每个人都和另外两人直连上了（${l ? (l.t / 1000).toFixed(1) + ' 秒' : '没连上'}）`);
    const ia = await info(A); ok(/国内模式/.test(ia.net), `1c 状态显示：${ia.net}`);
    await track(B); await circle(A); await sleep(3000); await A.keyboard.up('KeyD'); await A.keyboard.up('KeyW');
    const rr = await rate(B); ok(rr.hz >= 10, `1d 直连后 B 收到 A 的位置：每秒 ${rr.hz} 次`);
    await A.tap('#bEmo'); await A.locator('#emobar span').nth(1).tap();
    const em = await waitFor(async () => { const x = await Promise.all([B, C].map((p) => p.evaluate(() => [...document.querySelectorAll('.emo')].map((e) => e.textContent).join('')))); return x.every((s) => s.includes('🔥')) ? x : null; }, 5000);
    ok(!!em, `1e 表情送到另外两人（${em ? em.t + 'ms' : '没送到'}）`);
    await A.evaluate(() => __dbg.sk8.host());
    const inv = await waitFor(async () => (await Promise.all([B, C].map((p) => p.evaluate(() => !!__dbg.sk8.invite)))).every(Boolean), 6000);
    await B.evaluate(() => __dbg.sk8.join()); await C.evaluate(() => __dbg.sk8.join());
    const lob = await waitFor(async () => A.evaluate(() => __dbg.sk8.lobby && Object.keys(__dbg.sk8.lobby.joined).length >= 2), 6000);
    await A.evaluate(() => __dbg.sk8.start());
    const gs = await waitFor(async () => (await Promise.all([B, C].map((p) => p.evaluate(() => !!(__dbg.sk8.state && __dbg.sk8.state.phase))))).every(Boolean), 6000);
    ok(!!inv && !!lob && !!gs, `1f S.K.A.T.E. 邀请 / 加入 / 开局都送到了（邀请 ${!!inv}，加入 ${!!lob}，开局 ${!!gs}）`);
    ok(wsB() - b0 === 0, `1g 全程没有用 Supabase 实时消息（${wsB() - b0} 条）`);
    for (const p of [A, B, C]) await p.close();
  }

  // ---------- 2 国内 + 直连也不行 → 数据库中转 ----------
  {
    const D = await mk('丁', '国内2', { noWS: true, noRTC: true }), E = await mk('戊', '国内2', { noWS: true, noRTC: true });
    const r = await waitFor(async () => (await seesAll(D, ['戊'])()) && (await seesAll(E, ['丁'])()), 20000);
    ok(!!r, `2a 直连不可用，靠数据库中转互相看见（${r ? (r.t / 1000).toFixed(1) + ' 秒' : '超时'}）`);
    await track(E); await circle(D); await sleep(4000); await D.keyboard.up('KeyD'); await D.keyboard.up('KeyW');
    const rr = await rate(E); ok(rr.hz >= 3 && rr.hz <= 8, `2b 中转时 E 收到 D 的位置：每秒 ${rr.hz} 次`);
    const id = await waitFor(async () => { const x = await info(D); return /网络受限/.test(x.net) ? x : null; }, 8000); ok(!!id, `2c 一直走中转时状态提示：${id ? id.v.net : (await info(D)).net}`);
    const q = await D.evaluate(() => __dbg.settings.q); ok(q === 0, `2d 画质没有被自动改（还是玩家选的：${q}）`);
    await D.tap('#bEmo'); await D.locator('#emobar span').nth(0).tap();
    const em = await waitFor(async () => E.evaluate(() => [...document.querySelectorAll('.emo')].map((e) => e.textContent).join('').includes('👍')), 5000);
    ok(!!em, `2e 表情走数据库信箱送到（${em ? em.t + 'ms' : '没送到'}）`);
    for (const p of [D, E]) await p.close();
  }

  // ---------- 3 一个开 VPN（实时通道正常）、一个没开 ----------
  {
    const F = await mk('己', '混合1', {}), G = await mk('庚', '混合1', { noWS: true });
    const r = await waitFor(async () => (await seesAll(F, ['庚'])()) && (await seesAll(G, ['己'])()), 20000);
    ok(!!r, `3a 一个能连实时通道、一个不能：互相看见（${r ? (r.t / 1000).toFixed(1) + ' 秒' : '超时'}）`);
    const l = await waitFor(async () => (await info(F)).links === 1 && (await info(G)).links === 1, 15000);
    ok(!!l, `3b 两人直连上了（${l ? (l.t / 1000).toFixed(1) + ' 秒' : '没连上'}）`);
    for (const p of [F, G]) await p.close();
  }

  // ---------- 4 一个开 VPN、一个没开，而且直连不可用 ----------
  {
    const H = await mk('辛', '混合2', { noRTC: true }), I = await mk('壬', '混合2', { noWS: true, noRTC: true });
    const r = await waitFor(async () => (await seesAll(H, ['壬'])()) && (await seesAll(I, ['辛'])()), 20000);
    ok(!!r, `4a 直连不可用时：没 VPN 的人用 HTTP 广播发给有 VPN 的人，反过来走中转，互相看见（${r ? (r.t / 1000).toFixed(1) + ' 秒' : '超时'}）`);
    ok((M.log.hev.s || 0) > 0 && (M.log.putN || 0) > 0, `4b 两条路都用上了：HTTP 广播 ${M.log.hev.s || 0} 条，中转写入 ${M.log.putN || 0} 次`);
    for (const p of [H, I]) await p.close();
  }

  // ---------- 5 请求卡住（既不成功也不报错）→ 自动放弃重发，恢复后照常收到 ----------
  {
    const J = await mk('癸', '卡住', { noWS: true, noRTC: true }), K = await mk('子', '卡住', { noWS: true, noRTC: true });
    await waitFor(async () => (await seesAll(J, ['子'])()) && (await seesAll(K, ['癸'])()), 20000);
    const jid = (await info(J)).id;
    M.log.hang = new Set([jid]); M.log.hung = 0;
    await sleep(7000);
    M.log.hang = null;
    await K.tap('#bEmo'); await K.locator('#emobar span').nth(2).tap();
    const em = await waitFor(async () => J.evaluate(() => [...document.querySelectorAll('.emo')].map((e) => e.textContent).join('').includes('😂')), 9000);
    ok(M.log.hung >= 1 && !!em, `5 长轮询卡住 7 秒（卡了 ${M.log.hung} 次请求）后自动恢复，表情 ${em ? (em.t / 1000).toFixed(1) + ' 秒后' : '没'}送到`);
    for (const p of [J, K]) await p.close();
  }

  // ---------- 6 还没运行国内联机 SQL：有实时通道的人照常玩，没有的人看到提示，不报错 ----------
  {
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const M2 = await L.mock(ctx2, null, { noGame: true });
    const mk2 = async (name, flags) => { const p = await ctx2.newPage(); L.errs(p, errs, name + ': ');
      await p.addInitScript((f) => { localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: true, music: false, sfx: false, dots: false, time: 'day' })); if (f.noWS) window.__noWS = true; }, flags);
      await p.goto(L.URL); await p.waitForTimeout(1000); await p.evaluate(() => { window.__noRender = true; });
      await p.fill('#inName', name); await p.fill('#inRoom', '无SQL'); await p.evaluate(() => document.getElementById('inRoom').dispatchEvent(new Event('change'))); await p.tap('#mFree'); return p; };
    const P1 = await mk2('丑', {}), P2 = await mk2('寅', {}), P3 = await mk2('卯', { noWS: true });
    const r = await waitFor(async () => (await seesAll(P1, ['寅'])()) && (await seesAll(P2, ['丑'])()), 15000);
    ok(!!r, `6a 没运行 SQL 时，能连实时通道的两个人照常互相看见（${r ? (r.t / 1000).toFixed(1) + ' 秒' : '超时'}）`);
    const t3 = await P3.evaluate(() => document.getElementById('net').textContent);
    ok(/运行一次 SQL/.test(t3), `6b 连不上实时通道的人看到提示：${t3}`);
    await ctx2.close();
  }

  const real = errs.filter((e) => !/^(丑|寅|卯): error: Failed to load resource: the server responded with a status of 404/.test(e)); // 没运行 SQL 时浏览器会记 404，是预期的
  ok(!real.length, '无报错 ' + real.slice(0, 4).join(' | '));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
