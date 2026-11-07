// 圆杆有实体、磨杆时侧划转 90°、空中半个 Shove-it 落成 Boardslide、转板方向（2026-11-07 用户反馈后加的）
//  · 杆子和立柱挡得住板子（地上、空中、摔倒都不穿过去）；杆子底下是空的，板子能从底下滑过去
//  · 从上面落到杆子上又磨不上：挂在杆子上摔
//  · 磨杆时后指侧划：50-50 ↔ Boardslide，转的时候平滑，松手不跳
//  · 往杆子上跳的时候后指侧划：只转 90°，横着落上去 = Boardslide
//  · 后指往屏幕右边划：板头往右转（用户说以前是反的）
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript((sd) => { let m = sd; Math.random = () => (m = (m * 1103515245 + 12345) % 2147483648) / 2147483648; localStorage.setItem('fs_pracDone', 'true'); window.__noRender = true; }, +(process.env.SEED || 777));
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate(() => { __dbg.startGame('free'); __dbg.input.enabled = false; });
  const R = await p.evaluate(() => {
    const { sk, combo } = __dbg; const out = {}; let ev = [], got = [];
    const orig = Object.assign({}, sk.cb);
    for (const k of Object.keys(orig)) sk.cb[k] = (...a) => { ev.push(k + (k === 'onBail' ? ':' + a[0] : '')); return orig[k](...a); };
    const oadd = combo.add.bind(combo); combo.add = (n, pts) => { got.push(n); return oadd(n, pts); };
    const ost = combo.startLive.bind(combo); combo.startLive = (n, r, k) => { got.push(n); return ost(n, r, k); };
    const I = (o) => Object.assign({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 1, touching: 1, caught: true, capT: -9, auto: false, fb: 0, kick: 0 }, o);
    // 当前板子插进杆子 / 立柱多深（正在磨的那根不算）
    const rodDepth = () => {
      if (sk.mode === 'grind' || sk.hop) return 0;
      const skip = sk.time - sk.lastRailT < 0.4 ? sk.lastRail : null;
      if (sk.mode === 'bail') return sk._rodPen(sk.p.x, sk.p.y, sk.p.z, sk.bq, 0, 0, 0, null).d;
      const q = sk.mode === 'air' ? sk.qa : sk.qv;
      return sk._rodPen(sk.p.x, sk.p.y, sk.p.z, q, sk.visPitch(), sk.flipA, sk.shoveA, skip).d;
    };
    const place = (x, z, yaw, s) => { combo.clear(); sk.reset(x, z, yaw); sk.s = s; sk.qa.copy(sk.qv); __dbg.renderQ.copy(sk.qv); ev = []; got = []; };
    let hist = [], worstLog = null, worstD = 0;
    const run = (sec, fn) => { let mx = 0, minX = 1e9, maxX = -1e9, crossY = null, px = sk.p.x; hist = ['start ' + sk.p.x.toFixed(3) + ',' + sk.p.z.toFixed(3) + ' h=' + sk.heading.toFixed(3) + ' d0=' + rodDepth().toFixed(3)]; for (let i = 0; i < sec * 240; i++) { const t = i / 240, inp = I(); if (fn) fn(t, inp, i); sk.step(1 / 240, inp); const dd = rodDepth(); mx = Math.max(mx, dd);
      hist.push(i + ' ' + sk.mode + ' p=' + sk.p.x.toFixed(3) + ',' + sk.p.y.toFixed(3) + ',' + sk.p.z.toFixed(3) + ' h=' + sk.heading.toFixed(3) + ' spd=' + sk.s.toFixed(2) + ' f=' + sk.flipA.toFixed(2) + ' s=' + sk.shoveA.toFixed(2) + ' pitch=' + sk.visPitch().toFixed(2) + ' d=' + dd.toFixed(3) + ' rod=' + (sk._rodR && sk._rodR.rod ? (sk._rodR.rod.rail ? 'rail' : 'post') : '-')); if (hist.length > 14) hist.splice(1, 1);
      if (dd > worstD) { worstD = dd; worstLog = hist.slice(); }
      minX = Math.min(minX, sk.p.x); maxX = Math.max(maxX, sk.p.x); if ((px - 4.4) * (sk.p.x - 4.4) < 0 && crossY == null) crossY = sk.p.y; px = sk.p.x; } return { mx, minX, maxX, crossY, ev: ev.slice(), got: got.slice(), z: sk.p.z, x: sk.p.x, mode: sk.mode }; };
    const at = (t, s) => Math.abs(t - s) < 0.5 / 240;
    // 平杆：x = 4.4，z 从 -5.6 到 3.9，高 0.36；立柱在 z = -5.6、-3.225、-0.85、1.525、3.9
    out.post = (() => { place(4.4, -7.4, 0, 3); return run(1.6); })();                  // 正对着立柱滑过去
    out.under = (() => { place(2.6, -2.05, Math.PI / 2, 3); return run(1.4); })();      // 横着从杆子底下滑过去（两根立柱中间）
    // 低低地跳向杆子侧面：起跳点不同，到杆子那里的高度不同（有的撞在杆子侧面，有的从上面擦过）
    out.side = [1.9, 2.1, 2.3, 2.5].map((x0) => { place(x0, -2.05, Math.PI / 2, 3); return run(1.4, (t) => { if (at(t, 0.02)) sk.pop('tail', 0); }); });
    // 横着落到杆子上（磨不上）：从杆子正上方 0.75 米慢慢掉下来
    out.hang = (() => { place(4.38, -2.05, Math.PI / 2, 0); sk.p.y = 0.75; sk._toAir(new sk.v.constructor(0.05, 0, 0), null, 0, 0, 'tail'); ev = []; return run(1.2); })();
    // 磨杆时侧划转 90°
    out.turn = (() => {
      place(4.4, -4.6, 0, 3.5); const T = __dbg.T, r = T.rails.find((x) => x.kind === 'rail' && x.flat);
      sk._startGrind(r, { u: 1.0, x: 4.4, y: 0.36, z: -4.6 }, 3.5);
      const names = []; let maxStep = 0, pq = sk.qv.clone(), poppedOff = false;
      for (let i = 0; i < 240 * 1.2; i++) {
        const t = i / 240, inp = I({ touching: 1, hold: true });
        if (at(t, 0.2)) sk.flick('back', 1, 0.3, 1);
        if (at(t, 0.3)) poppedOff = sk.pop('tail', 0.5); // 侧划那根手指松开：不该跳
        if (at(t, 0.7)) sk.flick('back', -1, 0.3, 1);
        sk.step(1 / 240, inp);
        if (sk.grind) { if (names[names.length - 1] !== sk.grind.name) names.push(sk.grind.name); maxStep = Math.max(maxStep, pq.angleTo(sk.qv)); pq.copy(sk.qv); }
      }
      return { seq: names, maxStep, poppedOff, mode: sk.mode };
    })();
    // 往杆子上跳的时候后指侧划：只转 90°
    out.quarter = (() => { place(4.4, -7.3, 0, 4); return run(1.6, (t) => { if (at(t, 0.05)) { sk.pop('tail', 0.75); sk.flick('back', 1, 0.3); } }); })();
    out.quarterGoal = out.quarter.ev.join(' ');
    // 杆子附近乱玩：起跳、翻板、转板、转体、摔倒，板子插进杆子 / 立柱最深多少
    out.fuzz = (() => {
      let mx = 0, bails = 0, steps = 0;
      for (let k = 0; k < 40; k++) {
        const x = 3.2 + Math.random() * 2.4, z = -6.5 + Math.random() * 10, yaw = Math.random() * Math.PI * 2;
        place(x, z, yaw, 1 + Math.random() * 4);
        const r = run(2.2, (t, inp, i) => { if (i === 10) sk.pop('tail', Math.random()); if (i === 20 && Math.random() < 0.6) sk.flick(Math.random() < 0.5 ? 'front' : 'back', Math.random() < 0.5 ? 1 : -1, Math.random()); inp.spinRate = (Math.random() - 0.5) * 6; inp.lean = Math.sin(t * 3) * 0.8; });
        mx = Math.max(mx, r.mx); if (r.ev.some((e) => /onBail/.test(e))) bails++; steps += 2.2 * 240;
      }
      return { mx, bails, log: worstLog };
    })();
    return out;
  });
  ok(R.post.mx < 0.012 && R.post.z < -5.6 - 0.1, `1 正对着立柱滑过去：挡住了（停在 z=${R.post.z.toFixed(2)}，最深插进 ${(R.post.mx * 100).toFixed(1)} 厘米）${R.post.ev.join(' ')}`);
  ok(R.under.maxX > 5.2 && R.under.mx < 0.012, `2 横着从杆子底下滑过去：过得去（到了 x=${R.under.maxX.toFixed(2)}，杆子底下是空的）`);
  for (const [i, r] of R.side.entries()) ok(r.mx < 0.015 && (r.maxX < 4.4 || (r.crossY != null && r.crossY > 0.3)), `3.${i + 1} 低低地跳向杆子侧面：${r.maxX < 4.4 ? '被弹回来了' : '从杆子上面过去（过杆时板子高 ' + (r.crossY != null ? r.crossY.toFixed(2) : '?') + ' 米）'}，最深插进 ${(r.mx * 100).toFixed(1)} 厘米 ${r.ev.join(' ')}`);
  ok(R.hang.ev.includes('onBail:rail') && R.hang.mx < 0.015, `4 横着落到杆子上（磨不上）：挂在杆上摔了（${R.hang.ev.join(' ')}，最深 ${(R.hang.mx * 100).toFixed(1)} 厘米）`);
  ok(R.turn.seq.join('→') === '50-50→Boardslide→50-50' && !R.turn.poppedOff && R.turn.mode === 'grind', `5 磨杆时后指侧划：${R.turn.seq.join(' → ')}；侧划那根手指松开没有跳下来（${R.turn.poppedOff ? '跳了' : '没跳'}）`);
  ok(R.turn.maxStep < 0.12, `5b 在杆上转 90° 是平滑的：每一步最多转 ${(R.turn.maxStep * 57.3).toFixed(1)}°`);
  ok(R.quarter.got.includes('Boardslide') && !R.quarter.ev.some((e) => /onBail/.test(e)), `6 跳上杆子时后指侧划：只转 90°，横着落上去 → ${R.quarter.got.join(',') || '无'}（${R.quarterGoal}）`);
  if (R.fuzz.mx >= 0.02 || process.env.DBG) console.log(R.fuzz.log.join('\n'));
  ok(R.fuzz.mx < 0.012, `7 杆子附近乱玩 40 次：板子最深插进杆子 / 立柱 ${(R.fuzz.mx * 100).toFixed(2)} 厘米（摔了 ${R.fuzz.bails} 次）`);

  // 8 转板方向（真实触摸）：后指往屏幕右边划，板头往右转
  await p.evaluate(() => { __dbg.input.enabled = true; const sk = __dbg.sk; __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = 2; __dbg.renderQ.copy(sk.qv); });
  await sleep(500);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const g = await p.evaluate(() => __dbg.geo);
  const atp = (al, ac) => { const ux = g.fx - g.rx, uy = g.fy - g.ry, L2 = Math.hypot(ux, uy), nx = ux / L2, ny = uy / L2; return [g.cx + nx * al * L2 / 2 + (-ny) * ac * g.halfW, g.cy + ny * al * L2 / 2 + nx * ac * g.halfW]; };
  const A = atp(-0.55, 0), B = atp(0.5, 0);
  await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]); await sleep(60);
  { const ps = []; for (let i = 1; i <= 6; i++) { ps.push(send('touchMove', [[A[0] + i * 22, A[1], 1], [B[0], B[1], 2]])); await sleep(8); } await Promise.all(ps); }
  await send('touchEnd', []);
  let dirOk = null, sample = null;
  for (let i = 0; i < 60 && dirOk == null; i++) {
    await sleep(10);
    const s = await p.evaluate(() => { const bd = __dbg.board, cam = __dbg.cam, V = cam.position.constructor; bd.root.updateMatrixWorld(true);
      const pr = (z) => Math.round((bd.shoveG.localToWorld(new V(0, 0, z)).project(cam).x + 1) * 195); return { sh: __dbg.sk.shoveA, nose: pr(0.4), tail: pr(-0.4) }; });
    if (Math.abs(s.sh) > 0.25 && Math.abs(s.sh) < 1.3) { dirOk = s.nose > s.tail; sample = s; }
  }
  ok(dirOk === true, `8 后指往屏幕右边划：板头往右转（转到 ${sample ? Math.round(Math.abs(sample.sh) * 57.3) + '° 时板头在 x=' + sample.nose + '，板尾在 x=' + sample.tail : '没转'}）`);
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
