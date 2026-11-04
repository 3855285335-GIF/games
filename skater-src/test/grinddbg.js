const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();await p.addInitScript(()=>{localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1200);
  console.log(await p.evaluate(()=>{window.__noRender=true;__dbg.startGame('free');__dbg.input.enabled=false;const sk=__dbg.sk;const R=__dbg.T.rails.find(x=>x.flat&&x.kind==='rail');const out=['rail '+[R.ax,R.ay,R.az,R.bx,R.bz].join(',')];
    for(const popD of [1.35,1.8,2.2]){sk.reset(-4,-35,0);sk.s=4.1;let popped=false,prev='';
      for(let i=0;i<240*2.5;i++){const d=Math.hypot(sk.p.x-R.ax,sk.p.z-R.az);if(!popped&&d<popD&&sk.p.z<R.az){popped=true;sk.pop('tail',0.5);}
        sk.step(1/240,{lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0});
        if(sk.mode!==prev){out.push(popD+' t='+(i/240).toFixed(2)+' '+sk.mode+' z='+sk.p.z.toFixed(2)+' y='+sk.p.y.toFixed(2)+' vy='+sk.v.y.toFixed(2));prev=sk.mode;}}}
    return out.join('\n');}));
  await b.close();
})();
