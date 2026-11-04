// 「联机中转测试」按钮：每个中转地址（UDP / TCP / TLS）和每个打洞服务器单独显示 ✓/✗，最后一行给结论
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// 假的 RTCPeerConnection：按配置决定给出哪些地址
// mode：'mix' 小米能打洞 + ExpressTURN 的 UDP、TCP 都能中转（像开 VPN）/ 'cn' 国内不开 VPN：ExpressTURN 只有 TCP 通，Metered TLS 通
//       'stunonly' 只有芒果TV能打洞 / 'none' 一个地址都拿不到 / 'hostonly' 只有本机地址
const fake = (mode) => {
  class FakePC {
    constructor(cfg) { this.cfg = cfg; this.onicecandidate = null; this.closed = false; }
    createDataChannel() { return {}; }
    async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
    async setLocalDescription() {
      const s = this.cfg.iceServers[0], url = [].concat(s.urls).join(' '), relay = this.cfg.iceTransportPolicy === 'relay';
      const out = [];
      const C = (t, extra) => ({ candidate: 'candidate:1 1 udp 1 1.2.3.4 5000 typ ' + t + ' generation 0' + (extra || ''), relayProtocol: t === 'relay' ? 'udp' : undefined });
      if (mode !== 'none') {
        if (!relay) out.push(C('host'));
        if (mode === 'mix' && !relay && /miwifi/.test(url)) out.push(C('srflx'));
        if (mode === 'stunonly' && !relay && /hitv/.test(url)) out.push(C('srflx'));
        if (mode === 'mix' && relay && /expressturn/.test(url)) out.push(C('relay'));
        if (mode === 'cn' && relay && (/expressturn.*transport=tcp/.test(url) || /^turns:.*metered/.test(url))) out.push(C('relay'));
        if (mode === 'cn' && !relay && /miwifi/.test(url)) out.push(C('srflx'));
      }
      out.push({ candidate: '' }); // 有的浏览器先发空的「收集完了」
      let i = 0; const next = () => { if (this.closed) return; const c = out[i++]; this.onicecandidate && this.onicecandidate({ candidate: c || null }); if (c) setTimeout(next, 30); };
      setTimeout(next, 30);
    }
    close() { this.closed = true; }
  }
  window.RTCPeerConnection = FakePC;
};

