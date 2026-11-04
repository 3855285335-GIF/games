const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  const run=async(map,fnSrc)=>p.evaluate(({map,fnSrc})=>{
    window.__noRender=true;__dbg.loadMap(map);__dbg.startGame('free');__dbg.input.enabled=false;
    const sk=__dbg.sk,T=__dbg.T,combo=__dbg.combo;const res=[];const ev=[];
    for(const k of Object.keys(sk.cb)){const o=sk.cb[k];sk.cb[k]=(...a)=>{ev.push(k+(k==='onBail'?':'+a[0]:k==='onGrind'?':'+(a[0]?'on '+a[1].name:'off'):''));return o(...a);};}
    const I=()=>({lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0,pump:false});
    const place=(x,z,yaw,s)=>{combo.clear();sk.reset(x,z,yaw);sk.s=s||0;ev.length=0;};
    const go=(name,sec,fn)=>{const n=Math.round(sec*240);let tr=[],prev=sk.mode,maxY=-9,maxS=0,bad=null;
      for(let i=0;i<n;i++){const inp=I();fn&&fn(i/240,inp,i);sk.step(1/240,inp);combo.tick(1/240,sk);maxY=Math.max(maxY,sk.p.y);maxS=Math.max(maxS,sk.speed());
        if(!isFinite(sk.p.x+sk.p.y+sk.p.z)){bad='NaN';break;}
        if(sk.mode!==prev){tr.push(prev.slice(0,2)+'>'+sk.mode.slice(0,2)+'@'+(i/240).toFixed(2));prev=sk.mode;}}
      res.push({name,end:sk.mode,pos:[sk.p.x,sk.p.y,sk.p.z].map(v=>+v.toFixed(2)),spd:+sk.speed().toFixed(2),maxY:+maxY.toFixed(2),maxS:+maxS.toFixed(2),tr:tr.join(' '),ev:[...new Set(ev)].join(','),combo:combo.list.map(e=>e.name).join('|'),chal:[...JSON.parse(localStorage.getItem('fs_chal')||'[]')].join(','),bad});};
    eval(fnSrc);
    return res;
  },{map,fnSrc});
  const roof=await run('roof',`
    go('spawnRoll',3,(t,i)=>{if(t<1)i.push=0.02;});
    place(0,-20,0,4.5);go('stairsOllie',3,(t,i)=>{if(Math.abs(t-0.95)<0.002)sk.pop('tail',0.8);});
    place(3.2,-19,0,4.5);go('handrail',3.5,(t,i)=>{if(Math.abs(t-0.62)<0.002)sk.pop('tail',0.8);});
    place(0,-9,0,6.6);go('skylightGap',3,null);
    place(0,-9,0,4.0);go('skylightSlow',3,null);
    place(-14,13.4,0,3);go('poolDrop',6,null);
    place(6,23,0,8.5);go('qpN',4,null);
    place(-20,-3,Math.PI,5.5);go('bankUp',3,null);
    place(14,-17,0,5);go('dropEdge',2,null);
    place(-22.27,-6,0,4.5);go('westLedge',3,(t,i)=>{if(Math.abs(t-0.5)<0.002)sk.pop('tail',0.5);});
    place(18,8,Math.PI/2,5);go('acWall',2,null);
  `);
  const park=await run('park',`
    place(-13,29,0,3);go('bowlNoPump',15,null);
    place(-13,29,0,3);go('bowlPump',15,(t,i)=>{i.pump=true;});
    place(-6,-14,0,5);go('powerslide',2,(t,i,n)=>{if(n===10)sk.powerslide(1);});
    place(-6,-14,0,4);go('manualTap',1,(t,i)=>{if(t<0.08)i.manual=0.6;});
    place(-6,-14,0,4);go('manualHold',1.5,(t,i)=>{if(t<1.2)i.manual=0.6;});
    place(-6,-14,0,4);go('manualShort',1.5,(t,i)=>{if(t<0.3)i.manual=0.6;});
  `);
  for(const r of [...roof,...park])console.log(JSON.stringify(r));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
