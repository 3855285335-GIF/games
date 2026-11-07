// 新招式（2026-11-07）：Impossible、Stall（Nose / Tail）、Flip out（从杆上翻下来）
//  · Impossible：两指一起往板尾划（键盘 U）→ 起跳的同时板子竖着绕后支架翻一圈；接住落地叫 Impossible；翻到一半摔不穿模
//  · Stall：只按前指 / 后指，板头 / 板尾落到台边、坡顶铁边上 → 停住；松手退回来那一侧；起跳跳上去
//  · Flip out：在杆上前指侧拨，再起跳下杆 → Kickflip Out
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { let m = 99; Math.random = () => (m = (m * 1103515245 + 12345) % 2147483648) / 2147483648; localStorage.setItem('fs_pracDone', 'true'); window.__noRender = true; });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate((d) => { __dbg.startGame('free'); __dbg.input.enabled = false; window.__TR = d; }, !!process.env.DBG);
  const R = await p.evaluate(() => {
    const { sk, combo, T } = __dbg; const out = {}; let ev = [], got = [];
    const orig = Object.assign({}, sk.cb);
    for (const k of Object.keys(orig)) sk.cb[k] = (...a) => { ev.push(k + (k === 'onBail' ? ':' + a[0] : k === 'onGrind' ? ':' + (a[0] ? a[1].name : 'off') : '')); return orig[k](...a); };
    const oadd = combo.add.bind(combo); combo.add = (n, pts) => { got.push(n); return oadd(n, pts); };
    const ost = combo.startLive.bind(combo); combo.startLive = (n, r, k) => { got.push(n); return ost(n, r, k); };
    const I = (o) => Object.assign({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 2, touching: 2, caught: true, capT: -9, auto: false, fb: 0, kick: 0 }, o);
    const place = (x, z, yaw, s) => { combo.clear(); sk.reset(x, z, yaw); sk.s = s; sk.qa.copy(sk.qv); __dbg.renderQ.copy(sk.qv); ev = []; got = []; };
    const at = (t, s) => Math.abs(t - s) < 0.5 / 240;
    // 穿模检查：板子轮廓最深陷进地面 / 东西多少（米）。在弧形坡上滑时直板子两头本来就会比弯的坡面低一点（以前就这样），不算
    const pen = () => { if (sk.mode === 'grind' || (sk.mode === 'ground' && Math.hypot(sk.gx, sk.gz) > 0.3)) return 0; const q = sk.mode === 'bail' ? sk.bq : sk.mode === 'air' ? sk.qa : sk.qv; const pts = sk._hull(sk.p.x, sk.p.y, sk.p.z, q, sk.mode === 'bail' ? 0 : sk.visPitch(), sk.mode === 'bail' ? 0 : sk.flipA, sk.mode === 'bail' ? 0 : sk.shoveA); let w = 0; for (const P of pts) w = Math.max(w, T.height(P.x, P.z) - P.y); return w; };
    const run = (sec, fn) => { let mp = 0, modes = [], trace = []; for (let i = 0; i < sec * 240; i++) { const t = i / 240, inp = I(); if (fn) fn(t, inp, i); sk.step(1 / 240, inp); mp = Math.max(mp, pen()); const m = sk.mode + (sk.grind ? ':' + sk.grind.name : ''); if (modes[modes.length - 1] !== m || (i % 24 === 0 && window.__TR)) { if (modes[modes.length - 1] !== m) modes.push(m); trace.push(t.toFixed(2) + ' ' + m + ' p=' + sk.p.x.toFixed(2) + ',' + sk.p.y.toFixed(2) + ',' + sk.p.z.toFixed(2) + ' v=' + sk.v.x.toFixed(1) + ',' + sk.v.y.toFixed(1) + ',' + sk.v.z.toFixed(1)); } } return { ev: ev.slice(), got: got.slice(), mp, modes, trace }; };
    // Impossible
    out.imp = (() => { place(2.6, -9.6, 0, 3); return run(1.8, (t) => { if (at(t, 0)) sk.flick('imp', 1, 0.5); if (at(t, 0.03)) sk.pop('tail', 0.6); }); })();
    out.impPeak = (() => { place(2.6, -9.6, 0, 3); let mx = 0; run(0.6, (t) => { if (at(t, 0)) { sk.pop('tail', 0.6); sk.flick('imp', 1, 0.5); } mx = Math.max(mx, sk.impA || 0); }); return mx; })();
    out.impFlip = (() => { place(2.6, -9.6, 0, 3); return run(1.8, (t) => { if (at(t, 0)) { sk.flick('imp', 1, 0.5); sk.flick('front', -1, 0.1); } if (at(t, 0.03)) sk.pop('tail', 0.8); }); })();
    // Impossible 翻到一半摔（太早接住）：并进摔倒姿态，不穿模
    out.impBail = (() => { place(2.6, -9.6, 0, 3); return run(2.2, (t, inp) => { if (at(t, 0)) { sk.pop('tail', 0.5); sk.flick('imp', 1, 0.5, 1); } inp.capT = t > 0.2 ? 2 : -9; inp.fingers = t > 0.2 ? 1 : 0; }); })();
    // Flip out：磨着平杆，前指侧拨，起跳下杆
    out.flipOut = (() => {
      place(4.4, -4.6, 0, 3.5); const r = T.rails.find((x) => x.kind === 'rail' && x.flat);
      sk._startGrind(r, { u: 1.0, x: 4.4, y: 0.36, z: -4.6 }, 3.5); ev = []; got = [];
      return run(2.2, (t, inp) => { inp.hold = true; if (at(t, 0.4)) sk.flick('front', -1, 0.1); if (at(t, 0.45)) sk.pop('tail', 0.6); });
    })();
    // Nose Stall：在四分之一管上冲到坡顶，只按前指
    out.qp = (() => {
      let best = null;
      for (const s0 of [4.4, 4.7, 5.0, 5.3, 5.6]) {
        place(0, 3.0, 0, s0); let st = null;
        const r = run(5, (t, inp) => { inp.fb = -1; inp.fingers = 1; inp.touching = 1; if (sk.grind && sk.grind.type === 'stall') { st = st || { t, name: sk.grind.name }; if (t - st.t > 1.0) { inp.touching = 0; inp.fingers = 0; inp.fb = 0; } } });
        if (st) { best = { s0, ...r, st }; break; }
        best = best || { s0, ...r };
      }
      return best;
    })();
    // Nose Stall：从地上跳向长台的侧面，只按前指（板头卡在台边上），再起跳跳上去
    out.ledge = (() => {
      let best = null;
      for (const s0 of [0.6, 0.75, 0.9, 1.05, 1.2]) for (const pk of [0.2, 0.4]) {
        if (best && best.st) break;
        place(-2.75, 2.0, -Math.PI / 2, s0); let st = null, popped = false, onTop = false;
        const r = run(3.4, (t, inp) => { if (at(t, 0.02)) sk.pop('tail', pk); inp.fb = t > 0.1 ? -1 : 0; inp.fingers = t > 0.1 ? 1 : 2; if (sk.grind && sk.grind.type === 'stall') { st = st || { t, name: sk.grind.name, y: sk.p.y }; if (t - st.t > 0.8 && !popped) popped = sk.pop('tail', 0.5); } if (popped) { inp.fb = 0; inp.fingers = 2; if (sk.mode === 'ground' && sk.p.y > 0.4) onTop = true; } });
        if (st || !best) best = { s0, pk, ...r, st, popped, onTop, endY: sk.p.y, endX: sk.p.x };
      }
      return best;
    })();
    return out;
  });
  ok(R.imp.got.includes('Impossible') && !R.imp.ev.some((e) => /onBail/.test(e)) && R.imp.mp < 0.03, `1 Impossible：${R.imp.got.join(',') || '无'}（${R.imp.ev.join(' ')}，最深陷进 ${(R.imp.mp * 100).toFixed(1)} 厘米）`);
  ok(R.impPeak > 1.2 && R.impPeak < 6.4, `1b 空中板子确实竖着翻：0.6 秒里翻到 ${Math.round(R.impPeak * 57.3)}°`);
  ok(R.impFlip.got.some((n) => /Impossible Kickflip/.test(n)), `1c Impossible 加 Kickflip 一起：${R.impFlip.got.join(',')}`);
  ok(R.impBail.ev.some((e) => /onBail/.test(e)) && R.impBail.mp < 0.03, `1d Impossible 翻到一半就接（踩停了）：摔，不穿模（${R.impBail.ev.join(' ')}，最深 ${(R.impBail.mp * 100).toFixed(1)} 厘米）`);
  if (process.env.DBG) for (const k of ['flipOut', 'qp', 'ledge', 'impBail']) console.log(k, 'mp=' + R[k].mp.toFixed(3), R[k].ev.join(' '), '\n  ' + R[k].trace.join('\n  '));
  ok(R.flipOut.got.includes('Kickflip Out') && !R.flipOut.ev.some((e) => /onBail/.test(e)), `2 在杆上拨板再起跳下杆：${R.flipOut.got.join(',')}`);
  ok(R.qp.st && /Nose Stall/.test(R.qp.st.name) && R.qp.modes.slice(R.qp.modes.indexOf('grind:Nose Stall') + 1).includes('ground') && !R.qp.ev.some((e) => /onBail/.test(e)) && R.qp.mp < 0.03, `3 冲到坡顶只按前指：${R.qp.st ? R.qp.st.name : '没停住'}（速度 ${R.qp.s0}），松手退回坡里落地（${R.qp.modes.join(' → ')}）${R.qp.ev.filter((e) => /Bail/.test(e)).join(' ')}`);
  ok(R.ledge.st && /Nose Stall/.test(R.ledge.st.name) && R.ledge.popped && R.ledge.onTop && !R.ledge.ev.some((e) => /onBail/.test(e)), `4 跳向长台侧面只按前指：${R.ledge.st ? R.ledge.st.name : '没停住'}（速度 ${R.ledge.s0}、起跳 ${R.ledge.pk}），再起跳跳到台上（${R.ledge.onTop ? '落在台上了' : '没落到台上'}；${R.ledge.modes.join(' → ')}）${R.ledge.ev.filter((e) => /Bail/.test(e)).join(' ')}`);

  // 5 真实触摸：两指一起往板尾划 = Impossible
  await p.evaluate(() => { __dbg.input.enabled = true; const sk = __dbg.sk; __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = 2; __dbg.renderQ.copy(sk.qv); window.__nm = []; const c = __dbg.combo; if (!c.__w2) { const o = c.add.bind(c); c.add = (n, pts) => { window.__nm.push(n); return o(n, pts); }; c.__w2 = 1; } });
  await sleep(500);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const g = await p.evaluate(() => __dbg.geo);
  const atp = (al, ac) => { const ux = g.fx - g.rx, uy = g.fy - g.ry, L2 = Math.hypot(ux, uy), nx = ux / L2, ny = uy / L2; return [g.cx + nx * al * L2 / 2 + (-ny) * ac * g.halfW, g.cy + ny * al * L2 / 2 + nx * ac * g.halfW]; };
  const A = atp(-0.5, 0), B = atp(0.5, 0);
  await send('touchStart', [[A[0], A[1], 1], [B[0], B[1], 2]]); await sleep(60);
  { const ps = []; for (let i = 1; i <= 5; i++) { const a = atp(-0.5 - i * 0.3, 0), b2 = atp(0.5 - i * 0.3, 0); ps.push(send('touchMove', [[a[0], a[1], 1], [b2[0], b2[1], 2]])); await sleep(8); } await Promise.all(ps); }
  await send('touchEnd', []);
  let maxImp = 0; for (let i = 0; i < 40; i++) { await sleep(20); maxImp = Math.max(maxImp, await p.evaluate(() => __dbg.sk.impA || 0)); if (i === 30) { const c = await p.evaluate(() => __dbg.geo); await send('touchStart', [[c.cx, c.cy, 3]]); } }
  await sleep(1200); await send('touchEnd', []); await sleep(300);
  const nm = await p.evaluate(() => window.__nm.slice());
  ok(maxImp > 1, `5 真实触摸两指一起往板尾划：板子竖着翻了 ${Math.round(maxImp * 57.3)}°，招式 ${nm.join(',') || '无'}`);
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
