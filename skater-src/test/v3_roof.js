const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.clear();localStorage.setItem('fs_map','"roof"');localStorage.setItem('fs_pracDone','true');});
  await p.goto(L.URL);await p.waitForTimeout(3000);
  await p.screenshot({path:'v3_menu_roof.png'});
  await p.evaluate(()=>{__dbg.startGame('free');});await sleep(4000);await p.screenshot({path:'v3_play_roof.png'});
  console.log(JSON.stringify(await p.evaluate(()=>({map:__dbg.T.id,geo:__dbg.geo&&Object.fromEntries(Object.entries(__dbg.geo).map(([k,v])=>[k,Math.round(v)])),time:__dbg.lighting.cur}))));
  // 远景：从台阶上往下看
  await p.evaluate(()=>{const sk=__dbg.sk;sk.reset(0,-20,0);});await sleep(4000);await p.screenshot({path:'v3_roof_stairs.png'});
  console.log('errors:',errs.length?errs.slice(0,10):'none');await b.close();
})();
