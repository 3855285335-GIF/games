const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_tut','9');localStorage.setItem('fs_settings',JSON.stringify({q:2,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);await p.tap('#mFree');await p.waitForTimeout(500);
  const prep=`const sk=__dbg.sk;__dbg.combo.clear();sk.__step=sk.__step||sk.step.bind(sk);sk.step=sk.__step;const I={lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0};const run=(n,f)=>{for(let i=0;i<n;i++){f&&f(i,I);sk.__step(1/240,I);}};const freeze=()=>{sk.step=()=>{};};`;
  const scene=async(name,code,wait)=>{await p.evaluate(new Function(prep+code));await sleep(wait||4500);await p.screenshot({path:'s2_'+name+'.png'});};
  await scene('bowl_in',`sk.reset(-13,24,0.3);sk.s=3;run(30);freeze();`);
  await scene('vert_air',`sk.reset(14,33,0);sk.s=8.5;run(Math.round(240*1.75));freeze();`);
  await scene('handrail',`sk.reset(-22.5,-40,0);sk.s=4.5;run(Math.round(0.42*240));sk.pop('tail',0.7);run(Math.round(240*0.62));freeze();`);
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
