// 真实多点触摸：拨板 + 起跳 + 重新按回板上接板（走完整的输入流程，不是直接调物理）
//  · 先拨再跳（前指侧拨，后指划板尾松手）→ 起跳的同时翻板
//  · 转到快一圈时按回板上 → 翻板成功 · 刚拨完就按回去 → 踩停了 · 不按回去 → 没接住 · 先跳再拨也行
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
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const burst = async (frames, gap) => { const ps = []; for (const f of frames) { ps.push(send('touchMove', f)); await sleep(gap); } await Promise.all(ps); };
  const G = () => p.evaluate(() => __dbg.geo);
  const at = (g, al, ac) => { const ux = g.fx - g.rx, uy = g.fy - g.ry, L2 = Math.hypot(ux, uy), nx = ux / L2, ny = uy / L2; return [g.cx + nx * al * L2 / 2 + (-ny) * ac * g.halfW, g.cy + ny * al * L2 / 2 + nx * ac * g.halfW]; };
  const trial = async (catchAt, flickLen, order) => {
    await p.evaluate(() => { const sk = __dbg.sk; __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = 4; __dbg.renderQ.copy(sk.qv); window.__names = []; window.__bail = null;
      const c = __dbg.combo; if (!c.__w) { const o = c.add.bind(c); c.add = (n, pts) => { window.__names.push(n); return o(n, pts); }; c.__w = 1; }
      const s0 = sk.cb.onBail; if (!sk.__w) { sk.cb.onBail = (r) => { window.__bail = r; return s0(r); }; sk.__w = 1; } });
    await sleep(500);
    const g = await G(); const A = at(g, -0.55, 0), B = at(g, 0.5, 0);
    await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]); await sleep(60);
    const swipe = async (x2) => { const fr = []; for (let i = 1; i <= 5; i++) { const a = at(g, -0.55 - i * 0.34, 0); fr.push([[a[0], a[1], 1], x2(i)]); } await burst(fr, 8); };
    const flick = async (a1) => { const fr2 = []; for (let i = 1; i <= 5; i++) { const b2 = at(g, 0.5, -i * (flickLen || 0.6)); fr2.push([a1, [b2[0], b2[1], 2]]); } await burst(fr2, 8); };
    if (order === 'pre') { // 先拨再跳：前指侧拨出去，再后指往板尾划、松手
      await flick([A[0], A[1], 1]); await sleep(50);
      const bo = at(g, 0.5, -5 * (flickLen || 0.6)); await swipe(() => [bo[0], bo[1], 2]);
    } else { // 先跳再拨（空中拨）
      await swipe(() => [B[0], B[1], 2]); await sleep(40); const A2 = at(g, -1.65, 0); await flick([A2[0], A2[1], 1]);
    }
    await send('touchEnd', []);
    const t0 = Date.now(); let caught = false, flipAtCatch = null, airSeen = false, maxF = 0, goal = 0, retry = false, ft0 = null;
    while (Date.now() - t0 < 2500) {
      const s = await p.evaluate(() => { const sk = __dbg.sk; return { mode: sk.mode, f: sk.flipA, g: sk.air ? sk.air.flipGoal : 0, flicked: !!(sk.air && sk.air.flicked), t0: sk.air && sk.air.pF ? sk.air.pF.t0 : null }; });
      if (s.mode === 'air') { airSeen = true; maxF = Math.max(maxF, Math.abs(s.f)); }
      if (s.flicked) { goal = s.g; if (ft0 == null) ft0 = s.t0; }
      // 测"转完一圈再按回去"：要拨得轻（只转一圈）才测。拨重了板子转得很快（三圈的话每秒两千多度），这台测试机触摸延迟忽大忽小，掐不准，换轻一点重来
      if (catchAt > 3 && s.flicked && Math.abs(s.g) > Math.PI * 2 * 1.12) { retry = true; }
      if (!caught && !retry && catchAt != null && s.mode === 'air' && s.flicked && Math.abs(s.f) >= catchAt) {
        const g2 = await G(); await send('touchStart', [[g2.cx, g2.cy, 3]]); caught = true; flipAtCatch = s.f;
      }
      if (airSeen && s.mode !== 'air') break;
      await sleep(5);
    }
    await sleep(300); if (caught) await send('touchEnd', []); await sleep(200);
    return p.evaluate(([fc, air, mf, gl, rt, f0]) => ({ names: window.__names.slice(), bail: window.__bail, fc, air, mf, goal: gl, retry: rt, ft0: f0 }), [flipAtCatch, airSeen, maxF, goal, retry, ft0]);
  };
  let good = null;
  for (const len of [0.6, 0.45, 0.35, 0.27, 0.2, 0.15]) { good = await trial(Math.PI * 2 - 0.55, len, 'pre'); /* 转到约 328° 以后按回去（离"正"不到 1/3 圈就能接） */ if (!good.retry) break; console.log('  拨得太重（要转 ' + Math.round(Math.abs(good.goal) * 57.3) + '°），换轻一点重来'); }
  console.log('  空中最多转了', Math.round(good.mf * 57.3) + '°，要转', Math.round(Math.abs(good.goal) * 57.3) + '°', good.air ? '' : '（没起跳）');
  ok(!good.retry && good.air && good.ft0 === 0 && good.names.some((n) => /flip/i.test(n)) && !good.bail, `1 先拨再跳（起跳那一刻就开始翻：${good.ft0 === 0 ? '是' : '不是，' + good.ft0}），快转完一圈（约 330°）时按回板上：${good.names.join(',') || '无'} ${good.bail ? '摔：' + good.bail : ''}（接板时转了 ${good.fc != null ? Math.round(Math.abs(good.fc) * 57.3) + '°' : '没接'}）`);
  const early = await trial(0.5, 0.3, 'pre');
  ok(early.bail === 'flipShort', `2 刚拨完就按回去：${early.bail || early.names.join(',')}（接板时转了 ${early.fc != null ? Math.round(Math.abs(early.fc) * 57.3) + '°' : '没接'}）`);
  const never = await trial(null, 0.3, 'pre');
  ok(never.bail === 'catch', `3 不按回板上：${never.bail || never.names.join(',')}`);
  let post = null; for (const len of [0.3, 0.22, 0.16, 0.12]) { post = await trial(Math.PI * 2 - 0.55, len, 'post'); if (!post.retry) break; }
  ok(post.air && post.ft0 > 0 && post.names.some((n) => /flip/i.test(n)) && !post.bail, `4 先跳再在空中拨，也能翻（起跳后 ${post.ft0 != null ? post.ft0.toFixed(2) : '?'} 秒开始翻）：${post.names.join(',') || '无'} ${post.bail ? '摔：' + post.bail : ''}`);
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
