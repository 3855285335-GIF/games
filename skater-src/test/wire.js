// 联机紧凑格式：数据准确、新旧版本混着玩都能看见、每条多大、走中转时发得少
const L = require('./lib'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const M = await L.mock(ctx); const errs = [];
  const mk = async (name, room, old) => {
    const p = await ctx.newPage(); L.errs(p, errs, name + ': ');
    await p.addInitScript((old) => { if (old) window.__noBin = true; localStorage.setItem('fs_pracDone', 'true'); localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: true, music: false, sfx: false, dots: false, time: 'day' })); }, !!old);
    await p.goto(L.URL); await p.waitForTimeout(1200); await p.evaluate(() => { window.__noRender = true; });
    await p.fill('#inName', name); await p.fill('#inRoom', room); await p.evaluate(() => document.getElementById('inRoom').dispatchEvent(new Event('change')));
    await p.tap('#mFree'); return p;
  };
  const waitLinks = async (pages, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const n = await Promise.all(pages.map((p) => p.evaluate(() => [...__dbg.online.links.values()].filter((l) => l.open).length))); if (n.every((x) => x >= 1)) return true; await sleep(200); } return false; };
  // 1 两个新版：直连后用紧凑格式
  const A = await mk('Alice', 'w1'), B = await mk('Bob', 'w1');
  ok(await waitLinks([A, B], 12000), '1a 两个新版直连上了');
  await A.evaluate(() => { const sk = __dbg.sk; sk.T = new __dbg.T.constructor({ minX: -300, maxX: 300, minZ: -300, maxZ: 300 }); sk.reset(0, 0, 0); sk.s = 4; }); // 场地小，一直推着滑会撞墙：A 换成一大片空地（这里只测联机）
  await A.keyboard.down('KeyW'); await A.keyboard.down('KeyD'); await sleep(2500);
  // A 做个招式（让 B 那边显示招式名）
  await A.evaluate(() => { __dbg.combo.add('Kickflip', 120); __dbg.combo.bank(); });
  await sleep(1200);
  const a = await A.evaluate(() => { const sk = __dbg.sk, L = [...__dbg.online.links.values()][0]; return { p: [sk.p.x, sk.p.y, sk.p.z], bin: !!L.peerBin, txB: L.txB, txN: L.txN, cfg: __dbg.online.o.getCfg() }; });
  const r = await B.evaluate(() => { const o = __dbg.online, r = [...o.remotes.values()][0]; return r && { name: r.R.name, binRx: o.binRx | 0, p: r.board.root.position.toArray(), cfg: r.cfg, tag: r.tag.innerHTML, score: r.R.score }; });
  ok(a.bin && r && r.binRx > 20, `1b 用的是紧凑格式：B 收到 ${r && r.binRx} 条`);
  ok(r && r.name === 'Alice' && JSON.stringify(r.cfg) === JSON.stringify(a.cfg), `1c 名字和板子配置对：${r && r.name} ${JSON.stringify(r && r.cfg)}`);
  ok(r && /Kickflip/.test(r.tag) && r.score >= 120, `1d 招式名和分数传过去了：「${r && r.tag.replace(/<[^>]+>/g, ' ')}」分数 ${r && r.score}`);
  const avg = a.txB / Math.max(1, a.txN);
  ok(avg <= 60, `1e 每条位置消息 ${avg.toFixed(0)} 字节（原来约 450）`);
  const dist = r ? Math.hypot(r.p[0] - a.p[0], r.p[2] - a.p[2]) : 99;
  ok(dist < 2.5, `1f B 看到的 A 位置和 A 自己的差 ${dist.toFixed(2)} 米（有约 0.3 秒显示延后）`);
  // 2 模拟走中转：发得少（直线 5 次/秒，转弯 10 次/秒）
  const rate = async (setup) => { await A.evaluate(setup); const n0 = await A.evaluate(() => [...__dbg.online.links.values()][0].txN); await sleep(3000); const n1 = await A.evaluate(() => [...__dbg.online.links.values()][0].txN); return (n1 - n0) / 3; };
  const direct = await rate(() => { [...__dbg.online.links.values()][0].relayed = false; });
  await A.evaluate(() => { [...__dbg.online.links.values()][0].checkPath = async () => {}; }); // 测试里不让真实检测覆盖掉模拟值
  const turn = await rate(() => { [...__dbg.online.links.values()][0].relayed = true; });
  await A.keyboard.up('KeyD'); await sleep(300);
  const cruise = await rate(() => {});
  ok(direct > 12 && direct < 17, `2a 真直连：每秒 ${direct.toFixed(1)} 条`);
  ok(turn > 8 && turn < 12, `2b 走中转、在转弯：每秒 ${turn.toFixed(1)} 条`);
  ok(cruise > 3.5 && cruise < 7, `2c 走中转、直线滑：每秒 ${cruise.toFixed(1)} 条`);
  const smooth = await B.evaluate(() => new Promise((res) => {
    const o = __dbg.online, u = o.update.bind(o), pts = [];
    o.update = (dt, now, ctx) => { u(dt, now, ctx); const r = [...o.remotes.values()][0]; if (r && pts.length < 90) { const q = r.board.root.position; pts.push([q.x, q.z, now]); } };
    setTimeout(() => { o.update = u; let mx = 0; for (let i = 2; i < pts.length; i++) { const [a1, b1, c1] = [pts[i - 2], pts[i - 1], pts[i]]; const v1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) / Math.max(1, b1[2] - a1[2]), v2 = Math.hypot(c1[0] - b1[0], c1[1] - b1[1]) / Math.max(1, c1[2] - b1[2]); if (i > 10) mx = Math.max(mx, Math.abs(v2 - v1) * 1000); } res(mx); }, 3500);
  }));
  ok(smooth < 1.5, `2d 中转 5 次/秒时 B 看 A 仍然顺：速度突变最大 ${smooth.toFixed(2)} m/s`);
  await A.keyboard.up('KeyW');
  for (const p of [A, B]) await p.close();
  // 3 新版 + 旧版混着玩：互相都看得见（自动用文字格式）
  const N = await mk('New', 'w2'), O = await mk('Old', 'w2', true);
  ok(await waitLinks([N, O], 12000), '3a 新旧版也能直连');
  await sleep(2500);
  const seeO = await N.evaluate(() => { const r = [...__dbg.online.remotes.values()][0]; return r ? r.R.name : null; });
  const seeN = await O.evaluate(() => { const r = [...__dbg.online.remotes.values()][0]; return r ? r.R.name : null; });
  const nb = await N.evaluate(() => ({ bin: [...__dbg.online.links.values()][0].peerBin, rx: __dbg.online.binRx | 0 }));
  const js = await N.evaluate(() => { const L = [...__dbg.online.links.values()][0]; return L.txB / Math.max(1, L.txN); }); console.log(`    （对比：发给旧版的文字格式每条 ${js.toFixed(0)} 字节）`);
  ok(seeO === 'Old' && seeN === 'New' && !nb.bin && nb.rx === 0, `3b 新版看见「${seeO}」，旧版看见「${seeN}」，没用紧凑格式（${nb.bin}）`);
  ok(!errs.length, '无报错 ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
