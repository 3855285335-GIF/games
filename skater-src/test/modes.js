// 第 4 步：连续模式、分模式排行榜、新挑战、练习按力度、回放里显示接板早晚
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const log = { joins: [], bcast: 0, rest: [], perSec: {}, scores: [] }; await L.mock(ctx, log);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { window.__noRender = true; localStorage.setItem('fs_pracDone', 'true'); });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate(() => { document.getElementById('inName').value = 'Tester'; });

  // 1 连续模式：摔一次就结算，成绩上传到「spot_run」
  ok(await p.evaluate(() => !!document.getElementById('mRun')), '1a 主菜单有「连续」按钮');
  await p.click('#mRun'); await sleep(300);
  const r1 = await p.evaluate(() => { const { combo, sk } = __dbg; combo.add('Kickflip', 1200); combo.add('Ollie', 300); combo.bank(); return { mode: __dbg.mode, total: combo.total, hint: document.getElementById('hint') ? document.getElementById('hint').textContent : '' }; });
  ok(r1.mode === 'run' && r1.total > 0, `1b 进入连续模式，先拿了 ${r1.total} 分`);
  await p.evaluate(() => __dbg.sk._toBail('wall'));
  await sleep(500);
  ok(await p.evaluate(() => __dbg.state === 'play'), '1c 摔了以后先停一下（看清怎么摔的），还没结算');
  await sleep(1300);
  const r2 = await p.evaluate(() => ({ state: __dbg.state, title: document.getElementById('rTitle').textContent, score: document.getElementById('rScore').textContent }));
  ok(r2.state === 'result' && /摔了/.test(r2.title), `1d 摔一次就结算：${r2.title} ${r2.score}`);
  await sleep(500);
  const sub = log.scores.find((x) => x.p_map === 'spot_run');
  ok(sub && sub.p_score === r1.total, `1e 成绩上传到连续模式的榜（${sub ? sub.p_map + ' ' + sub.p_score : '没有上传'}）`);
  await p.click('#rAgain'); await sleep(300);
  ok(await p.evaluate(() => __dbg.mode === 'run' && __dbg.state === 'play' && __dbg.combo.total === 0), '1f 「再来一次」还是连续模式，分数清零');
  // 自由滑摔了不结算
  await p.evaluate(() => { __dbg.startGame('free'); __dbg.sk._toBail('wall'); });
  await sleep(1800);
  ok(await p.evaluate(() => __dbg.state === 'play'), '1g 自由滑摔了不会结算');
  // 限时赛时间到：上传到「spot」
  await p.evaluate(() => { __dbg.startGame('timed'); __dbg.combo.add('Ollie', 500); __dbg.combo.bank(); __dbg.__setTime(0.05); });
  await sleep(600);
  const r3 = await p.evaluate(() => ({ state: __dbg.state, title: document.getElementById('rTitle').textContent }));
  ok(r3.state === 'result' && /时间到/.test(r3.title) && log.scores.some((x) => x.p_map === 'spot'), `1h 限时赛时间到：${r3.title}，成绩进限时榜`);

  // 2 排行榜：两个标签，连续模式读 spot_run
  await p.click('#rLb'); await sleep(600);
  const lb1 = await p.evaluate(() => ({ chips: [...document.querySelectorAll('#lbMaps .chip')].map((c) => c.textContent), on: (document.querySelector('#lbMaps .chip.on') || {}).textContent, list: document.getElementById('lbList').textContent }));
  ok(lb1.chips.length === 2 && /限时/.test(lb1.on) && /Tester/.test(lb1.list), `2a 排行榜有「限时」「连续」两页，打开的是刚玩的限时（${lb1.chips.join(' / ')}）`);
  await p.evaluate(() => document.querySelectorAll('#lbMaps .chip')[1].click()); await sleep(600);
  const lb2 = await p.evaluate(() => ({ on: (document.querySelector('#lbMaps .chip.on') || {}).textContent, list: document.getElementById('lbList').textContent }));
  ok(/连续/.test(lb2.on) && /Tester/.test(lb2.list) && new RegExp(String(r1.total)).test(lb2.list.replace(/,/g, '')), `2b 切到连续榜：${lb2.list.slice(0, 60)}`);
  await p.evaluate(() => document.getElementById('lbClose').click());

  // 3 新挑战（直接跑物理，招式落地时走正常的挑战判定）
  const ch = await p.evaluate(() => {
    __dbg.startGame('free'); __dbg.input.enabled = false;
    const { sk, T } = __dbg;
    const I = () => ({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 2, touching: 2, caught: true, capT: -9, auto: false, fb: 0, kick: 0 });
    const at = (t, x) => Math.abs(t - x) < 0.5 / 240;
    const run = (sec, fn) => { for (let i = 0; i < sec * 240; i++) { const inp = I(); fn && fn(i / 240, inp); sk.step(1 / 240, inp); __dbg.combo.tick(1 / 240, sk); __dbg.trackRuns(1 / 240); } };
    const place = (x, z, yaw, s) => { __dbg.combo.clear(); sk.reset(x, z, yaw); sk.s = s; };
    const done = () => new Set(JSON.parse(localStorage.getItem('fs_chal') || '[]'));
    const out = {};
    place(2.6, -9.6, 0, 4); run(2, (t) => { if (at(t, 0)) sk.pop('tail', 0); }); out.ollieLow = done().has('ollieLow');
    place(2.6, -9.6, 0, 4); run(2.4, (t) => { if (at(t, 0)) sk.pop('tail', 1); }); out.high1 = done().has('high1');
    // 踩点：板子转完的那一刻手指按回去
    place(2.6, -9.6, 0, 4); run(2, (t, i) => { if (at(t, 0)) sk.pop('tail', 0.6); if (at(t, 0.05)) sk.flick('front', -1, 0.1, 1.0); const P = sk.air && sk.air.pF; i.capT = P && sk.air.t >= P.t0 + P.D ? 2 : -9; }); out.perfect = done().has('perfect');
    place(2.6, -9.6, 0, 4); run(2.6, (t) => { if (at(t, 0)) sk.pop('tail', 1); if (at(t, 0.04)) sk.flick('front', -1, 0.85); }); out.triple = done().has('triple');
    place(2.6, -9.6, 0, 4); run(2.2, (t) => { if (at(t, 0)) sk.pop('tail', 0.9); if (at(t, 0.04)) sk.flick('front', -1, 0.7); }); out.double = done().has('double');
    place(2.6, -9.6, 0, 4); run(2.2, (t) => { if (at(t, 0)) sk.pop('tail', 0.9); if (at(t, 0.04)) sk.flick('back', -1, 0.7); }); out.shove360 = done().has('shove360');
    // 长台：从南头起跳上台边，一口气磨到北头
    out.ledgeD = 0;
    for (let tp = 0.05; tp <= 0.6 && !done().has('ledgeFull'); tp += 0.02) {
      place(-3.95, -8.0, 0, 7); let mx = 0;
      run(3.5, (t, i) => { if (at(t, tp)) sk.pop('tail', 0.3); i.fingers = 2; i.caught = true; mx = Math.max(mx, __dbg.grindRun.d); });
      out.ledgeD = Math.max(out.ledgeD, mx);
    }
    out.ledgeFull = done().has('ledgeFull');
    // Manual 台：放在台面南头，单指压板尾一路翘到北头
    place(0.4, -3.55, 0, 3.2); let pd = 0;
    run(1.8, (t, i) => { i.manual = 0.6; i.fingers = 1; pd = Math.max(pd, __dbg.padRun.d); });
    out.padD = +pd.toFixed(2); out.manualPad = done().has('manualPad');
    out.n = __dbg.CHALLENGES.length; out.count = document.getElementById('chCount').textContent;
    return out;
  });
  for (const k of ['ollieLow', 'high1', 'perfect', 'double', 'triple', 'shove360']) ok(ch[k], `3 挑战「${k}」能完成`);
  ok(ch.ledgeFull, `3 挑战「一口气滑完整根长台」能完成（一次最远磨了 ${ch.ledgeD.toFixed(1)} 米）`);
  ok(ch.manualPad, `3 挑战「Manual 台从头翘到尾」能完成（台面上翘了 ${ch.padD} 米）`);
  ok(ch.n === 37 && /\/37$/.test(ch.count), `3 挑战一共 ${ch.n} 个，主菜单显示 ${ch.count}`);
  // 旧版本的挑战记录（已经删掉的名字）不算进完成数
  const cnt = await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('fs_chal') || '[]'); return a.length; });

  // 4 回放：接板接早了多少，回放里能看到，而且从接板前开始半速放
  const rp = await p.evaluate(async () => {
    __dbg.startGame('free'); __dbg.input.enabled = false;
    const { sk } = __dbg;
    const I = () => ({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 0, touching: 0, caught: false, capT: -9, auto: false, fb: 0, kick: 0 });
    __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = 4;
    // 正常的游戏循环会录回放：这里手动一帧帧走物理，同时录下来
    for (let i = 0; i < 1.6 * 240; i++) {
      const t = i / 240, inp = I();
      if (i === 0) sk.pop('tail', 0.5);
      if (i === 12) sk.flick('front', -1, 0.3, 1.0);
      if (t >= 0.3) { inp.fingers = 1; inp.touching = 1; inp.capT = 2; } // 拨完 0.25 秒就按回去：接太早，板子被踩停
      sk.step(1 / 240, inp); if (i % 4 === 0) __dbg.rec.push(1 / 60, sk, sk.qv, 0, 0, 0, 0);
    }
    const ev = __dbg.rec.ev.map((e) => e.text);
    __dbg.startReplay();
    const speed = __dbg.player && __dbg.player.speed, t0 = __dbg.player.t, et = __dbg.player.ev[0] ? __dbg.player.ev[0].t : -1;
    const el = document.getElementById('rpInfo');
    for (let k = 0; k < 80 && el.classList.contains('hide'); k++) await new Promise((r) => setTimeout(r, 50)); // 放到接板那一下时显示
    return { ev, speed, before: et - t0, shown: !el.classList.contains('hide'), text: el.textContent };
  });
  ok(rp.ev.length === 1 && /翻板接太早了：还差 \d+°/.test(rp.ev[0]), `4a 接板记下来了：${rp.ev.join(' | ')}`);
  ok(rp.speed === 0.5 && rp.before >= 0 && rp.before <= 1.51 && rp.shown && /接太早/.test(rp.text), `4b 打开回放：半速、从接板前 ${rp.before.toFixed(2)} 秒开始放，放到接板时屏幕上显示「${rp.text}」`);
  await p.evaluate(() => document.getElementById('rpExit').click());

  // 5 练习：16 步（2026-11-07 加了杆上侧划、Flip out、Stall、Impossible）；跳高了会提示轻一点
  const pr = await p.evaluate(() => {
    __dbg.startGame('practice'); __dbg.input.enabled = false;
    const P = __dbg.practice, { sk } = __dbg, toasts = [];
    const tz = document.getElementById('toast'); const mo = new MutationObserver(() => toasts.push(tz.textContent)); if (tz) mo.observe(tz, { childList: true, subtree: true, characterData: true });
    while (P.i < 4) P.next();
    const t0 = document.getElementById('pracT').textContent, n = document.getElementById('pracN').textContent;
    const I = () => ({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 2, touching: 2, caught: true, capT: -9, auto: false, fb: 0, kick: 0 });
    const hop = (k) => { __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = 4; for (let i = 0; i < 2.4 * 240; i++) { if (i === 0) sk.pop('tail', k); sk.step(1 / 240, I()); } };
    hop(1); const stay = P.i; hop(0); const after = P.i;
    // 第 7～10 步：先拨再跳（拨完 0.1 秒内起跳），Kickflip、Pop Shove-it、360 Shove-it、Double Kickflip
    const trick = (which, k, popK) => { __dbg.combo.clear(); sk.reset(2.6, -9.6, 0); sk.s = 4; for (let i = 0; i < 2.6 * 240; i++) { if (i === 0) sk.flick(which, -1, k); if (i === 20) sk.pop('tail', popK); sk.step(1 / 240, I()); } };
    while (P.i < 6) P.next();
    const steps = []; for (const [w, k, pk] of [['front', 0.1, 0.5], ['back', 0.1, 0.5], ['back', 0.6, 0.8], ['front', 0.6, 0.9]]) { const b = P.i; trick(w, k, pk); steps.push(b + '→' + P.i); }
    return { t0, n, stay, after, t1: document.getElementById('pracT').textContent, steps };
  });
  ok(/16$/.test(pr.n), `5a 练习一共 16 步（${pr.n}）`);
  ok(pr.stay === 4 && pr.after === 5, `5b 「${pr.t0}」：用力跳不算过，轻轻跳才过；下一步是「${pr.t1}」`);
  ok(pr.steps.join(',') === '6→7,7→8,8→9,9→10', `5c 先拨再跳的四步（Kickflip、Pop Shove-it、360 Shove-it、Double Kickflip）都能过：${pr.steps.join(', ')}`);

  console.log('errors:', errs.length ? errs : 'none');
  if (errs.length) fails++;
  console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
