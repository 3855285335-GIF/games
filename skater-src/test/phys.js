const L=require('./lib');
(async()=>{
  const b=await L.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.goto(L.URL);await p.waitForTimeout(1500);
  await p.evaluate(()=>{document.getElementById('inName').value='T';__dbg.startGame('free');__dbg.input.enabled=false;});
  const out=await p.evaluate(()=>{
    const {sk,T,combo}=__dbg;const res=[];const ev=[];
    const orig=Object.assign({},sk.cb);
    for(const k of Object.keys(orig))sk.cb[k]=(...a)=>{ev.push(k+(k==='onBail'?':'+a[0]:k==='onGrind'?':'+(a[0]?'on '+a[1].name:'off '+(a[2]||'')):''));return orig[k](...a);};
    const I=()=>({lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0});
    function place(x,z,yaw,s){combo.clear();sk.reset(x,z,yaw);sk.s=s||0;ev.length=0;}
    function run(name,sec,fn){const n=Math.round(sec*240);let tr=[],prev=sk.mode,maxY=-9,maxS=0,bad=null;
      for(let i=0;i<n;i++){const inp=I();fn&&fn(i/240,inp);sk.step(1/240,inp);combo.tick(1/240,sk);
        const sp=sk.speed();maxY=Math.max(maxY,sk.p.y);maxS=Math.max(maxS,sp);
        if(!isFinite(sk.p.x+sk.p.y+sk.p.z+sp)){bad='NaN@'+i;break;}
        if(sk.mode==='ground'){const h=T.height(sk.p.x,sk.p.z);if(Math.abs(sk.p.y-h)>0.02&&!bad)bad='offground '+(sk.p.y-h).toFixed(3)+'@'+(i/240).toFixed(2);}
        if(sk.mode!==prev){tr.push(prev[0]+'>'+sk.mode[0]+'@'+(i/240).toFixed(2));prev=sk.mode;}}
      res.push({name,end:sk.mode,pos:[sk.p.x,sk.p.y,sk.p.z].map(v=>+v.toFixed(2)),spd:+sk.speed().toFixed(2),maxY:+maxY.toFixed(2),maxS:+maxS.toFixed(2),fakie:sk.fakie,tr:tr.join(' '),ev:[...new Set(ev)].join(','),combo:combo.list.map(e=>e.name+':'+Math.round(e.pts)).join(' | '),total:combo.total,bad});}
    // 1 推板加速
    place(-6,-14,0,0);run('push',3,(t,i)=>{if(Math.floor(t*240)%24===0)i.push=0.9;});
    // 2 平地 Ollie
    place(-6,-14,0,4);run('ollie',1.5,(t,i)=>{if(t===0)sk.pop('tail',0.5);});
    // 3 Kickflip
    place(-6,-14,0,4);run('kickflip',1.5,(t,i)=>{if(t===0){sk.pop('tail',0.6);} if(Math.abs(t-0.05)<0.002)sk.flick('front',-1);});
    // 4 没接住
    place(-6,-14,0,4);run('nocatch',1.5,(t,i)=>{if(t===0)sk.pop('tail',0.5);i.fingers=0;i.caught=false;});
    // 5 Varial + 180
    place(-6,-14,0,4);run('varial180',1.6,(t,i)=>{if(t===0){sk.pop('tail',1);} if(Math.abs(t-0.04)<0.002){sk.flick('front',-1);sk.flick('back',-1);} if(t>0.02&&t<0.5)i.spinRate=6.3;});
    // 6 翻板太晚（应被忽略或判摔）
    place(-6,-14,0,4);run('lateflip',1.5,(t,i)=>{if(t===0)sk.pop('tail',0);if(Math.abs(t-0.5)<0.002)sk.flick('front',-1);});
    // 7 碗池：从唇边滚进去，来回滑 12 秒
    place(-13,20.4,0,3);run('bowl',12,null);
    // 8 碗池里冲墙飞出
    place(-13,26,0,7.5);run('bowlAir',4,null);
    // 9 北边大坡 vert
    place(14,32,0,8.5);run('vertN',4,null);
    // 10 U 台来回
    place(15,29,-Math.PI/2,6);run('miniramp',10,null);
    // 11 大跳台飞越
    place(18,-17,0,6.6);run('gap',3,(t,i)=>{});
    // 12 平台滚下台阶
    place(-19,-39,0,4);run('stairsRoll',3,null);
    // 13 平台 Ollie 下台阶
    place(-19,-39.5,0,5);run('stairsOllie',3,(t,i)=>{if(Math.abs(t-0.75)<0.002)sk.pop('tail',0.8);});
    // 14 扶手磨杆
    place(-22.5,-40,0,4.5);run('handrail',3.5,(t,i)=>{if(Math.abs(t-0.42)<0.002)sk.pop('tail',0.7);});
    // 15 边沿磨杆 ledge A
    place(-1,-29.72,Math.PI/2,4.5);run('ledge',3,(t,i)=>{if(Math.abs(t-0.55)<0.002)sk.pop('tail',0.4);});
    // 16 平杆 boardslide（板横着）
    place(-4,-34,0,4.5);run('railslide',3,(t,i)=>{if(Math.abs(t-0.95)<0.002)sk.pop('tail',0.5);if(t>0.96&&t<1.2)i.spinRate=6.3;});
    // 17 撞跳箱侧面
    place(9,0,-Math.PI/2,5);run('wallhit',2,null);
    // 18 Manual
    place(-6,-14,0,4.5);run('manual',4,(t,i)=>{if(t<3.4){i.manual=0.6;i.fingers=1;}});
    // 19 金字塔
    place(-17,-12,0,5);run('pyramid',4,null);
    // 20 跳箱翻越
    place(0,-10,0,5);run('funbox',4,null);
    // 21 东坡
    place(24,-20,Math.PI/2,7);run('qpE',5,null);
    // 22 围墙
    place(0,-40,Math.PI,6);run('parkwall',2.5,null);
    return res;});
  for(const r of out)console.log(JSON.stringify(r));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