(async () => {
  const b = await L.launch();
  const run = async (name, init, arg) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx, null, { yard: true });
    const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
    if (init) await p.addInitScript(init, arg);
    await p.addInitScript(() => { localStorage.setItem('fs_pracDone', 'true'); });
    await p.goto(L.URL); await p.waitForTimeout(1200);
    await p.evaluate(() => { const bt = document.getElementById('sTurn'); window.__tt = 0; const t0 = performance.now();
      new MutationObserver(() => { if (bt.textContent === '再测一次' && !window.__tt) window.__tt = performance.now() - t0; }).observe(bt, { childList: true, characterData: true, subtree: true }); bt.click(); });
    await p.waitForFunction(() => window.__tt > 0, null, { timeout: 20000, polling: 100 });
    const r = await p.evaluate(() => ({ html: document.getElementById('sTurnRes').innerHTML, dis: document.getElementById('sTurn').disabled, ms: window.__tt }));
    console.log('  [' + name + '] ' + (r.ms / 1000).toFixed(1) + ' 秒\n    ' + r.html.split('<br>').join('\n    '));
    await ctx.close();
    return { lines: r.html.split('<br>'), dis: r.dis, errs, ms: r.ms };
  };

  // 1 真实浏览器（测试机连不上外网的 UDP）：5 个打洞服务器都列出来，有结论，7 秒左右结束
  { const r = await run('真实');
    ok(r.lines.length === 5 && /^ExpressTURN UDP 3478（中转）：/.test(r.lines[0]) && /^ExpressTURN TCP 3478（中转）：/.test(r.lines[1]) && /^Metered TLS 443（中转）：/.test(r.lines[2]), '1 每个中转地址各一行（ExpressTURN UDP、TCP，Metered TLS）');
    ok(/^打洞：小米 [✓✗] · 芒果TV [✓✗] · B站 [✓✗] · Cloudflare [✓✗] · 谷歌 [✓✗]$/.test(r.lines[3]), '1b 打洞：5 个服务器各自显示');
    ok(/^结论：/.test(r.lines[4]) && !r.dis && !r.errs.length, '1c 有结论、按钮恢复、没报错 ' + (r.errs.join(' ') || ''));
    ok(r.ms < 8000, '1d 最多 7 秒出结果：' + (r.ms / 1000).toFixed(1) + ' 秒'); }
  // 2 小米能打洞 + ExpressTURN 能中转
  { const r = await run('能中转', fake, 'mix');
    ok(/UDP 3478（中转）：✓ 能连上（\d\.\d 秒）/.test(r.lines[0]) && /TCP 3478（中转）：✓/.test(r.lines[1]) && /Metered TLS 443（中转）：✗/.test(r.lines[2]), '2 ExpressTURN UDP、TCP ✓，Metered ✗');
    ok(/小米 ✓ · 芒果TV ✗/.test(r.lines[3]) && /中转能用/.test(r.lines[4]) && !/只通 TCP/.test(r.lines[4]), '2b 小米 ✓，结论「中转能用」（UDP 通，不提示卡）');
    ok(r.ms < 1500, '2c 都有结果时不用等满 7 秒：' + (r.ms / 1000).toFixed(1) + ' 秒'); }
  // 2d 国内不开 VPN 的真实情况：ExpressTURN UDP 不通、TCP 通，Metered TLS 通
  { const r = await run('国内', fake, 'cn');
    ok(/UDP 3478（中转）：✗/.test(r.lines[0]) && /TCP 3478（中转）：✓/.test(r.lines[1]) && /Metered TLS 443（中转）：✓/.test(r.lines[2]), '2d 国内：ExpressTURN UDP ✗、TCP ✓，Metered TLS ✓');
    ok(/中转能用/.test(r.lines[4]) && /只通 TCP \/ TLS/.test(r.lines[4]), '2e 国内：结论提示「只通 TCP / TLS，网络差时可能卡一点」'); }
  // 3 中转都不通，只有芒果TV能打洞
  { const r = await run('只能打洞', fake, 'stunonly');
    ok(/小米 ✗ · 芒果TV ✓/.test(r.lines[3]) && /中转连不上，但能打洞/.test(r.lines[4]) && /服务器转发/.test(r.lines[4]), '3 只有芒果TV ✓，结论「能打洞 + 服务器转发兜底」'); }
  // 4 只有本机地址（网络挡住了）
  { const r = await run('网络挡住', fake, 'hostonly');
    ok(!/✓/.test(r.lines.join('')) && /都不通/.test(r.lines[4]) && /服务器转发/.test(r.lines[4]), '4 全 ✗，结论「网络挡住了，走服务器转发」'); }
  // 5 一个地址都拿不到（App 把直连关了）
  { const r = await run('直连被关', fake, 'none');
    ok(/把直连功能关了/.test(r.lines[4]), '5 结论「App 把直连功能关了」'); }
  // 6 根本没有 WebRTC
  { const r = await run('没有WebRTC', () => { window.__noRTC = true; });
    ok(/不支持直连/.test(r.lines[4]) && /服务器转发/.test(r.lines[4]), '6 结论「不支持直连」'); }

  // 7 真正联机用的服务器列表：没有 Metered 的 UDP（不然国内会优先走它，花 500 MB 的额度），ExpressTURN 排在 Metered 前面
  { const html = require('fs').readFileSync(L.URL.replace('file://', ''), 'utf8');
    const a = html.indexOf('turn:free.expressturn.com:3478?transport=udp'), b2 = html.indexOf('turn:free.expressturn.com:3478?transport=tcp'), c = html.indexOf('turns:global.relay.metered.ca:443?transport=tcp');
    ok(!html.includes("'turn:global.relay.metered.ca:80'") && !html.includes('"turn:global.relay.metered.ca:80"') && a > 0 && a < b2 && b2 < c, '7 服务器列表：ExpressTURN UDP → TCP → Metered TLS，没有 Metered UDP'); }

  console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
