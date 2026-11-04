const L=require('./lib');
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  const t0=Date.now();await p.goto(L.URL);await p.waitForTimeout(2500);console.log('load ms',Date.now()-t0);
  await p.screenshot({path:'m_menu.png'});
  await p.evaluate(()=>document.getElementById('inName').value='测试');
  await p.tap('#mFree');await p.waitForTimeout(600);
  // 关掉首次的说明面板
  if(await p.isVisible('#help')){await p.screenshot({path:'m_help.png'});await p.tap('#hClose');}
  await p.waitForTimeout(800);
  await p.screenshot({path:'m_play.png'});
  console.log(await p.evaluate(()=>{const s=__dbg.sk;return JSON.stringify({mode:s.mode,p:[s.p.x,s.p.y,s.p.z].map(v=>+v.toFixed(2)),state:document.getElementById('hud').className,net:document.getElementById('net').textContent,hint:document.getElementById('hint').textContent});}));
  console.log('errors:',errs.length?errs.slice(0,10):'none');
  await b.close();
})();
