// 和电脑玩 S.K.A.T.E.
//  · 电脑会的每个招都用真的物理滑出来，落地的名字和配方对得上；做不成时板子真的摔
//  · 一整轮：你出招 → 电脑照做（镜头跟过去看）→ 电脑出招 → 你没做成拿到字母
//  · 你做的招电脑照着做（按你落地的配方）
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_pracDone', 'true'); window.__noRender = true; });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  // 1 电脑的每个招：直接用它的物理滑一遍（不用等游戏循环），看落地的名字
  const R = await p.evaluate(() => {
    __dbg.startGame('free'); const ai = __dbg.ai; ai.setTerrain(__dbg.T);
    const out = [];
    for (const t of __dbg.AI_TRICKS) for (const good of [true, false]) {
      let res = null; ai.start(t.r, good, __dbg.sk.p, (r) => { res = r; });
      for (let i = 0; i < 60 * 8 && !res; i++) ai.step(1 / 60);
      out.push({ r: JSON.stringify(t.r), good, res });
    }
    return out;
  });
  const want = { '{}': 'Ollie', '{"flip":-1}': 'Kickflip', '{"flip":1}': 'Heelflip', '{"shove":-1}': 'Pop Shove-it', '{"shove":1}': 'FS Shove-it', '{"pop":"nose"}': 'Nollie',
    '{"spin":3.141592653589793}': 'BS 180 Ollie', '{"flip":-1,"shove":-1}': 'Varial Kickflip', '{"shove":-2}': '360 Shove-it', '{"flip":-2}': 'Double Kickflip',
    '{"pop":"nose","flip":-1}': 'Nollie Kickflip', '{"fakie":true,"flip":-1}': 'Fakie Kickflip', '{"flip":-1,"shove":-2}': '360 Flip', '{"imp":1}': 'Impossible',
    '{"spin":3.141592653589793,"flip":-1}': 'BS 180 Kickflip', '{"flip":-3}': 'Triple Kickflip', '{"spin":6.283185307179586}': 'BS 360 Ollie' };
  for (const x of R) {
    if (x.good) ok(x.res && x.res.ok && x.res.trick === want[x.r], `1 电脑做 ${want[x.r]}：${x.res ? (x.res.ok ? '做成了 ' + x.res.trick : '没做成') : '没结束'}`);
    else ok(x.res && !x.res.ok, `1b 电脑这次该失败的 ${want[x.r]}：${x.res ? (x.res.ok ? '居然做成了' : '摔了') : '没结束'}`);
  }
  // 2 一整轮（走游戏循环）：你出 Kickflip → 电脑照做（这次让它做成）→ 电脑出招 → 你摔了 → 你拿到 S
  await p.evaluate(() => { __dbg.toMenu(); __dbg.startGame('free'); __dbg.input.enabled = false; __dbg.sk8.vsAI(1); });
  const st0 = await p.evaluate(() => ({ phase: __dbg.sk8.state.phase, setter: __dbg.sk8.state.setter, me: __dbg.sk8.me, panel: !document.getElementById('sk8').classList.contains('hide') }));
  ok(st0.phase === 'set' && st0.setter === st0.me && st0.panel, `2a 开始：你先出招，面板出来了`);
  // 你出一个 Kickflip（直接让物理做：拨板 + 起跳，自动接板）
  await p.evaluate(() => { const sk = __dbg.sk; sk.reset(2.6, -9.6, 0); sk.s = 3; window.__rnd = Math.random; Math.random = () => 0.01; sk.flick('front', -1, 0.1); sk.pop('tail', 0.5); });
  let st = null;
  for (let i = 0; i < 50; i++) { await sleep(100); st = await p.evaluate(() => ({ phase: __dbg.sk8.state.phase, copier: __dbg.sk8.state.copier, trick: __dbg.sk8.state.trick, watch: __dbg.aiWatch, on: __dbg.ai.on })); if (st.on) break; }
  ok(st.phase === 'copy' && st.copier === 'ai' && st.trick === 'Kickflip' && st.on && st.watch, `2b 你做成 ${st.trick}：轮到电脑照做，它的板子开始滑了，镜头跟过去（${JSON.stringify(st)}）`);
  const camD = await p.evaluate(() => { const c = __dbg.cam.position, a = __dbg.ai.sk.p; return Math.hypot(c.x - a.x, c.z - a.z); });
  ok(camD < 4, `2c 镜头在电脑的板子附近（${camD.toFixed(1)} 米）`);
  const me = await p.evaluate(() => __dbg.sk8.me);
  const S = () => p.evaluate(() => { const s = __dbg.sk8.state; return { phase: s.phase, setter: s.setter, copier: s.copier, trick: s.trick, letters: s.letters, last: s.last, on: __dbg.ai.on, html: document.getElementById('sk8').textContent }; });
  for (let i = 0; i < 100; i++) { await sleep(100); st = await S(); if (st.phase === 'set' && !st.on) break; }
  ok(st.phase === 'set' && st.setter === me && st.letters.ai === 0, `2d 电脑照做成功（${st.last}），你接着出招`);
  const bail = () => p.evaluate(() => { __dbg.input.enabled = false; const sk = __dbg.sk; sk.reset(2.6, -9.6, 0); sk.s = 2; sk.pop('tail', 0.5); }); // 起跳不接板 → 摔
  await bail();
  for (let i = 0; i < 120; i++) { await sleep(100); st = await S(); if (st.phase === 'copy' && st.copier === me) break; }
  ok(st.phase === 'copy' && st.copier === me && st.setter === 'ai' && st.trick, `2e 你出招摔了 → 换电脑出招，它做成了 ${st.trick}，轮到你照做（${st.last}）`);
  await p.evaluate(() => { Math.random = window.__rnd; });
  await bail();
  for (let i = 0; i < 30; i++) { await sleep(100); st = await S(); if (st.letters[me] > 0) break; }
  ok(st.letters[me] === 1 && st.letters.ai === 0 && /S/.test(st.html), `2f 你没照做成：拿到字母 S（${JSON.stringify(st.letters)}）`);
  // 3 结束对战：电脑的板子收起来，能正常继续滑
  await p.evaluate(() => __dbg.sk8.cancel());
  const end = await p.evaluate(() => ({ state: __dbg.sk8.state, on: __dbg.ai.on, vis: __dbg.ai.board.root.visible, panel: document.getElementById('sk8').classList.contains('hide') }));
  ok(!end.state && !end.on && !end.vis && end.panel, `3 结束对战：面板和电脑的板子都收起来了`);
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
