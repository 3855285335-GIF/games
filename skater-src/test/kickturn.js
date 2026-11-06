// Kickturn（真实多点触摸）：一指按住板尾、另一指绕着它往旁边拨 → 板子跟着转；推板时手抖不会误触发
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }); await L.mock(ctx, null, { yard: true });
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: false, music: false, sfx: false, dots: true, flick: 3, steer: 3, time: 'day' })); });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__noRender = true; __dbg.startGame('free'); });
  await sleep(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 10, radiusY: 10, force: 1 })) });
  const G = () => p.evaluate(() => __dbg.geo);
  const at = (g, al, ac) => { const ux = g.fx - g.rx, uy = g.fy - g.ry, L2 = Math.hypot(ux, uy), nx = ux / L2, ny = uy / L2; return [g.cx + nx * al * L2 / 2 + (-ny) * ac * g.halfW, g.cy + ny * al * L2 / 2 + nx * ac * g.halfW]; };
  const st = () => p.evaluate(() => { const s = __dbg.sk; return { hd: s.heading, spd: s.s, mode: s.mode, combo: __dbg.combo.list.map((e) => e.name).join(','), kp: s.kickPitch }; });
  const place = async (s) => { await p.evaluate((s) => { const sk = __dbg.sk; __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = s; __dbg.renderQ.copy(sk.qv); }, s); await sleep(500); };

  // 0 停着两指压在板子右边：压板不会转 → 出现 Kickturn 提示（前几次才提示）
  await place(0);
  { const g0 = await G(), A0 = at(g0, -0.4, 0.8), B0b = at(g0, 0.4, 0.8);
    await send('touchStart', [[A0[0], A0[1], 1], [B0b[0], B0b[1], 2]]); await sleep(1500);
    const hint = await p.evaluate(() => document.getElementById('hint').textContent), hd = (await st()).hd;
    ok(/原地转/.test(hint) && Math.abs(hd) < 0.02, `0 停着压板：不转（${hd.toFixed(3)}），提示「${hint}」`);
    await send('touchEnd', []); await sleep(200); }
  // 1 停着：后指按板尾不动，前指往右拨 → 板子往右转（heading 变小）
  await place(0);
  let g = await G(); const A = at(g, -0.6, 0), B0 = at(g, 0.55, 0);
  const R = Math.hypot(B0[0] - A[0], B0[1] - A[1]), a0 = Math.atan2(B0[1] - A[1], B0[0] - A[0]);
  await send('touchStart', [[A[0], A[1], 1], [B0[0], B0[1], 2]]); await sleep(150);
  const h0 = (await st()).hd; let maxKp = 0;
  for (let i = 1; i <= 30; i++) { const a = a0 + (1.5 * i) / 30; await send('touchMove', [[A[0], A[1], 1], [A[0] + Math.cos(a) * R, A[1] + Math.sin(a) * R, 2]]); await sleep(16); if (i === 22) maxKp = (await st()).kp; }
  await sleep(100); let s = await st();
  ok(h0 - s.hd > 0.5 && s.spd < 0.3, `1 停着拨前指 1.5 rad：板子右转 ${(h0 - s.hd).toFixed(2)} rad，速度 ${s.spd.toFixed(2)}`);
  ok(maxKp > 0.05, `1b 转的时候板头翘起来：${maxKp.toFixed(3)}`);
  await send('touchEnd', []); await sleep(600); s = await st();
  ok(/Kickturn/.test(s.combo), `1c 计入招式：${s.combo}`);

  // 2 往左拨回来
  await place(0); g = await G();
  { const A2 = at(g, -0.6, 0), B2 = at(g, 0.55, 0), R2 = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]), b0 = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]);
    await send('touchStart', [[A2[0], A2[1], 1], [B2[0], B2[1], 2]]); await sleep(150); const hh = (await st()).hd;
    for (let i = 1; i <= 20; i++) { const a = b0 - (0.7 * i) / 20; await send('touchMove', [[A2[0], A2[1], 1], [A2[0] + Math.cos(a) * R2, A2[1] + Math.sin(a) * R2, 2]]); await sleep(16); }
    await sleep(100); s = await st(); ok(s.hd - hh > 0.4, `2 往左拨：左转 ${(s.hd - hh).toFixed(2)} rad`); await send('touchEnd', []); await sleep(300); }

  // 3 推板：两指一起往前划（带一点歪），不当 Kickturn
  await place(0); g = await G();
  { const fr = []; for (let i = 0; i <= 12; i++) { const k = -0.9 + 1.2 * i / 12, a = at(g, k, -0.25 + 0.06 * Math.sin(i)), b2 = at(g, k + 0.5, 0.25 - 0.05 * Math.sin(i * 1.3)); fr.push([[a[0], a[1], 1], [b2[0], b2[1], 2]]); }
    await send('touchStart', fr[0]); await sleep(40); const hh = (await st()).hd;
    for (const f of fr.slice(1)) { await send('touchMove', f); await sleep(16); }
    await send('touchEnd', []); await sleep(300); s = await st();
    ok(Math.abs(s.hd - hh) < 0.12 && s.spd > 0.8 && !/Kickturn/.test(s.combo), `3 推板手有点歪：方向变化 ${(s.hd - hh).toFixed(3)} rad，速度 ${s.spd.toFixed(2)}，招式「${s.combo}」`); }

  // 4 滑得快时两指转：不会原地转（只是压板）
  await place(5); g = await G();
  { const A3 = at(g, -0.6, 0), B3 = at(g, 0.55, 0), R3 = Math.hypot(B3[0] - A3[0], B3[1] - A3[1]), c0 = Math.atan2(B3[1] - A3[1], B3[0] - A3[0]);
    await send('touchStart', [[A3[0], A3[1], 1], [B3[0], B3[1], 2]]); await sleep(100);
    for (let i = 1; i <= 10; i++) { const a = c0 + (0.5 * i) / 10; await send('touchMove', [[A3[0], A3[1], 1], [A3[0] + Math.cos(a) * R3, A3[1] + Math.sin(a) * R3, 2]]); await sleep(16); }
    s = await st(); await send('touchEnd', []); await sleep(200);
    ok(!/Kickturn/.test(s.combo) && s.spd > 4, `4 5 m/s 时两指转：没当成 Kickturn（速度 ${s.spd.toFixed(2)}）`); }
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
