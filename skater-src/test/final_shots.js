const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();const errs=[];
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});const M=await L.mock(ctx);
  const p=await ctx.newPage();L.errs(p,errs);
  await p.goto(L.URL);await p.waitForTimeout(1500);await p.tap('#mHelp');await sleep(500);await p.screenshot({path:'f_help.png'});await p.tap('#hClose');
  // 第二个玩家（不渲染，只发数据）
  const q=await ctx.newPage();L.errs(q,errs,'B:');
  await q.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_tut','9');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));localStorage.setItem('fs_deck','1');});
  await q.goto(L.URL);await q.waitForTimeout(800);await q.evaluate(()=>{window.__noRender=true;});await q.fill('#inName','阿杰');await q.fill('#inRoom','大厅');await q.tap('#mFree');
  await q.evaluate(()=>{const sk=__dbg.sk;sk.reset(-5.3,-11.5,0.2);});
  await p.setViewportSize({width:844,height:390});
  await p.evaluate(()=>{localStorage.setItem('fs_tut','9');});
  await p.fill('#inName','我');await p.tap('#mFree');await sleep(400);if(await p.isVisible('#help'))await p.tap('#hClose');
  await p.evaluate(()=>{__dbg.combo.add('Kickflip',143);__dbg.combo.add('50-50',260);});
  await sleep(5000);await p.screenshot({path:'f_land_mp.png'});
  console.log('remotes on A:',await p.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
