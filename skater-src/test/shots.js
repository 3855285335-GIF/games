const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_tut','9');localStorage.setItem('fs_settings',JSON.stringify({q:2,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);await p.tap('#mFree');await p.waitForTimeout(500);
  const scene=async(name,setup)=>{
    await p.evaluate(setup);
    await sleep(3500);await p.screenshot({path:'s_'+name+'.png'});
    await p.evaluate(()=>{const sk=__dbg.sk;sk.step=sk.__step||sk.step;});
  };
  const prep=`const sk=__dbg.sk;sk.__step=sk.__step||sk.step.bind(sk);const I={lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0};const run=(n,f)=>{for(let i=0;i<n;i++){f&&f(i,I);sk.__step(1/240,I);}};const freeze=()=>{sk.step=()=>{};};`;
  await scene('kickflip',new Function(prep+`sk.reset(-6,-16,0);sk.s=4.5;run(240);sk.pop('tail',0.8);run(10);sk.flick('front',-1);run(30);freeze();`));
  await scene('handrail',new Function(prep+`sk.reset(-22.5,-40,0);sk.s=4.5;run(Math.round(0.42*240));sk.pop('tail',0.7);run(240*0.55);freeze();`));
  await scene('bowl',new Function(prep+`sk.reset(-13,20.4,0.5);sk.s=4;run(240*1.6);freeze();`));
  await scene('vert',new Function(prep+`sk.reset(14,32,0);sk.s=8.5;run(Math.round(240*1.85));freeze();`));
  await scene('manual',new Function(prep+`sk.reset(-6,-16,0);sk.s=4;run(240,(i,I)=>{I.manual=i>60?0.6:0;});freeze();`));
  await p.setViewportSize({width:844,height:390});
  await scene('land_gap',new Function(prep+`sk.reset(18,-17,0);sk.s=6.6;run(Math.round(240*1.6));freeze();`));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
