const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.clear();});
  await p.goto(L.URL);await p.waitForTimeout(3000);
  await p.screenshot({path:'v3_menu.png'});
  await p.tap('#mGarage');await sleep(2500);await p.screenshot({path:'v3_garage.png'});
  await p.tap('#gTabs span[data-k="grip"]');await sleep(300);await p.locator('#gGrid .gi').nth(1).tap();await sleep(2500);await p.screenshot({path:'v3_garage_grip.png'});
  await p.tap('#gDone');await sleep(300);
  await p.tap('#mFree');await sleep(3500);await p.screenshot({path:'v3_play.png'});
  console.log(JSON.stringify(await p.evaluate(()=>({state:__dbg.state,geo:__dbg.geo&&Object.fromEntries(Object.entries(__dbg.geo).map(([k,v])=>[k,Math.round(v)])),map:__dbg.T.id}))));
  await p.tap('#bPause');await p.tap('#pMenu');await sleep(300);
  await p.locator('#maps .chip').nth(1).tap();await sleep(3500);await p.screenshot({path:'v3_menu_roof.png'});
  await p.tap('#mFree');await sleep(3500);await p.screenshot({path:'v3_play_roof.png'});
  console.log('errors:',errs.length?errs.slice(0,10):'none');await b.close();
})();
