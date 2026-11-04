const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();
  await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_tut','9');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1200);await p.tap('#mFree');await p.waitForTimeout(400);
  await p.evaluate(()=>{const sk=__dbg.sk;sk.__step=sk.step.bind(sk);const I={lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0};
    sk.reset(-22.5,-40,0);sk.s=4.5;for(let i=0;i<Math.round(0.42*240);i++)sk.__step(1/240,I);sk.pop('tail',0.7);for(let i=0;i<Math.round(0.55*240);i++)sk.__step(1/240,I);sk.step=()=>{};});
  await sleep(4000);
  console.log(await p.evaluate(()=>{const {sk,cam}=__dbg;const d=new sk.p.constructor();cam.getWorldDirection(d);const g=sk.grind;
    const v=sk.p.clone().project(cam);
    return JSON.stringify({mode:sk.mode,p:[sk.p.x,sk.p.y,sk.p.z].map(x=>+x.toFixed(2)),rail:g&&{id:g.r.id,d:[g.r.dx,g.r.dy,g.r.dz].map(x=>+x.toFixed(2)),sp:+g.sp.toFixed(2),type:g.type},travel:+sk.travelYaw().toFixed(2),cam:[cam.position.x,cam.position.y,cam.position.z].map(x=>+x.toFixed(2)),camDir:[d.x,d.y,d.z].map(x=>+x.toFixed(2)),boardNDC:[v.x,v.y].map(x=>+x.toFixed(2))});}));
  await b.close();
})();
