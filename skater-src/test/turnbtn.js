// 中转相关检查：设置里的「联机中转测试」按钮已按用户要求删掉；真正联机用的服务器列表顺序要对
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx, null, { yard: true });
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_pracDone', 'true'); });
  await p.goto(L.URL); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('mSet').click()); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ btn: !!document.getElementById('sTurn'), res: !!document.getElementById('sTurnRes'), txt: document.getElementById('settings').textContent, shown: !document.getElementById('settings').classList.contains('hide') }));
  ok(r.shown && !r.btn && !r.res && !/中转测试/.test(r.txt), '1 设置面板打开了，里面没有「联机中转测试」');
  await p.evaluate(() => document.getElementById('sClose').click()); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('settings').classList.contains('hide')), '2 设置面板能正常关上');
  ok(!errs.length, '3 没有报错 ' + (errs.join(' ') || ''));
  await ctx.close();

  // 4 真正联机用的服务器列表：没有 Metered 的 UDP（不然国内会优先走它，花 500 MB 的额度），ExpressTURN 排在 Metered 前面
  { const html = require('fs').readFileSync(L.URL.replace('file://', ''), 'utf8');
    const a = html.indexOf('turn:free.expressturn.com:3478?transport=udp'), b2 = html.indexOf('turn:free.expressturn.com:3478?transport=tcp'), c = html.indexOf('turns:global.relay.metered.ca:443?transport=tcp');
    ok(!html.includes("'turn:global.relay.metered.ca:80'") && !html.includes('"turn:global.relay.metered.ca:80"') && a > 0 && a < b2 && b2 < c, '4 服务器列表：ExpressTURN UDP → TCP → Metered TLS，没有 Metered UDP');
    ok(!html.includes('stun.qq.com') && html.includes('stun.hitv.com'), '5 打洞列表：有芒果TV，没有腾讯'); }

  console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
