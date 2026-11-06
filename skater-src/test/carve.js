// 压板转向专项：弯的大小随速度变化、侧倾跟手速度、停着不转、Kickturn、落地侧滑
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  await p.addInitScript(() => { localStorage.setItem('fs_settings', JSON.stringify({ q: 0, easy: false, music: false, sfx: false, dots: true })); });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    window.__noRender = true; __dbg.startGame('free'); __dbg.input.enabled = false;
    const sk = __dbg.sk, out = {};
    sk.T = new __dbg.T.constructor({ minX: -200, maxX: 200, minZ: -200, maxZ: 200 }); // 转弯测试要一大片平地：换成空的地形（场地太小，转大弯会撞东西）
    const I = (o) => Object.assign({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 2, caught: true, fb: 0, kick: 0 }, o);
    const run = (sec, inp, keep) => { for (let i = 0; i < Math.round(sec * 240); i++) { const x = typeof inp === 'function' ? inp(i / 240) : inp; sk.step(1 / 240, I(x)); if (keep) sk.s = keep; } };
    // 1 压到底，不同速度下的转弯半径（保持速度不变）
    out.radius = {};
    for (const v of [0.3, 1, 2, 4, 6, 8]) {
      sk.reset(0, 0, 0); sk.s = v; run(0.6, { lean: 1.25 }, v);
      const h0 = sk.heading; run(0.5, { lean: 1.25 }, v); const yr = Math.abs(sk.heading - h0) / 0.5;
      out.radius[v] = { yaw: +yr.toFixed(2), R: +(v / Math.max(1e-6, yr)).toFixed(2), roll: +(sk.roll * 57.3).toFixed(1) };
    }
    // 2 侧倾跟手：从 0 压到底，多久到 90%
    sk.reset(0, 0, 0); sk.s = 4; let t90 = null;
    for (let i = 0; i < 240; i++) { sk.step(1 / 240, I({ lean: 1.25 })); sk.s = 4; if (t90 === null && sk.roll > 0.9 * 0.24) t90 = i / 240; }
    out.t90 = t90; out.overshoot = 0;
    sk.reset(0, 0, 0); sk.s = 4; let mx = 0; for (let i = 0; i < 240; i++) { sk.step(1 / 240, I({ lean: 1.25 })); mx = Math.max(mx, sk.roll); } out.overshoot = +(mx / 0.24).toFixed(3);
    // 3 停着压板：不转
    sk.reset(0, 0, 0); sk.s = 0; const h3 = sk.heading; run(2, { lean: 1.25 }); out.stillTurn = +(sk.heading - h3).toFixed(3);
    // 4 Kickturn：停着，两指转 90°（每帧 0.03 rad，共 52 帧 ≈ 1.57 rad）
    sk.reset(0, 0, 0); sk.s = 0; const h4 = sk.heading; let kicks = 0; const oc = sk.cb.onKick; sk.cb.onKick = (a) => { kicks++; out.kickA = +a.toFixed(2); };
    for (let f = 0; f < 52; f++) { sk.step(1 / 240, I({ kick: 0.03 })); for (let j = 0; j < 3; j++) sk.step(1 / 240, I({})); }
    run(0.5, {});
    out.kick90 = +(sk.heading - h4).toFixed(3); out.kicks = kicks; out.kickPitch = +sk.kickPitch.toFixed(3);
    // 5 快速滑行时 Kickturn 不起作用
    sk.reset(0, 0, 0); sk.s = 5; const h5 = sk.heading; for (let f = 0; f < 52; f++) { sk.step(1 / 240, I({ kick: 0.03 })); sk.s = 5; for (let j = 0; j < 3; j++) { sk.step(1 / 240, I({})); sk.s = 5; } }
    out.kickFast = +(sk.heading - h5).toFixed(3);
    sk.cb.onKick = oc;
    // 6 落地歪 30°：板子保持自己的朝向，侧滑很快蹭掉
    sk.reset(0, 0, 0); sk.s = 4; sk.pop('tail', 0.3);
    { const qt = new sk.qa.constructor(); const ax = new sk.p.constructor(0, 1, 0); qt.setFromAxisAngle(ax, 0.5); sk.qa.multiply(qt); }
    let slip0 = null, hd = null, tSlip = null, t = 0;
    for (let i = 0; i < 480; i++) { sk.step(1 / 240, I({})); t += 1 / 240; if (sk.mode === 'ground' && slip0 === null) { slip0 = sk.slip; hd = sk.heading; t = 0; } if (slip0 !== null && tSlip === null && sk.slip === 0) tSlip = t; }
    out.land = { mode: sk.mode, slip0: slip0 && +slip0.toFixed(2), heading: hd && +hd.toFixed(3), tSlip: tSlip && +tSlip.toFixed(2), spd: +sk.s.toFixed(2) };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  const R = r.radius;
  ok(R[0.3].yaw < 0.35, `停下来几乎转不动：0.3 m/s 时 ${R[0.3].yaw} rad/s`);
  ok(R[2].R > 0.9 && R[2].R < 1.3, `2 m/s 压到底：半径 ${R[2].R} m`);
  ok(R[4].yaw > 2.6 && R[4].yaw < 3.8, `4 m/s 压到底：${R[4].yaw} rad/s`);
  ok(R[8].R > 3.5 && R[8].yaw < 2.2, `8 m/s 压到底：半径 ${R[8].R} m（不会急转甩出去）`);
  ok(r.t90 > 0.06 && r.t90 < 0.2, `侧倾跟手：${(r.t90 * 1000).toFixed(0)} ms 到 90%`);
  ok(r.overshoot < 1.08, `侧倾不过冲：${r.overshoot}`);
  ok(Math.abs(r.stillTurn) < 0.01, `停着压板不转：${r.stillTurn}`);
  ok(Math.abs(r.kick90 - 1.56) < 0.08 && r.kicks === 1, `停着 Kickturn 90°：转了 ${r.kick90} rad，计 ${r.kicks} 次招式（${r.kickA} rad）`);
  ok(Math.abs(r.kickFast) < 0.02, `5 m/s 时两指转不当 Kickturn：${r.kickFast}`);
  ok(r.land.mode === 'ground' && Math.abs(r.land.slip0) > 0.5 && r.land.tSlip < 0.4 && r.land.spd > 2, `落地歪 30°：侧滑 ${r.land.slip0} m/s，${r.land.tSlip}s 蹭完，剩 ${r.land.spd} m/s`);
  console.log('errors:', errs.length ? errs : 'none'); console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
