// 两张地图的随机压力测试
const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript((sd)=>{window.__seed=sd;},+(process.env.SEED||777));
  await p.addInitScript(()=>{localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  for(const map of ['spot','park']){
    await p.evaluate((m)=>{window.__noRender=true;__dbg.loadMap(m);__dbg.startGame('free');__dbg.input.enabled=false;},map);
    const out=await p.evaluate(()=>{
      const sk=__dbg.sk,T=__dbg.T,combo=__dbg.combo,B=T.bounds;
      let seed=window.__seed||777;const R=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      const stats={ground:0,air:0,grind:0,bail:0},evc={};const bad=[];let maxS=0,maxAir=0;
      for(const k of Object.keys(sk.cb)){const o=sk.cb[k];sk.cb[k]=(...a)=>{const key=k+(k==='onBail'?':'+a[0]:'');evc[key]=(evc[key]||0)+1;return o(...a);};}
      for(let run=0;run<40;run++){
        sk.reset(B.minX+2+R()*(B.maxX-B.minX-4),B.minZ+2+R()*(B.maxZ-B.minZ-4),R()*6.28);combo.clear();sk.s=R()*6;
        let lean=0,airT=0,man=0,kickN=0,kickD=0;
        for(let i=0;i<240*45;i++){
          if(i%12===0){lean+=(R()-0.5)*0.8;lean=Math.max(-1,Math.min(1,lean));}
          const I={lean,push:R()<0.02?0.6+R():0,brake:R()<0.005?1:0,manual:0,twist:0,spinRate:0,fingers:2,caught:R()<0.93,fb:0,pump:R()<0.5};
          if(R()<0.003)man=R()<0.5?0.6:-0.6; if(R()<0.004)man=0; I.manual=man;
          if(sk.mode==='air'&&R()<0.3)I.spinRate=(R()<0.5?-1:1)*6;
          // Kickturn：一阵一阵地转；偶尔长按磨杆
          if(kickN<=0&&R()<0.004){kickN=Math.floor(20+R()*120);kickD=(R()-0.5)*0.05;} if(kickN>0){kickN--;I.kick=kickD;}
          if(R()<0.0015&&(sk.mode==='ground'||sk.mode==='air'))sk.lockGrind();
          if(R()<0.0025)sk.pop(R()<0.8?'tail':'nose',R());
          if(R()<0.003)sk.flick(R()<0.6?'front':'back',R()<0.5?-1:1);
          if(R()<0.0008)sk.powerslide(R()<0.5?-1:1);
          sk.step(1/240,I);combo.tick(1/240,sk);stats[sk.mode]++;
          const sp=sk.speed();maxS=Math.max(maxS,sp);
          if(!isFinite(sk.p.x+sk.p.y+sk.p.z+sp+sk.v.x+sk.v.y+sk.v.z+sk.qv.x+sk.qv.w)){bad.push('NaN run'+run+' '+sk.mode);break;}
          const h=T.height(sk.p.x,sk.p.z);
          if(sk.mode==='ground'&&Math.abs(sk.p.y-h)>0.02&&bad.length<10)bad.push('offground '+(sk.p.y-h).toFixed(3)+' at '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1));
          if(sk.mode==='air'&&sk.p.y<h-0.07&&bad.length<10)bad.push('below '+(sk.p.y-h).toFixed(3)+' at '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1));
          if((sk.p.x<B.minX-0.3||sk.p.x>B.maxX+0.3||sk.p.z<B.minZ-0.3||sk.p.z>B.maxZ+0.3)&&bad.length<10)bad.push('outside '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1));
          if(sk.mode==='air'){airT+=1/240;maxAir=Math.max(maxAir,airT);}else airT=0;
          if(sp>16&&bad.length<10)bad.push('fast '+sp.toFixed(1)+' '+sk.mode+(sk.hop?' hop':'')+' at '+sk.p.x.toFixed(1)+','+sk.p.z.toFixed(1));
        }
      }
      return {stats,evc,bad,maxS:+maxS.toFixed(2),maxAir:+maxAir.toFixed(2)};
    });
    console.log(map,JSON.stringify(out));
  }
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
