const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_pracDone','true');localStorage.setItem('fs_chal','["ollie","kick","speed"]');localStorage.setItem('fs_board','{"deck":1,"grip":1,"wheel":2,"truck":2}');localStorage.setItem('fs_settings',JSON.stringify({q:1,easy:false,music:false,sfx:false,dots:true,time:'auto'}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  await p.tap('#mFree');await sleep(300);
  await p.evaluate(()=>{const sk=__dbg.sk;sk.reset(-13,24,0.25);sk.s=3.5;});await sleep(2500);await p.screenshot({path:'v3f_bowl.png'});
  await p.setViewportSize({width:844,height:390});await sleep(300);
  await p.evaluate(()=>{const sk=__dbg.sk;sk.reset(-6,-14,0);sk.s=0;});await sleep(2500);await p.screenshot({path:'v3f_land.png'});
  console.log('geo landscape',JSON.stringify(await p.evaluate(()=>__dbg.geo&&{w:Math.round(__dbg.geo.halfW*2),len:Math.round(Math.hypot(__dbg.geo.fx-__dbg.geo.rx,__dbg.geo.fy-__dbg.geo.ry))})));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
