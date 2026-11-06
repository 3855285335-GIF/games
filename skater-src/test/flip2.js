// 力度和接板（第 1 步的核心）+ 防穿模
//  · 拨得越快板子转得越快；接板时机不同，结果不同（翻够 / 没翻够 / 翻过头 / 没接住 / 两圈）
//  · 只有拨板之后重新踩上板的手指才算接住
//  · 做招、摔倒、贴墙、转身、磨杆时，板子的板头板尾、板边、轮子都不会穿进地面和东西里
const L = require('./lib');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await L.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await L.mock(ctx);
  const p = await ctx.newPage(); const errs = []; L.errs(p, errs);
  // 摔倒时的乱滚用了随机数：固定下来，失败了能原样重现（SEED=数字 可以换一组）
  await p.addInitScript((sd) => { let m = sd; Math.random = () => (m = (m * 1103515245 + 12345) % 2147483648) / 2147483648; }, +(process.env.SEED || 4242));
  if (process.env.DBG) await p.addInitScript(() => { window.__DBG = true; });
  await p.goto(L.URL); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__noRender = true; __dbg.startGame('free'); __dbg.input.enabled = false; });
  const R = await p.evaluate(() => {
    const { sk, T, combo } = __dbg; const out = {}; const ev = [];
    const orig = Object.assign({}, sk.cb);
    for (const k of Object.keys(orig)) sk.cb[k] = (...a) => { ev.push(k + (k === 'onBail' ? ':' + a[0] : '')); return orig[k](...a); };
    let got = []; const oadd = combo.add.bind(combo); combo.add = (n, pts) => { got.push(n); return oadd(n, pts); }; // 记下每个招式（连击结算后列表会清空）
    const ost = combo.startLive.bind(combo); combo.startLive = (n, r, k) => { got.push(n); return ost(n, r, k); };
    const I = (o) => Object.assign({ lean: 0, push: 0, brake: 0, manual: 0, twist: 0, spinRate: 0, fingers: 0, touching: 0, caught: false, capT: -9, auto: false, fb: 0, kick: 0 }, o);
    const qq = { h: 0, gx: 0, gz: 0, f: null };
    // 当前板子轮廓最深穿进去多少（米）：每个点取"往上抬出表面"和"往旁边走出侧面"里近的那个距离（和真实物体穿进去多深一样）
    let worst = null;
    const qh = { h: 0, gx: 0, gz: 0, f: null };
    const depth = (P, r) => {
      const B = sk.T.bounds;
      if (r.wall) return Math.max(B.minX - P.x, P.x - B.maxX, B.minZ - P.z, P.z - B.maxZ, 0);
      const up = (r.h - P.y) / Math.sqrt(1 + r.gx * r.gx + r.gz * r.gz);
      if (up <= 0.005) return up;
      for (let d = 0.01; d < up; d += 0.01) for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, q = sk.T.query(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, qh);
        if (!q.wall && q.h <= P.y + 0.002) return d;
      }
      return up;
    };
    const pen = () => {
      const bail = sk.mode === 'bail', q = bail ? sk.bq : sk.qv;
      const pts = sk._hull(sk.p.x, sk.p.y + (bail ? 0 : sk.groundLift()), sk.p.z, q, bail ? 0 : sk.visPitch(), bail ? 0 : sk.flipA, bail ? 0 : sk.shoveA);
      let m = 0, wi = -1; pts.forEach((P, i) => { const r = sk.T.query(P.x, P.z, qq); const d = depth(P, r); if (d > m) { m = d; wi = i; worst = [i, +P.x.toFixed(2), +P.y.toFixed(3), +P.z.toFixed(2), +r.h.toFixed(3), +Math.hypot(r.gx, r.gz).toFixed(2), r.f ? r.f.t + (r.f.name ? ':' + r.f.name : '') : 'ground', +sk.flipA.toFixed(2), +sk.shoveA.toFixed(2), +sk.visPitch().toFixed(2), sk.s ? +sk.s.toFixed(2) : 0, +sk.slip.toFixed(2)]; } });
      return m;
    };
    const place = (x, z, yaw, s) => { combo.clear(); sk.reset(x, z, yaw); sk.s = s || 0; ev.length = 0; got = []; };
    // 跑 sec 秒；fn(t, 输入) 每一步改输入；记录各状态下最深穿模
    const run = (sec, fn) => {
      const mx = { ground: 0, air: 0, bail: 0, grind: 0 }, where = {}; let bails = [];
      const n = Math.round(sec * 240);
      const H = [], hist = {};
      for (let i = 0; i < n; i++) { const t = i / 240, inp = I(); fn && fn(t, inp); const m0 = sk.mode; sk.step(1 / 240, inp); combo.tick(1 / 240, sk); const d = pen();
        if (window.__DBG) { window.__prevS = window.__curS; window.__curS = JSON.stringify({ p: sk.p.toArray(), v: sk.v.toArray(), qa: sk.qa.toArray(), qv: sk.qv.toArray(), flipA: sk.flipA, shoveA: sk.shoveA, flipW: sk.flipW, shoveW: sk.shoveW, flipT: sk.flipT, shoveT: sk.shoveT, popPitch: sk.popPitch, manPitch: sk.manPitch, kickPitch: sk.kickPitch, heading: sk.heading, fakie: sk.fakie, mode: sk.mode, air: sk.air }); H.push([+t.toFixed(3), m0 + '>' + sk.mode, +sk.p.x.toFixed(3), +sk.p.y.toFixed(3), +sk.p.z.toFixed(3), +sk.v.y.toFixed(2), +sk.visPitch().toFixed(3), +sk.gTilt.toFixed(3), +sk.flipA.toFixed(2), +sk.shoveA.toFixed(2), +d.toFixed(3)]); if (H.length > 16) H.shift(); }
        if (d > mx[sk.mode]) { mx[sk.mode] = d; where[sk.mode] = [sk.T.id, +sk.p.x.toFixed(2), +sk.p.y.toFixed(2), +sk.p.z.toFixed(2), +t.toFixed(2), worst]; if (window.__DBG) { hist[sk.mode] = H.slice(); hist[sk.mode + 'State'] = window.__prevS; } } }
      if (window.__DBG) where.hist = hist;
      bails = ev.filter((e) => e.startsWith('onBail')).map((e) => e.slice(7));
      return { mx: Object.fromEntries(Object.entries(mx).map(([k, v]) => [k, +v.toFixed(3)])), where, names: got.slice(), bails, mode: sk.mode, ev: [...new Set(ev)] };
    };
    const at = (t, x) => Math.abs(t - x) < 0.5 / 240;

    // 1 力度：同样起跳，轻拨和猛拨转速不同（不接板，看 0.2 秒时转了多少）
    const spinAt = (k) => { place(2.6, -9.6, 0, 4); let a = 0; run(0.25, (t, i) => { if (at(t, 0)) sk.pop('tail', 0.5); if (at(t, 0.05)) sk.flick('front', -1, k, 1.0); if (at(t, 0.24)) a = sk.flipA; }); return a; };
    out.soft = spinAt(0.15); out.hard = spinAt(0.85);
    // 2 起跳力度：划得快跳得高
    const hop = (k) => { place(2.6, -9.6, 0, 4); let my = 0; run(1.2, (t, i) => { if (at(t, 0)) sk.pop('tail', k); i.fingers = 2; i.caught = true; my = Math.max(my, sk.p.y); }); return my; };
    out.hopLo = hop(0); out.hopHi = hop(1);
    // 3 接板时机（手指在 tc 秒重新踩上板）
    const kick = (k, tc, capT) => {
      place(2.6, -9.6, 0, 4);
      return run(1.6, (t, i) => { if (at(t, 0)) sk.pop('tail', 0.5); if (at(t, 0.05)) sk.flick('front', -1, k, 1.0); if (tc != null && t >= tc) { i.fingers = 1; i.touching = 1; i.capT = capT == null ? 2.0 : capT; } });
    };
    out.good = kick(0.2, 0.75);    // 力度 0.2 ≈ 正好一圈：转完以后什么时候接都行
    out.good2 = kick(0.38, 0.38);  // 力度 0.38 = 转 1.25 圈：在转到一圈的那一下接住（拨完 0.27～0.39 秒）
    out.early = kick(0.2, 0.15);   // 才转了一点就接
    out.late = kick(0.38, 0.95);   // 拨重了转过头还不接
    out.light = kick(0.02, 0.9);   // 拨太轻：转不到一圈
    out.never = kick(0.2, null);
    out.oldFinger = kick(0.2, 0.75, 0.5); // 一直按着没离开过板的手指，不算接住
    out.double = kick(0.9, 0.9);   // 力度 0.9 ≈ 两圈
    // 4 Shove-it：力度不同转速不同；接在 90° 会摔
    const shove = (k, tc) => { place(2.6, -9.6, 0, 4); return run(1.6, (t, i) => { if (at(t, 0)) sk.pop('tail', 0.5); if (at(t, 0.05)) sk.flick('back', -1, k, 1.0); if (t >= tc) { i.fingers = 1; i.capT = 2.0; } }); };
    out.shoveGood = shove(0.2, 0.8);
    out.shoveHalf = shove(0.2, 0.2);
    // 4c 力度一点点不同，转的角度就不同（不接板，看最后停在多少度）
    const rest = (k) => { place(2.6, -9.6, 0, 4); let a = 0; run(0.9, (t) => { if (at(t, 0)) sk.pop('tail', 0.5); if (at(t, 0.05)) sk.flick('front', -1, k, 1.0); a = sk.flipA; }); return Math.abs(a); };
    out.rest = [0.1, 0.12, 0.14, 0.16, 0.18].map(rest);
    // 5 低跳 + 马上猛翻：翻的时候板边不能穿进地里
    place(2.6, -9.6, 0, 4); out.lowFlip = run(1.2, (t, i) => { if (at(t, 0)) sk.pop('tail', 0); if (at(t, 0.01)) sk.flick('front', 1, 1, 1.0); if (t > 0.3) { i.fingers = 1; i.capT = 2; } });
    // 6 键盘 / 简单模式：自动接板
    place(2.6, -9.6, 0, 4); out.auto = run(1.6, (t, i) => { if (at(t, 0)) sk.pop('tail', 0.6); if (at(t, 0.04)) { sk.flick('front', -1, 0.45, 1.0); sk.flick('back', -1, 0.45, 1.0); } i.auto = true; });
    // 7 慢速顶到长边沿侧面（边沿 x -4.475～-3.925，z -5.6～4.4，高 0.42）：板头不能伸进去
    place(-2.2, 0, -Math.PI / 2, 2); out.noseWall = run(2.5, null);
    // 8 快速撞边沿摔倒：摔出去的板子不能穿进边沿 / 地面
    place(-2.2, 0.2, -Math.PI / 2, 6); out.bailWall = run(2.5, null);
    // 9 贴着边沿原地转（Kickturn）：板头不能转进边沿里
    place(-3.6, 0, 0, 0); out.kickWall = run(1.5, (t, i) => { i.kick = 0.02; });
    // 10 撞世界边上的墙（南边）
    place(0, -10.6, Math.PI, 6.5); out.edge = run(3, null);
    // 11 磨杆：边沿 50-50、平杆 Boardslide
    place(-3.95, -8.2, 0, 4.5); out.ledge = run(3, (t, i) => { if (at(t, 0.1)) sk.pop('tail', 0.3); i.fingers = 2; i.caught = true; });
    place(4.4, -9.6, 0, 4.5); let railY = null;
    out.rail = run(2.5, (t, i) => { if (at(t, 0.3)) sk.pop('tail', 0.4); if (t > 0.31 && t < 0.56) i.spinRate = 6.3; i.fingers = 2; i.caught = true;
      if (sk.mode === 'grind' && sk.grind && railY == null) { const r = sk.grind.r; railY = { top: r.ay + 0.022, deck: sk.p.y + 0.075, type: sk.grind.type }; } });
    out.railY = railY;
    // 12 大量随机招式 + 摔倒（三张地图各 40 秒）：最深穿模
    out.fuzz = {};
    for (const m of ['spot1', 'spot2', 'spot3']) { // 只有一张地图：换三组随机数各跑 40 秒
      __dbg.loadMap('spot');
      let s = 7 + m.length * 13 + m.charCodeAt(4) * 101; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      place(sk.T.spawn.x, sk.T.spawn.z, sk.T.spawn.yaw, 3);
      let tc = 9, cap = 1;
      out.fuzz[m] = run(40, (t, i) => {
        i.lean = Math.sin(t * 1.3) * 0.8; if (rnd() < 0.02) i.push = 0.8; i.fingers = 2;
        if (sk.mode === 'ground' && rnd() < 0.006) sk.pop(rnd() < 0.8 ? 'tail' : 'nose', rnd());
        if (sk.mode === 'air' && rnd() < 0.02) { sk.flick(rnd() < 0.6 ? 'front' : 'back', rnd() < 0.5 ? -1 : 1, rnd(), cap); tc = t + 0.1 + rnd() * 0.4; }
        if (t >= tc) { i.capT = cap + 1; } else i.capT = -9;
        if (t >= tc + 0.6) { cap += 2; tc = 9e9; }
        if (sk.mode === 'ground' && rnd() < 0.004) sk.lockGrind();
        if (sk.mode === 'ground' && rnd() < 0.003) i.kick = 0.3;
      });
    }
    // 13 往下掉时板子一头搭在别的东西上（天台的矮箱子边、公园 U 台的侧面）：不能悬在半空、越掉越快
    const hang = (map, x, z, yaw, y, s0, popK) => {
      __dbg.loadMap(map); place(x, z, yaw, s0);
      if (y != null) { sk.p.y = y; sk._toAir(new sk.v.constructor(0, 0, 0), null, 0, 0, null); }
      let airT = 0, maxAirT = 0, maxV = 0;
      run(3, (t, i) => { if (popK != null && at(t, 0.04)) sk.pop('tail', popK); i.fingers = 2; i.caught = true; if (sk.mode === 'air') { airT += 1 / 240; maxAirT = Math.max(maxAirT, airT); } else airT = 0; maxV = Math.max(maxV, sk.speed()); });
      return { maxAirT: +maxAirT.toFixed(2), maxV: +maxV.toFixed(2), mode: sk.mode };
    };
    out.hangBox = hang('spot', 6.3, -1.4, Math.PI / 2, null, 0.8, 0);        // 慢慢跳向跳箱侧面（高 0.5）：板头搭在箱子边上
    out.hangQp = hang('spot', 6.92, -4.3, Math.PI / 2 + 0.4, 0.6, 0, null);  // 板边搭在跳箱上坡的侧面
    out.hangStairs = hang('spot', -6.45, -8.1, 1.874, 0.3, 0, null);         // 一个轮子搭在台阶边上
    return out;
  });
  const deg = (r) => Math.round(r * 180 / Math.PI);
  ok(Math.abs(R.hard) / Math.abs(R.soft) > 1.8, `1 拨得越快转得越快：轻拨 0.2 秒转 ${deg(Math.abs(R.soft))}°，猛拨 ${deg(Math.abs(R.hard))}°`);
  ok(R.hopHi - R.hopLo > 0.6, `2 划得越快跳得越高：轻 ${R.hopLo.toFixed(2)} 米，猛 ${R.hopHi.toFixed(2)} 米`);
  ok(R.good.names.includes('Kickflip') && !R.good.bails.length, `3a 正好一圈的力度 → Kickflip（${R.good.names} ${R.good.bails}）`);
  ok(R.good2.names.includes('Kickflip') && !R.good2.bails.length, `3a2 拨重了一点，在转到一圈时接住 → Kickflip（${R.good2.names} ${R.good2.bails}）`);
  ok(R.early.bails[0] === 'flipShort', `3b 接太早 → 没翻够（${R.early.bails}）`);
  ok(R.late.bails[0] === 'flipOver', `3c 拨重了又不早点接 → 翻过头（${R.late.bails}）`);
  ok(R.light.bails[0] === 'flipShort', `3c2 拨太轻 → 转不到一圈（${R.light.bails}）`);
  ok(R.never.bails[0] === 'catch', `3d 不接 → 没接住（${R.never.bails}）`);
  ok(R.oldFinger.bails[0] === 'catch', `3e 一直按着、没离开过板的手指不算接住（${R.oldFinger.bails}）`);
  ok(R.double.names.some((n) => /Double Kickflip/.test(n)) && !R.double.bails.length, `3f 猛拨 + 转两圈时接 → Double Kickflip（${R.double.names} ${R.double.bails}）`);
  ok(R.shoveGood.names.some((n) => /Shove-it/.test(n)) && !R.shoveGood.bails.length, `4a 转板转到半圈接 → ${R.shoveGood.names}`);
  ok(/^shove/.test(R.shoveHalf.bails[0] || ''), `4b 转到 90° 就接 → 摔（${R.shoveHalf.bails}）`);
  ok(R.rest.every((a, i) => !i || a > R.rest[i - 1] + 0.05), `4c 力度差一点，转的角度就差一点：${R.rest.map(deg).join('° → ')}°`);
  ok(R.lowFlip.mx.air <= 0.03, `5 低跳马上猛翻：空中板子最深穿进地面 ${R.lowFlip.mx.air} 米（${R.lowFlip.names} ${R.lowFlip.bails}）`);
  ok(R.auto.names.some((n) => /Varial Kickflip/.test(n)), `6 自动接板（键盘 / 简单模式）：${R.auto.names} ${R.auto.bails}`);
  ok(R.noseWall.mx.ground <= 0.02 && !R.noseWall.bails.length, `7 慢速顶到台子侧面：板头最深伸进去 ${R.noseWall.mx.ground} 米，没摔`);
  ok(R.bailWall.bails[0] === 'wall' && R.bailWall.mx.bail <= 0.03 && R.bailWall.mx.ground <= 0.02, `8 快速撞台子摔倒：摔出去的板子最深 ${R.bailWall.mx.bail} 米，地面 ${R.bailWall.mx.ground} 米`);
  ok(R.kickWall.mx.ground <= 0.02, `9 贴着台子原地转：最深 ${R.kickWall.mx.ground} 米`);
  ok(R.edge.mx.ground < 0.02 && R.edge.mx.bail < 0.03, `10 撞世界边上的墙：板子伸到墙外最多 地面 ${R.edge.mx.ground}、摔倒 ${R.edge.mx.bail} 米`);
  ok(R.ledge.names.includes('50-50') && R.ledge.mx.grind <= 0.01, `11a 边沿 50-50：磨的时候最深穿进台面 ${R.ledge.mx.grind} 米（${R.ledge.names}）`);
  ok(R.railY && Math.abs(R.railY.deck - R.railY.top - 0.003) < 0.005, `11b 圆杆 ${R.railY && R.railY.type}：板底在杆子顶上 ${R.railY ? ((R.railY.deck - R.railY.top) * 100).toFixed(1) : '?'} 厘米`);
  for (const m of Object.keys(R.fuzz)) { const f = R.fuzz[m]; if (f.mx.air > 0.03 || f.mx.bail > 0.03 || f.mx.grind > 0.012 || f.mx.ground > 0.03) { const { hist, ...w } = f.where; console.log('   最深的位置', JSON.stringify(w)); if (hist) for (const k of Object.keys(hist)) { if (k.endsWith('State')) { console.log('   ' + k + ' ' + hist[k]); continue; } console.log('   ' + k + ' 之前：'); for (const h of hist[k]) console.log('     ' + JSON.stringify(h)); } } ok(f.mx.air <= 0.03 && f.mx.bail <= 0.03 && f.mx.grind <= 0.012 && f.mx.ground <= 0.03, `12 ${m} 随机 40 秒：空中 ${f.mx.air}、摔倒 ${f.mx.bail}、磨杆 ${f.mx.grind}、地面 ${f.mx.ground} 米（招式 ${f.names.length} 个，摔 ${f.bails.length} 次）`); }
  for (const k of ['hangBox', 'hangQp', 'hangStairs']) { const h = R[k]; ok(h.maxAirT < 1.3 && h.maxV < 8 && h.mode !== 'air', `13 ${{ hangBox: '板头搭在矮箱子边上', hangQp: '板边搭在跳箱坡的侧面', hangStairs: '一个轮子搭在台阶边上' }[k]}往下掉：空中最久 ${h.maxAirT} 秒，最快 ${h.maxV} 米/秒，最后 ${h.mode}`); }
  console.log('errors:', errs.length ? errs : 'none');
  console.log(fails ? `有 ${fails} 项失败` : '全部通过');
  await b.close(); process.exit(fails ? 1 : 0);
})();
