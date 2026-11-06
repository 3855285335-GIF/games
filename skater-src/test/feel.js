// 手感专项（真实多点触摸）：起手判定、推板、转向出板边、滑到屏幕边、长按磨杆、误触发
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: false, music: false, sfx: false, dots: true, flick: 3, steer: 3, time: 'day' })); });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__noRender = true; __dbg.startGame('free'); });
  await sleep(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 10, radiusY: 10, force: 1 })) });
  const burst = async (frames, gap) => { for (const f of frames) { await send('touchMove', f); await sleep(gap); } };
  const G = () => p.evaluate(() => __dbg.geo);
  const at = (g, al, ac) => { const ux = g.fx - g.rx, uy = g.fy - g.ry, L2 = Math.hypot(ux, uy), nx = ux / L2, ny = uy / L2; return [g.cx + nx * al * L2 / 2 + (-ny) * ac * g.halfW, g.cy + ny * al * L2 / 2 + nx * ac * g.halfW]; };
  const st = () => p.evaluate(() => { const s = __dbg.sk; return { mode: s.mode, spd: +s.speed().toFixed(2), hd: +s.heading.toFixed(3), lean: +s.lean.toFixed(2), z: +s.p.z.toFixed(2), locked: !!(s.grind && s.grind.locked), on: [...__dbg.input.ptrs.values()].map((q) => (q.ghost ? 'G' : q.on ? 'on' : 'off')).join(' '), tip: document.getElementById('railTip').classList.contains('hide') ? '' : document.getElementById('railTip').textContent }; });
  const place = async (x, z, yaw, s) => { await p.evaluate(([x, z, yaw, s]) => { const sk = __dbg.sk; __dbg.combo.clear(); sk.reset(x, z, yaw); sk.s = s; __dbg.renderQ.copy(sk.qv); }, [x, z, yaw, s]); await sleep(450); };
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (fn(s)) return s; await sleep(40); } return null; };
  let g = await G();
  console.log(`板子在屏幕上：半长 ${Math.round(Math.hypot(g.fx - g.rx, g.fy - g.ry) / 2)}px，半宽 ${Math.round(g.halfW)}px`);

  // 1 起手在板外的手指不算
  await place(2.6, -9.6, 0, 0);
  await send('touchStart', [[60, 220, 9]]); await sleep(30); await burst([[[60, 180, 9]], [[60, 140, 9]], [[60, 100, 9]]], 30);
  let s = await st(); ok(s.spd === 0 && s.on === 'G', `1 板外起手：速度 ${s.spd}，手指 ${s.on}`);
  await send('touchEnd', []); await sleep(100);

  // 2 推板：从板尾往前划一下，划出板头也照样算
  const stroke = async (from, to) => { g = await G(); const A = at(g, from, -0.25), B = at(g, from + 0.5, 0.25); await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]); await sleep(40);
    const fr = []; for (let i = 1; i <= 12; i++) { const k = from + (to - from) * i / 12, a = at(g, k, -0.25), b2 = at(g, k + 0.5, 0.25); fr.push([[a[0], a[1], 1], [b2[0], b2[1], 2]]); } await burst(fr, 16); const mid = await st(); await send('touchEnd', []); await sleep(80); return mid; };
  await place(2.6, -9.6, 0, 0); let m1 = await stroke(-0.9, 0.3); const short = (await st()).spd;
  await place(2.6, -9.6, 0, 0); let m2 = await stroke(-0.9, 1.25); const long = (await st()).spd;
  ok(short >= 0.9, `2a 板上划一下（板尾→板中）：${short} m/s`);
  ok(long >= short * 1.5 && long >= 1.8 && m2.on.includes('on'), `2b 一直划出板头：${long} m/s，划到板头外时手指 ${m2.on}`);

  // 3 转向：两指往右偏到板边外面 → 转到底、不会断开
  await place(2.6, -9.6, 0, 3); // 出生点：前面一大片平地
  g = await G(); let A = at(g, -0.4, 0), B = at(g, 0.4, 0); await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]); await sleep(120);
  const hd0 = (await st()).hd;
  { const fr = []; for (let i = 1; i <= 10; i++) { const k = 1.8 * i / 10; const a = at(g, -0.4, k), b2 = at(g, 0.4, k); fr.push([[a[0], a[1], 1], [b2[0], b2[1], 2]]); } await burst(fr, 16); }
  await sleep(500); s = await st();
  ok(s.on === 'on on' && s.lean > 0.9 && s.hd < hd0 - 0.6, `3 偏到板边外（1.8 倍半宽）：手指 ${s.on}，lean ${s.lean}，转了 ${(hd0 - s.hd).toFixed(2)} rad`);
  // 4 手指一直往远处滑（离开板子一个板长以上）：脱板，不再转。镜头离板子近，板子在屏幕上很宽，往旁边滑到屏幕边也还算在板子附近，所以往屏幕上方滑
  { const fr = []; for (let i = 1; i <= 8; i++) { const a = at(g, -0.4, 1.8), b2 = at(g, 0.4, 1.8); fr.push([[a[0], a[1] + (40 - a[1]) * i / 8, 1], [b2[0], b2[1] + (20 - b2[1]) * i / 8, 2]]); } await burst(fr, 16); }
  await sleep(400); s = await st();
  ok(s.on === 'off off' && Math.abs(s.lean) < 0.1, `4 手指滑到很远：手指 ${s.on}，lean ${s.lean}`);
  await send('touchEnd', []); await sleep(100);

  // 5 长按磨杆：杆子亮起后两指同时按住 → 自动跳上去磨；一直按着就一直磨；松手跳下来
  await place(5.1, -7.8, 0, 2.4); // 平杆（x 4.4，z -5.6～3.9）旁边 0.7 米、杆子前面 2.2 米
  let t5 = await waitFor((x) => x.tip !== '', 3000);
  ok(!!t5 && t5.tip === '两指按住 · 磨杆', `5a 靠近杆子：出现提示「${t5 && t5.tip}」`);
  g = await G(); A = at(g, -0.35, 0); B = at(g, 0.35, 0); await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]);
  const t0 = Date.now(); s = await waitFor((x) => x.mode === 'grind', 1500); const dt5 = Date.now() - t0;
  ok(!!s && s.locked, `5b 两指按住 ${dt5}ms 后上杆：${s ? s.mode + (s.locked ? '（长按上的）' : '') : '没上杆'}`);
  await sleep(700); s = await st(); ok(s.mode === 'grind', `5c 按着不放 0.7 秒：${s.mode}，速度 ${s.spd}`);
  await send('touchEnd', []); s = await waitFor((x) => x.mode !== 'grind', 600);
  ok(!!s && (s.mode === 'air' || s.mode === 'ground'), `5d 松手：跳下来了（${s && s.mode}）`);
  const land = await waitFor((x) => x.mode === 'ground', 2000); ok(!!land, `5e 落地：${land ? land.mode : '没落地'}`);
  const combo = await p.evaluate(() => __dbg.combo.total + __dbg.combo.list.reduce((a, e) => a + (e.pts || 0), 0));
  ok(combo > 0, `5f 磨杆计分：${combo}`);

  // 6 一直按着手指滑过杆子：不会被吸上去，提示改成「抬指再按住」
  // 先停着按住手指 2.1 秒（场地小，没法离杆子很远就开始滑），再让板子滑向杆子
  await place(5.1, -9.0, 0, 0);
  g = await G(); A = at(g, -0.35, 0); B = at(g, 0.35, 0); await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]);
  await sleep(2100); await p.evaluate(() => { __dbg.sk.s = 2.4; });
  let sawTip = '', grinded = false; const t6 = Date.now();
  while (Date.now() - t6 < 7000) { const x = await st(); if (x.tip) sawTip = x.tip; if (x.mode === 'grind') { grinded = true; break; } if (x.z > 4.5) break; await sleep(60); }
  ok(!grinded && sawTip === '抬指再按住 · 磨杆', `6 按着手指滑过杆子：上杆=${grinded}，提示「${sawTip}」`);
  await send('touchEnd', []); await sleep(150);

  // 7 单指长按不上杆（单指是 Manual 之类的操作）
  await place(5.1, -7.8, 0, 2.4); await waitFor((x) => x.tip !== '', 3000);
  g = await G(); A = at(g, 0, 0); await send('touchStart', [[A[0], A[1], 1]]); await sleep(900); s = await st();
  ok(s.mode !== 'grind', `7 单指长按：${s.mode}`);
  await send('touchEnd', []); await sleep(150);

  // 8 键盘 G：按住上杆，松开跳下
  await place(5.1, -7.8, 0, 2.4); await waitFor((x) => x.tip !== '', 3000);
  await p.keyboard.down('KeyG'); s = await waitFor((x) => x.mode === 'grind', 1500); ok(!!s, `8a 键盘按住 G：${s ? '上杆' : '没上杆'}`);
  await sleep(400); await p.keyboard.up('KeyG'); s = await waitFor((x) => x.mode !== 'grind', 800); ok(!!s, `8b 松开 G：${s ? s.mode : '还在杆上'}`);

  ok(!errs.length, '无报错 ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
