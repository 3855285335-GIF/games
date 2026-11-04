// 小院地图：每个道具都滑一遍（不卡住、不穿模、该磨的能磨、该飞的能飞）
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx, null, { yard: true });
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: false, music: false, sfx: false, dots: true })); });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  const res = await p.evaluate(() => {
    window.__noRender = true; __dbg.startGame('free'); __dbg.input.enabled = false;
    const sk = __dbg.sk, T = __dbg.T, combo = __dbg.combo, out = {}, ev = [];
    for (const k of Object.keys(sk.cb)) { const o = sk.cb[k]; sk.cb[k] = (...a) => { ev.push(k + (k === 'onBail' ? ':' + a[0] : k === 'onGrind' ? ':' + (a[0] ? 'on ' + a[1].name : 'off') : '')); return o(...a); }; }
    const I = () => ({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 2, caught: true, fb: 0, pump: false, kick: 0 });
    const place = (x, z, yaw, s) => { combo.clear(); sk.reset(x, z, yaw); sk.s = s || 0; ev.length = 0; };
    const go = (name, sec, fn) => {
      let tr = [], prev = sk.mode, maxY = -9, bad = null;
      for (let i = 0; i < Math.round(sec * 240); i++) {
        const inp = I(); fn && fn(i / 240, inp, i); sk.step(1 / 240, inp); combo.tick(1 / 240, sk); maxY = Math.max(maxY, sk.p.y);
        if (!isFinite(sk.p.x + sk.p.y + sk.p.z)) { bad = 'NaN'; break; }
        if (sk.mode === 'ground' && Math.abs(sk.p.y - T.height(sk.p.x, sk.p.z)) > 0.02 && !bad) bad = 'offground@' + (i / 240).toFixed(2);
        if (sk.mode !== prev) { tr.push(prev.slice(0, 2) + '>' + sk.mode.slice(0, 2) + '@' + (i / 240).toFixed(2)); prev = sk.mode; }
      }
      out[name] = { end: sk.mode, pos: [sk.p.x, sk.p.y, sk.p.z].map((v) => +v.toFixed(2)), spd: +sk.speed().toFixed(2), maxY: +maxY.toFixed(2), tr: tr.join(' '), ev: [...new Set(ev)].join(','), bad };
    };
    // 出生点直推：上跳箱、过顶、下坡、冲上四分之一管、回来
    place(T.spawn.x, T.spawn.z, 0, 0); go('spawnLine', 7, (t, i, n) => { if (n % 24 === 0 && t < 2) i.push = 0.9; });
    // 跳箱：从南坡冲上去，在顶上 Ollie 上平杆
    place(0, -8, 0, 5); go('funboxRail', 3, (t, i) => { if (Math.abs(t - 0.98) < 0.002) sk.pop('tail', 0.5); });
    // 跳箱台边 50-50
    place(2.1 + 0.02, -8, 0, 5); go('funboxLedge', 3, (t, i) => { if (Math.abs(t - 0.95) < 0.002) sk.pop('tail', 0.2); });
    // 东边长边沿：顺着走，起跳磨上去
    place(9.25, -12, 0, 4.5); go('ledgeE', 4, (t, i) => { if (Math.abs(t - 0.55) < 0.002) sk.pop('tail', 0.4); });
    // 长凳
    place(12.05, 2, 0, 4.2); go('bench', 3, (t, i) => { if (Math.abs(t - 0.75) < 0.002) sk.pop('tail', 0.5); });
    // 跳台：冲过去飞起来，落地后不撞东西
    place(5, -14, 0, 5.5); go('kicker', 3, null);
    // 黄色路沿
    { const c = T.F.curb, dx = Math.cos(c.yaw), dz = -Math.sin(c.yaw), ox = Math.sin(c.yaw) * 0.25, oz = Math.cos(c.yaw) * 0.25;
      const yaw = Math.atan2(-dx, -dz); place(c.x + dx * 6 + ox * 0.98, c.z + dz * 6 + oz * 0.98, yaw, 4.2);
      go('curb', 3, (t, i) => { if (Math.abs(t - 0.62) < 0.002) sk.pop('tail', 0.3); }); }
    // 平杆（东西向）
    place(4.5, -7, -Math.PI / 2, 4.2); go('flatbar', 3, (t, i) => { if (Math.abs(t - 1.38) < 0.002) sk.pop('tail', 0.5); });
    // 平台：从缓坡滑上去，再从台阶冲下来
    place(5, -14.5, -Math.PI / 2, 5); go('bankUp', 3, null);
    place(-8.5, -15.5, 0, 4.2); go('stairs', 3, null);
    place(-8.5, -15.8, 0, 4.4); go('stairsOllie', 3, (t, i) => { if (Math.abs(t - 0.75) < 0.002) sk.pop('tail', 0.7); });
    place(-11.4, -16.2, 0, 4.4); go('handrail', 3.5, (t, i) => { if (Math.abs(t - 0.52) < 0.002) sk.pop('tail', 0.8); });
    // 金字塔、Manual 台
    place(-7.5, -1, 0, 5); go('pyramid', 3, null);
    place(-8, -9, 0, 4); go('pad', 3, (t, i) => { if (Math.abs(t - 0.95) < 0.002) sk.pop('tail', 0.2); if (t > 1.3 && t < 2.2) { i.manual = 0.6; i.fingers = 1; } });
    // 四分之一管：正对着冲，飞出唇边；斜着冲上去
    place(0, 2, 0, 7.5); go('qpAir', 5, null);
    place(-6, 6, 0.6, 6); go('qpCarve', 5, null);
    // 撞墙（东西两边）
    place(10, 10.5, -Math.PI / 2 + 0.01, 6); go('wallW', 3, null);
    place(-12, 0, -Math.PI / 2, 5); go('wallE', 3, null);
    return out;
  });
  for (const [k, r] of Object.entries(res)) console.log(k.padEnd(12), JSON.stringify(r));
  const R = res;
  ok(!Object.values(R).some((r) => r.bad), '没有 NaN / 悬空：' + Object.entries(R).filter(([, r]) => r.bad).map(([k, r]) => k + ' ' + r.bad).join(' '));
  ok(R.spawnLine.maxY > 1.0 && R.spawnLine.end === 'ground' && !/Bail/.test(R.spawnLine.ev), `出生直推：上跳箱 → 冲上四分之一管（最高 ${R.spawnLine.maxY} 米），没摔`);
  ok(/onGrind:on/.test(R.funboxRail.ev) && !/Bail/.test(R.funboxRail.ev), `跳箱平杆：${R.funboxRail.ev}`);
  ok(/onGrind:on/.test(R.funboxLedge.ev) && !/Bail/.test(R.funboxLedge.ev), `跳箱台边：${R.funboxLedge.ev}`);
  ok(/onGrind:on/.test(R.ledgeE.ev) && !/Bail/.test(R.ledgeE.ev), `长边沿：${R.ledgeE.ev}`);
  ok(/onGrind:on/.test(R.bench.ev) && !/Bail/.test(R.bench.ev), `长凳：${R.bench.ev}`);
  ok(R.kicker.maxY > 0.6 && R.kicker.end === 'ground' && !/Bail/.test(R.kicker.ev), `跳台：飞到 ${R.kicker.maxY} 米，${R.kicker.ev}`);
  ok(/onGrind:on/.test(R.curb.ev) && !/Bail/.test(R.curb.ev), `黄色路沿：${R.curb.ev}`);
  ok(/onGrind:on/.test(R.flatbar.ev) && !/Bail/.test(R.flatbar.ev), `平杆：${R.flatbar.ev}`);
  ok(Math.abs(R.bankUp.pos[1] - 0.48) < 0.02 || R.bankUp.pos[0] < -3, `缓坡上平台：${JSON.stringify(R.bankUp.pos)}`);
  ok(R.stairs.end === 'ground' && !/Bail/.test(R.stairs.ev) && R.stairs.pos[2] > -11, `滚下台阶：${R.stairs.pos}`);
  ok(R.stairsOllie.end === 'ground' && !/Bail/.test(R.stairsOllie.ev), `台阶 Ollie：${R.stairsOllie.ev}`);
  ok(/onGrind:on/.test(R.handrail.ev) && !/Bail/.test(R.handrail.ev), `扶手：${R.handrail.ev}`);
  ok(R.pyramid.end === 'ground' && !/Bail/.test(R.pyramid.ev), `金字塔：${R.pyramid.pos}`);
  ok(/onManual/.test(R.pad.ev) && !/Bail/.test(R.pad.ev), `Manual 台：${R.pad.ev}`);
  ok(R.qpAir.maxY > 2.0 && R.qpAir.end === 'ground' && !/Bail/.test(R.qpAir.ev), `四分之一管飞出：${R.qpAir.maxY} 米`);
  ok(R.qpCarve.end === 'ground' && !/Bail/.test(R.qpCarve.ev), `斜冲四分之一管：${R.qpCarve.ev}`);
  ok(R.wallW.end !== 'air' && R.wallE.end !== 'air', `撞墙：${R.wallW.end} / ${R.wallE.end}`);
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
