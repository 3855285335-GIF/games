// 回放存成视频 + 调手感用的力度显示
//  · 回放里点「存成视频」：从进度条位置录到结尾，录完弹出「保存 / 分享」；视频不是空的
//  · 设置里打开「显示划动力度」：起跳、拨板后屏幕上显示力度和转了几圈
// 注意：这里是电脑上的 Chromium，录出来是 WebM；iPhone Safari 上应该是 MP4（要真机试）
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: false, music: false, sfx: false, dots: false, flick: 3, steer: 3, time: 'day', force: true })); });
  await p.goto(L.URL); await p.waitForTimeout(2500);
  await p.evaluate(() => { __dbg.startGame('free'); const sk = __dbg.sk; sk.reset(2.6, -9.6, 0); sk.s = 3; __dbg.renderQ.copy(sk.qv); });
  await sleep(400);
  // 力度显示：键盘 Shift+J = 用力拨（0.7）+ 起跳（0.6）
  await p.keyboard.down('Shift'); await p.keyboard.press('KeyJ'); await p.keyboard.up('Shift');
  await sleep(250);
  const fi = await p.evaluate(() => ({ txt: document.getElementById('forceInfo').textContent, vis: !document.getElementById('forceInfo').classList.contains('hide') }));
  ok(fi.vis && /起跳 0\.60/.test(fi.txt) && /翻板 0\.70 → 2 圈/.test(fi.txt), `1 力度显示：「${fi.txt}」`);
  // 等录够回放（这台测试机画面慢，帧数少）
  for (let i = 0; i < 60; i++) { await sleep(250); if (await p.evaluate(() => __dbg.rec.buf.length >= 120)) break; }
  // 回放 → 存成视频
  await p.evaluate(() => __dbg.startReplay());
  await sleep(300);
  await p.evaluate(() => { const pl = __dbg.player; pl.t = Math.max(0, pl.dur - 2.5); });
  await p.click('#rpSave');
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < 30000) { await sleep(300); v = await p.evaluate(() => window.__lastVideo || null); if (v) break; }
  const pop = await p.evaluate(() => !document.getElementById('vidSave').classList.contains('hide'));
  ok(v && v.size > 5000 && pop, `2 回放存成视频：${v ? Math.round(v.size / 1024) + ' KB，' + v.type : '没录出来'}，弹出了「保存 / 分享」：${pop}`);
  await p.click('#vidNo');
  ok(await p.evaluate(() => document.getElementById('vidSave').classList.contains('hide')), '3 点「不要了」收起');
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
