const L=require('./lib');
(async()=>{
  const b=await L.launch();
  for(const [dsf,q] of [[2,2],[1,0]]){
    const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:dsf,hasTouch:true,isMobile:true});await L.mock(ctx);
    const p=await ctx.newPage();
    await p.addInitScript((q)=>{localStorage.setItem('fs_settings',JSON.stringify({q,easy:false,music:false,sfx:false,dots:true}));localStorage.setItem('fs_helpSeen','true');},q);
    await p.goto(L.URL);await p.waitForTimeout(1500);await p.tap('#mFree');await p.waitForTimeout(500);
    const fps=await p.evaluate(()=>new Promise(r=>{let n=0;const t0=performance.now();function f(){n++;if(performance.now()-t0<3000)requestAnimationFrame(f);else r(n/3);}requestAnimationFrame(f);}));
    const info=await p.evaluate(()=>{const r=__dbg.scene;let tri=0,calls=0;return {calls:0};});
    console.log('dsf',dsf,'quality',q,'fps',fps.toFixed(1));
    await ctx.close();
  }
  await b.close();
})();
