// 联机发送频率 + 对方画面是否平滑
// 前半段关掉直连（__noRTC），测实时通道的省额度频率；最后测直连可用时几乎不占实时消息
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const M = await L.mock(ctx); const errs = [];
  const mk = async (name, rtc, room) => {
    const p = await ctx.newPage(); L.errs(p, errs, name + ': ');
    await p.addInitScript((rtc) => { if (!rtc) window.__noRTC = true; localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: true, music: false, sfx: false, dots: false, time: 'day' })); }, !!rtc);
    await p.goto(L.URL); await p.waitForTimeout(1200); await p.evaluate(() => { window.__noRender = true; });
    await p.fill('#inName', name); await p.fill('#inRoom', room || '测速'); await p.evaluate(() => document.getElementById('inRoom').dispatchEvent(new Event('change')));
    await p.tap('#mFree'); return p;
  };
  const sends = () => M.log.ev && M.log.ev.s || 0;
  async function measure(label, pages, setup, secs, expectEach, tol) {
    await Promise.all(pages.map((p, i) => setup(p, i))); await sleep(1500);
    const s0 = sends(), t0 = Date.now(); await sleep(secs * 1000); const n = sends() - s0, dt = (Date.now() - t0) / 1000;
    const each = n / dt / pages.length, billed = (n / dt) * pages.length;
    ok(Math.abs(each - expectEach) <= tol, `${label}：每人 ${each.toFixed(2)} 条/秒（预期约 ${expectEach}），Supabase 计费 ${billed.toFixed(1)} 条/秒`);
    return billed;
  }
  // 持续转圈：W + D（转弯 → 全速 4 条/秒）
  const circle = async (p) => { await p.evaluate(() => { const sk = __dbg.sk; sk.reset(-6, -14, 0); sk.s = 3; }); await p.keyboard.down('KeyW'); await p.keyboard.down('KeyD'); };
  const A = await mk('Alice'), B = await mk('Bob'); await sleep(2000);
  // 在 B 的画面里逐帧记录 A 的位置，检查平滑
  // 在 B 的画面里，每次游戏更新完远程玩家后记录 A 的位置（和画面同一时刻）
  await B.evaluate(() => { window.__trk = []; const o = __dbg.online, u = o.update.bind(o); o.update = (dt, now, ctx) => { u(dt, now, ctx); const r = [...o.remotes.values()][0]; if (r && r.board && __trk.length < 400) { const p = r.board.root.position; __trk.push([p.x, p.y, p.z, now]); } }; });
  const two = await measure('2 人转圈', [A, B], circle, 8, 4, 0.5);
  const trk = await B.evaluate(() => __trk);
  let maxJerk = 0, nan = 0;
  for (let i = 2; i < trk.length; i++) {
    const [a, b2, c] = [trk[i - 2], trk[i - 1], trk[i]]; if (![...c].every(Number.isFinite)) { nan++; continue; }
    const v1 = Math.hypot(b2[0] - a[0], b2[2] - a[2]) / Math.max(1, b2[3] - a[3]), v2 = Math.hypot(c[0] - b2[0], c[2] - b2[2]) / Math.max(1, c[3] - b2[3]);
    if (i > 60 && v1 < 0.015 && v2 < 0.015) maxJerk = Math.max(maxJerk, Math.abs(v2 - v1) * 1000); // 超过 15 m/s 的是复位瞬移（应该直接跳过去），不算卡顿
  }
  ok(trk.length > 100 && nan === 0 && maxJerk < 2.5, `B 看 A 转圈：${trk.length} 帧，速度突变最大 ${maxJerk.toFixed(2)} m/s（越小越顺），NaN ${nan}`);
  for (const p of [A, B]) { await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW'); }
  // 平地直线稳定滑行（少发：4 × 0.6 = 2.4 条/秒）
  const straight = async (p, i) => { await p.evaluate((i) => { const sk = __dbg.sk; sk.reset(-20 + i * 3, -30, Math.PI / 2); sk.s = 2.2; }, i); };
  await measure('2 人直线滑行', [A, B], straight, 5, 2.4, 0.5);
  // 一直 Ollie（起跳/落地各补发一条）
  const ollie = async (p, i) => { await p.evaluate((i) => { const sk = __dbg.sk; sk.reset(-6 + i * 4, -14, 0); sk.s = 2; window.__ol = setInterval(() => { const sk = __dbg.sk; if (sk.mode === 'ground') { sk.s = 2; sk.pop('tail', 1); } }, 1100); }, i); };
  await measure('2 人反复 Ollie', [A, B], ollie, 6, 4.8, 1.0);
  for (const p of [A, B]) await p.evaluate(() => clearInterval(window.__ol));
  // 3 人转圈（32/9 = 3.56 条/秒）
  const C = await mk('Cara'); await sleep(2500);
  const three = await measure('3 人转圈', [A, B, C], circle, 8, 3.56, 0.5);
  for (const p of [A, B, C]) { await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW'); }
  console.log(`\n每月 200 万条够玩：2 人约 ${(2e6 / two / 3600).toFixed(0)} 小时（旧版约 23），3 人约 ${(2e6 / three / 3600).toFixed(0)} 小时（旧版约 10）`);
  for (const p of [A, B, C]) await p.close();
  // 直连可用：位置走玩家直连，实时通道几乎不发
  { const P = await mk('Dan', true, '直连'), Q = await mk('Eve', true, '直连'); await sleep(4000); // 单独的房间：前面关掉的页面在名单里还会留 20 秒
    const links = await Promise.all([P, Q].map((p) => p.evaluate(() => [...__dbg.online.links.values()].filter((l) => l.open).length)));
    await Promise.all([P, Q].map((p, i) => circle(p, i)));
    const s0 = sends(), t0 = Date.now(); await sleep(5000); const per = (sends() - s0) / ((Date.now() - t0) / 1000);
    ok(links[0] === 1 && links[1] === 1 && per < 0.5, `直连可用：两人直连 ${links.join('/')}，实时通道每秒 ${per.toFixed(2)} 条（基本不占额度）`);
    for (const p of [P, Q]) { await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW'); await p.close(); } }
  ok(!errs.length, '无报错 ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
