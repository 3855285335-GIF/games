const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();await p.addInitScript(()=>{localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  console.log(await p.evaluate(()=>{window.__noRender=true;__dbg.startGame('free');__dbg.input.enabled=false;const sk=__dbg.sk;const out=[];
    for(const pump of [false,true]){sk.reset(-13,29,0);sk.s=4;let pumpT=0;const peaks=[];let maxY=-9;
      for(let i=0;i<240*20;i++){sk.step(1/240,{lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0,pump});if(sk.pumping)pumpT+=1/240;maxY=Math.max(maxY,sk.p.y);if(i%(240*4)===240*4-1){peaks.push(+maxY.toFixed(2));maxY=-9;}}
      out.push((pump?'pump  ':'nopump')+' peaks per 4s: '+peaks.join(' ')+' | pumping time '+pumpT.toFixed(1)+'s | mode '+sk.mode);}
    return out.join('\n');}));
  await b.close();
})();
