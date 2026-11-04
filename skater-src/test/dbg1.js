const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.goto(L.URL);await p.waitForTimeout(1200);
  await p.evaluate(()=>{__dbg.startGame('free');__dbg.input.enabled=false;});
  const out=await p.evaluate(()=>{
    const {sk,T}=__dbg;const log=[];const I=()=>({lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0});
    const ob=sk.cb.onBail;sk.cb.onBail=(w)=>{const f=new sk.p.constructor(0,0,1).applyQuaternion(sk.qa);log.push('BAIL '+w+' v='+[sk.v.x,sk.v.y,sk.v.z].map(x=>x.toFixed(2))+' f='+[f.x,f.y,f.z].map(x=>x.toFixed(2))+' p='+[sk.p.x,sk.p.y,sk.p.z].map(x=>x.toFixed(2)));ob(w);};
    sk.reset(-1,-29.72,Math.PI/2);sk.s=4.5;let prev='';
    for(let i=0;i<240*3;i++){const inp=I();if(i===132)sk.pop('tail',0.4);sk.step(1/240,inp);
      if(sk.mode!==prev){const f=new sk.p.constructor(0,0,1).applyQuaternion(sk.qv);log.push((i/240).toFixed(3)+' '+sk.mode+' p='+[sk.p.x,sk.p.y,sk.p.z].map(x=>x.toFixed(3))+' v='+[sk.v.x,sk.v.y,sk.v.z].map(x=>x.toFixed(2))+' f='+[f.x,f.y,f.z].map(x=>x.toFixed(2))+(sk.grind?' g='+sk.grind.name+' sp='+sk.grind.sp.toFixed(2)+' r='+sk.grind.r.id:''));prev=sk.mode;}}
    return log;});
  console.log(out.join('\n'));console.log('errors:',errs.length?errs:'none');await b.close();
})();
