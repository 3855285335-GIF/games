// 画质：只由玩家决定；卡顿时只提示、不自动改
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const BASE = { easy: false, music: false, sfx: false, dots: true, time: 'auto' };
async function open(b, q, rafMs) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript((s) => localStorage.setItem('fs_settings', JSON.stringify(s)), Object.assign({ q }, BASE));
  if (rafMs) await p.addInitScript((ms) => { window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), ms); }, rafMs);
  await p.goto(L.URL); await p.waitForTimeout(1500); await p.evaluate(() => { window.__noRender = true; });
  return { ctx, p, errs };
}
const st = (p) => p.evaluate(() => ({
  saved: JSON.parse(localStorage.getItem('fs_settings') || '{}').q,
  on: [...document.querySelectorAll('#sQ span')].filter((s) => s.classList.contains('on')).map((s) => s.textContent).join(','),
  note: document.getElementById('sQNote').textContent,
  pr: +(document.getElementById('gl').width / innerWidth).toFixed(2),
  tip: !document.getElementById('qTip').classList.contains('hide'),
  tipT: document.getElementById('qTipT').textContent,
  down: !document.getElementById('qTipDown').classList.contains('hide'),
}));
// 一直等到出现提示（最多 maxMs），返回用了多少秒；没出现返回 -1
async function waitTip(p, maxMs) { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { if ((await st(p)).tip) return +((Date.now() - t0) / 1000).toFixed(1); await sleep(250); } return -1; }
const pick = (p, label) => p.evaluate((l) => [...document.querySelectorAll('#sQ span')].find((s) => s.textContent === l).click(), label);

(async () => {
  const b = await L.launch();
  // A：旧版“自动”(-1) → 变成“高”；四档都能选，分辨率跟着变
  {
    const { ctx, p, errs } = await open(b, -1, 0);
    let s = await st(p); ok(s.on === '高' && s.pr === 2 && /推荐/.test(s.note), `A 旧的自动 → 高（${s.on}，${s.pr}x，${s.note}）`);
    for (const [l, pr, q] of [['极高', 3, 3], ['低', 1, 0], ['中', 1.5, 1], ['高', 2, 2]]) {
      await pick(p, l); await sleep(150); s = await st(p);
      ok(s.on === l && s.pr === pr && s.saved === q, `A 选「${l}」→ ${s.pr}x，保存 q=${s.saved}，说明：${s.note}`);
    }
    ok(!errs.length, 'A 无报错 ' + errs.join(' | ')); await ctx.close();
  }
  // B/C/D/E 同时跑
  const runs = [
    (async () => { // B：很卡 → 提示 + 按钮；不自动改；点按钮降一档；15 秒后还卡再提示；点 ✕ 后不再出现
      const { ctx, p, errs } = await open(b, 2, 45);
      await p.tap('#mFree'); const w = await waitTip(p, 25000);
      let s = await st(p); ok(s.tip && /画面有点卡/.test(s.tipT) && s.down, `B 卡顿提示出现（开局后 ${w}s）：「${s.tipT}」按钮=${s.down}`);
      ok(s.pr === 2 && s.on === '高' && s.saved === 2, `B 没有自动改画质（${s.on} ${s.pr}x）`);
      await p.tap('#qTipDown'); await sleep(300); s = await st(p);
      ok(s.pr === 1.5 && s.on === '中' && s.saved === 1 && /已调到「中」/.test(s.tipT), `B 点“调低画质”→ ${s.on} ${s.pr}x：「${s.tipT}」`);
      await sleep(3000); s = await st(p); ok(!s.tip, 'B 确认提示 2.5 秒后自己收起');
      await sleep(19500); s = await st(p); ok(s.tip && s.down, `B 还卡 → 再提醒一次：「${s.tipT}」`);
      await p.tap('#qTipX'); await sleep(300); s = await st(p); ok(!s.tip && s.saved === 1, 'B 点 ✕ 收起，画质还是「中」');
      await sleep(12000); s = await st(p); ok(!s.tip && s.saved === 1 && s.pr === 1.5, 'B 关掉后这次不再打扰，也没再自动改');
      ok(!errs.length, 'B 无报错 ' + errs.join(' | ')); await ctx.close();
    })(),
    (async () => { // C：约 30 帧（低电量模式）→ 提示里说明限帧
      const { ctx, p, errs } = await open(b, 2, 33);
      await p.tap('#mFree'); const w = await waitTip(p, 25000);
      const s = await st(p); ok(s.tip && /低电量/.test(s.tipT) && s.down, `C 30 帧（${w}s）→ 「${s.tipT}」按钮=${s.down}`);
      ok(s.pr === 2, 'C 没有自动改画质');
      ok(!errs.length, 'C 无报错 ' + errs.join(' | ')); await ctx.close();
    })(),
    (async () => { // D1：已经是“低”还卡（不是 30 帧）→ 没什么可建议的，不打扰
      const { ctx, p, errs } = await open(b, 0, 45);
      await p.tap('#mFree'); const w = await waitTip(p, 20000);
      ok(w < 0, 'D1 已是「低」→ 20 秒内都不提示');
      ok(!errs.length, 'D1 无报错 ' + errs.join(' | ')); await ctx.close();
    })(),
    (async () => { // D2：已经是“低”、约 30 帧 → 只说明低电量，没有按钮
      const { ctx, p, errs } = await open(b, 0, 33);
      await p.tap('#mFree'); const w = await waitTip(p, 25000);
      const s = await st(p); ok(s.tip && /低电量/.test(s.tipT) && !s.down, `D2（${w}s）「${s.tipT}」按钮=${s.down}`);
      ok(!errs.length, 'D2 无报错 ' + errs.join(' | ')); await ctx.close();
    })(),
    (async () => { // E：练习面板开着 → 不弹提示挡住教学
      const { ctx, p, errs } = await open(b, 2, 45);
      await p.tap('#mPrac'); const w = await waitTip(p, 20000);
      ok(w < 0, 'E 练习中 20 秒内都不弹提示');
      ok(!errs.length, 'E 无报错 ' + errs.join(' | ')); await ctx.close();
    })(),
  ];
  await Promise.all(runs);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
