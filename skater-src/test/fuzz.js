const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.goto(L.URL);await p.waitForTimeout(1200);
  await p.evaluate(()=>{__dbg.startGame('free');__dbg.input.enabled=false;});
  const out=await p.evaluate(()=>{
    const sk=__dbg.sk,T=__dbg.T,combo=__dbg.combo;const PARK=T.bounds;
    let seed=12345;const R=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const stats={steps:0,ground:0,air:0,grind:0,bail:0},evc={};const bad=[];let maxS=0,maxAir=0,maxBail=0;
    for(const k of Object.keys(sk.cb)){const o=sk.cb[k];sk.cb[k]=(...a)=>{const key=k+(k==='onBail'?':'+a[0]:k==='onGrind'?(a[0]?':'+a[1].name:''):'');evc[key]=(evc[key]||0)+1;return o(...a);};}
    const t0=performance.now();
    for(let run=0;run<48;run++){
      sk.reset(-30+R()*60,-43+R()*86,R()*6.28);combo.clear();sk.s=R()*6;
      let lean=0,airT=0,bailT=0,man=0;
      for(let i=0;i<240*50;i++){
        if(i%12===0){lean+= (R()-0.5)*0.8;lean=Math.max(-1,Math.min(1,lean));}
        const I={lean,push:R()<0.02?0.6+R():0,brake:R()<0.005?1:0,manual:0,twist:0,spinRate:0,fingers:2,caught:R()<0.93,fb:0};
        if(R()<0.003)man=R()<0.5?0.6:-0.6; if(R()<0.004)man=0; I.manual=man;
        if(sk.mode==='air'&&R()<0.3)I.spinRate=(R()<0.5?-1:1)*6;
        if(R()<0.0025)sk.pop(R()<0.8?'tail':'nose',R());
        if(R()<0.003)sk.flick(R()<0.6?'front':'back',R()<0.5?-1:1);
        if(R()<0.003)I.twist=(R()-0.5);
        sk.step(1/240,I);combo.tick(1/240,sk);stats.steps++;stats[sk.mode]++;
        const sp=sk.speed();maxS=Math.max(maxS,sp);
        const v=sk.p.x+sk.p.y+sk.p.z+sp+sk.v.x+sk.v.y+sk.v.z+sk.qv.x+sk.qv.w;
        if(!isFinite(v)){bad.push('NaN run'+run+' i'+i+' '+sk.mode);break;}
        const h=T.height(sk.p.x,sk.p.z);
        if(sk.mode==='ground'&&Math.abs(sk.p.y-h)>0.02&&bad.length<12)bad.push('offground '+(sk.p.y-h).toFixed(3)+' run'+run+' at '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1));
        if(sk.mode==='air'&&sk.p.y<h-0.06&&bad.length<12)bad.push('below '+(sk.p.y-h).toFixed(3)+' run'+run+' at '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1));
        if(sk.p.x<PARK.minX-0.3||sk.p.x>PARK.maxX+0.3||sk.p.z<PARK.minZ-0.3||sk.p.z>PARK.maxZ+0.3){if(bad.length<12)bad.push('outside run'+run+' '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1)+' '+sk.mode);}
        if(sk.mode==='grind'&&(sk.grind.u<-0.01||sk.grind.u>sk.grind.r.L+0.01)&&bad.length<12)bad.push('grind u out '+sk.grind.u);
        if(sk.mode==='air'){airT+=1/240;maxAir=Math.max(maxAir,airT);if(airT>6){if(bad.length<12)bad.push('stuck air run'+run+' '+sk.p.x.toFixed(1)+','+sk.p.y.toFixed(2)+','+sk.p.z.toFixed(1));break;}}else airT=0;
        if(sk.mode==='bail'){bailT+=1/240;maxBail=Math.max(maxBail,bailT);}else bailT=0;
        if(sp>20&&bad.length<12)bad.push('fast '+sp.toFixed(1)+' run'+run+' '+sk.mode);
      }
    }
    return {ms:Math.round(performance.now()-t0),stats,evc,bad,maxS:+maxS.toFixed(2),maxAir:+maxAir.toFixed(2),maxBail:+maxBail.toFixed(2),total:combo.total};
  });
  console.log(JSON.stringify(out,null,1));console.log('errors:',errs.length?errs:'none');await b.close();
})();
