// 声音：点开始后声音设备要能起来（不同采样率都试一遍），真实录音（起跳、落地、接板）要解出来换上，播放不报错
// 2026-11-07 发现：混响用了固定 48000 的采样率，声音设备是 44100 时整个声音起不来 —— 这个测试防止再犯
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch();
  for (const rate of [0, 44100, 48000, 24000]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx);
    const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
    await p.addInitScript((rate) => {
      window.__noRender = true;
      localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: false, music: true, sfx: true, dots: true, flick: 3, steer: 3, time: 'day' }));
      if (rate) { const AC = window.AudioContext; window.AudioContext = class extends AC { constructor() { super({ sampleRate: rate }); } }; }
    }, rate);
    await p.goto(L.URL); await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => {
      document.getElementById('inName').value = 'T'; __dbg.startGame('free');
      await new Promise((r) => setTimeout(r, 1200));
      const A = __dbg.Aud, s = A.smp;
      let played = true; try { A.pop(0.5); A.land(3, 'clean'); A.catch(); A.kick(); A.flick(); A.clack(3); A.bail(); A.update(4, 'ground', 'concrete', null, 0, 0); } catch (e) { played = String(e); }
      return { ctx: !!A.ctx, rate: A.ctx && A.ctx.sampleRate, real: !!(s.pop_real && s.land_real && s.catch_real), n: ['pop', 'land', 'catch', 'clack', 'flick', 'tumble', 'impact', 'grindOn'].map((k) => (s[k] ? s[k].length : 0)), loops: !!(A.roll && A.grindM && A.rev && A.rev.buffer), played };
    });
    const tag = rate ? `声音设备 ${rate} Hz` : '默认采样率';
    ok(r.ctx, `${tag}：声音设备起来了（${r.rate} Hz）`);
    ok(r.real, `${tag}：起跳、落地、接板换成了真实录音`);
    ok(r.n.every((v) => v >= 3) && r.loops, `${tag}：采样都在（${r.n.join('/')}），持续的声音和混响都在`);
    ok(r.played === true && !errs.length, `${tag}：播放各种声音不报错 ${r.played === true ? '' : r.played} ${errs.join(' | ')}`);
    await ctx.close();
  }
  console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
