// 物理场景（新场地「街区」）：每个场景跑一遍，检查结果对不对、有没有穿地 / 数值炸掉
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate(() => { document.getElementById('inName').value = 'T'; window.__noRender = true; __dbg.startGame('free'); __dbg.input.enabled = false; });
  const R = await p.evaluate(() => {
    const { sk, T, combo } = __dbg; const res = {}; const ev = [];
    const orig = Object.assign({}, sk.cb);
    for (const k of Object.keys(orig)) sk.cb[k] = (...a) => { ev.push(k + (k === 'onBail' ? ':' + a[0] : k === 'onGrind' ? ':' + (a[0] ? 'on ' + a[1].name : 'off ' + (a[2] || '')) : '')); return orig[k](...a); };
    const names = []; if (!combo.__w) { const o = combo.add.bind(combo); combo.add = (n, pts) => { names.push(n); return o(n, pts); }; combo.__w = 1; }
    const I = () => ({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 2, touching: 2, caught: true, capT: -9, auto: false, fb: 0, kick: 0 });
    const place = (x, z, yaw, s) => { combo.clear(); sk.reset(x, z, yaw); sk.s = s || 0; ev.length = 0; names.length = 0; };
    const at = (t, x) => Math.abs(t - x) < 0.5 / 240;
    function run(name, sec, fn) {
      const n = Math.round(sec * 240); let tr = [], prev = sk.mode, maxY = -9, maxS = 0, bad = null, airT = 0, maxAir = 0;
      for (let i = 0; i < n; i++) {
        const inp = I(); fn && fn(i / 240, inp); sk.step(1 / 240, inp); combo.tick(1 / 240, sk);
        const sp = sk.speed(); maxY = Math.max(maxY, sk.p.y); maxS = Math.max(maxS, sp);
        if (sk.mode === 'air') { airT += 1 / 240; maxAir = Math.max(maxAir, airT); } else airT = 0;
        if (!isFinite(sk.p.x + sk.p.y + sk.p.z + sp)) { bad = 'NaN@' + i; break; }
        if (sk.mode === 'ground') { const h = T.height(sk.p.x, sk.p.z); if (Math.abs(sk.p.y - h) > 0.02 && !bad) bad = 'offground ' + (sk.p.y - h).toFixed(3) + '@' + (i / 240).toFixed(2); }
        if (sk.mode !== prev) { tr.push(prev[0] + '>' + sk.mode[0] + '@' + (i / 240).toFixed(2)); prev = sk.mode; }
      }
      return (res[name] = { end: sk.mode, pos: [sk.p.x, sk.p.y, sk.p.z].map((v) => +v.toFixed(2)), spd: +sk.speed().toFixed(2), maxY: +maxY.toFixed(2), maxS: +maxS.toFixed(2), maxAir: +maxAir.toFixed(2), tr: tr.join(' '), ev: [...new Set(ev)].join(','), names: names.slice().concat(combo.list.map((e) => e.name)), bad });
    }
    // 磨杆类：在一段时间里找一个起跳时机能上杆（时机对就能上，说明道具摆放和高度是对的）
    function grindTry(name, x, z, yaw, s, t0, t1, opt) {
      let r = null;
      for (let tp = t0; tp <= t1 + 1e-9; tp += 0.02) {
        place(x, z, yaw, s);
        r = run(name, 3, (t, i) => { if (at(t, tp)) sk.pop('tail', opt.k); if (opt.spin && t > tp && t < tp + 0.25) i.spinRate = opt.spin; });
        if (/onGrind:on/.test(r.ev) && (!opt.want || opt.want.test(r.ev))) { r.tp = +tp.toFixed(2); return r; }
      }
      r.tp = null; return r;
    }
    const SP = [2.6, -9.6, 0]; // 出生点：正前方 17 米是空的（右边平杆、左边 Manual 台中间的道）
    place(...SP, 0); run('push', 3, (t, i) => { if (Math.floor(t * 240) % 24 === 0) i.push = 0.9; });
    place(...SP, 4); run('ollie', 2, (t) => { if (t === 0) sk.pop('tail', 0.5); });
    place(...SP, 4); run('ollieLo', 2, (t) => { if (t === 0) sk.pop('tail', 0); });
    place(...SP, 4); run('ollieHi', 2.4, (t) => { if (t === 0) sk.pop('tail', 1); });
    place(...SP, 4); run('kickflip', 2, (t) => { if (t === 0) sk.pop('tail', 0.6); if (at(t, 0.05)) sk.flick('front', -1); });
    place(...SP, 4); run('nocatch', 2, (t, i) => { if (t === 0) sk.pop('tail', 0.5); i.fingers = 0; i.caught = false; });
    place(...SP, 4); run('varial180', 2.2, (t, i) => { if (t === 0) sk.pop('tail', 1); if (at(t, 0.04)) { sk.flick('front', -1); sk.flick('back', -1); } if (t > 0.02 && t < 0.5) i.spinRate = 6.3; });
    place(...SP, 4); run('lateflip', 2, (t) => { if (t === 0) sk.pop('tail', 0); if (at(t, 0.75)) sk.flick('front', -1); });
    place(...SP, 4.5); run('manual', 4, (t, i) => { if (t < 3.4) { i.manual = 0.6; i.fingers = 1; } });
    // 四分之一管：慢慢滑上去再滑回来；快的冲出唇边
    place(0, 2, 0, 4.5); run('qp', 6, null);
    place(-6, 0, 0, 7.5); run('qpAir', 4, null);
    // 跳箱：上坡 → 平顶 → 下坡
    place(8.6, -8.5, 0, 4.5); run('funbox', 3, null);
    // 西南平台：滚下台阶、在台阶顶起跳
    place(-8.5, -11.3, 0, 4); run('stairsRoll', 2.5, null);
    place(-8.5, -11.3, 0, 4); run('stairsOllie', 2.5, (t) => { if (at(t, 0.55)) sk.pop('tail', 0.7); });
    // 撞跳箱侧面、撞围墙
    place(5, -1.4, Math.PI / 2, 5); run('wallhit', 2, null);
    place(0, -10.6, Math.PI, 6); run('edge', 2.5, null);
    // 磨杆：长边沿 50-50、平杆 Boardslide、扶手、长凳、西边路沿、跳箱台边
    grindTry('ledge', -3.95, -8.2, 0, 4.5, 0, 0.6, { k: 0.3 }); // 起点要在西南平台的缓坡北边（z > -8.5）
    grindTry('railslide', 4.4, -9.6, 0, 4.5, 0.2, 1.4, { k: 0.4, spin: 6.3, want: /Boardslide/ });
    grindTry('handrail', -10.85, -11.6, 0, 4.2, 0.05, 0.8, { k: 0.5 });
    grindTry('bench', 10.7, 1.5, 0, 4.5, 0.1, 1.2, { k: 0.4 });
    grindTry('curb', -10.45, -7.5, 0, 4.5, 0.1, 1.2, { k: 0.1 });
    grindTry('funboxLedge', 7.25, -9, 0, 4.5, 0.6, 2.0, { k: 0.4 });
    return res;
  });
  const r = (k) => R[k];
  for (const [k, v] of Object.entries(R)) console.log(k.padEnd(12), JSON.stringify(v));
  const clean = Object.entries(R).filter(([, v]) => v.bad).map(([k, v]) => k + ':' + v.bad);
  ok(!clean.length, '0 所有场景都没有穿地 / 数值炸掉 ' + clean.join(' '));
  ok(r('push').spd > 3 && r('push').end === 'ground', `1 推板加速到 ${r('push').spd} m/s`);
  ok(r('ollie').names.includes('Ollie') && r('ollie').end === 'ground', `2 平地 Ollie 落地（${r('ollie').names}）`);
  ok(r('ollieLo').maxAir >= 0.8 && r('ollie').maxAir >= 0.95 && r('ollieHi').maxAir >= 1.2, `3 滞空：轻 ${r('ollieLo').maxAir} 秒，中 ${r('ollie').maxAir} 秒，重 ${r('ollieHi').maxAir} 秒`);
  ok(r('ollieHi').maxY - r('ollieLo').maxY > 0.5, `4 起跳高度：轻 ${r('ollieLo').maxY} 米，重 ${r('ollieHi').maxY} 米`);
  ok(r('kickflip').names.some((n) => /Kickflip/.test(n)) && !/onBail/.test(r('kickflip').ev), `5 键盘 Kickflip 自动接板落地（${r('kickflip').names}）`);
  ok(/onBail:catch/.test(r('nocatch').ev), '6 不按着板 = 没接住摔');
  ok(r('varial180').names.some((n) => /Varial/.test(n) && /180/.test(n)), `7 180 Varial（${r('varial180').names}）`);
  ok(r('lateflip').end !== 'air' && !r('lateflip').bad, `8 快落地才拨板：${r('lateflip').ev}`);
  ok(r('manual').names.some((n) => /Manual/.test(n)), `9 Manual（${r('manual').names}）`);
  ok(r('qp').maxY > 0.8 && r('qp').end === 'ground', `10 四分之一管来回：最高 ${r('qp').maxY} 米，${r('qp').tr}`);
  ok(r('qpAir').maxY > 1.33 + 0.3 && r('qpAir').end === 'ground', `11 冲出四分之一管唇边：最高 ${r('qpAir').maxY} 米，最后 ${r('qpAir').end}`);
  ok(r('funbox').end === 'ground' && r('funbox').maxY >= 0.45 && !/onBail/.test(r('funbox').ev), `12 跳箱上去再下来：最高 ${r('funbox').maxY}，${r('funbox').ev}`);
  ok(r('stairsRoll').end === 'ground' && r('stairsRoll').pos[2] > -7.5, `13 滚下台阶落地：${r('stairsRoll').tr} ${r('stairsRoll').ev}`);
  ok(r('stairsOllie').end === 'ground' && /onLand/.test(r('stairsOllie').ev), `14 台阶顶 Ollie 下去：${r('stairsOllie').ev}`);
  ok(/onImpact|onBail/.test(r('wallhit').ev), `15 撞跳箱侧面：${r('wallhit').ev}`);
  ok(/onImpact|onBail/.test(r('edge').ev) && r('edge').pos[2] > -12, `16 撞围墙：${r('edge').ev}，停在 z=${r('edge').pos[2]}`);
  for (const k of ['ledge', 'railslide', 'handrail', 'bench', 'curb', 'funboxLedge']) ok(r(k).tp != null, `17 磨杆 ${k}：起跳时机 ${r(k).tp} 秒能上去（${(r(k).ev.match(/onGrind:on [^,]+/) || [''])[0]}）`);
  console.log('errors:', errs.length ? errs : 'none');
  console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
