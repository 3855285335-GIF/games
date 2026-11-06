const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_pracDone','true');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true,flick:3,steer:3,time:'day'}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  await p.evaluate(()=>{window.__noRender=true;__dbg.startGame('free');const sk=__dbg.sk;sk.reset(2.6, -9.6, 0);sk.s=4;});
  await sleep(500);
  const cdp=await ctx.newCDPSession(p);
  const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  const burst=async(frames,gap)=>{const ps=[];for(const f of frames){ps.push(send('touchMove',f));await sleep(gap);}await Promise.all(ps);};
  // 用键盘方式起跳，然后两指放到板上旋转
  await p.evaluate(()=>__dbg.sk.pop('tail',1));await sleep(80);
  const g=await p.evaluate(()=>__dbg.geo);
  // 手指按在板上实际的位置：沿板身方向、离中心 0.6 个半板长（和真人一样按在板上）
  const cx=(g.rx+g.fx)/2,cy=(g.ry+g.fy)/2,half=Math.hypot(g.fx-g.rx,g.fy-g.ry)/2,R=half*0.6,a0=Math.atan2(g.rx-cx,g.ry-cy);
  console.log('board on screen: half-length',half.toFixed(0),'px, halfW',(g.halfW||0).toFixed(0),'px, old test used R=70');
  await send('touchStart',[[cx+Math.sin(a0)*R,cy+Math.cos(a0)*R,1],[cx-Math.sin(a0)*R,cy-Math.cos(a0)*R,2]]);await sleep(30);
  const fr=[];for(let i=1;i<=12;i++){const a=a0+i*(Math.PI*0.9)/12;fr.push([[cx+Math.sin(a)*R,cy+Math.cos(a)*R,1],[cx-Math.sin(a)*R,cy-Math.cos(a)*R,2]]);}
  await burst(fr,20);await sleep(50);
  const r=await p.evaluate(()=>({spin:+__dbg.sk.spin.toFixed(2),flipT:__dbg.sk.flipT,shoveT:__dbg.sk.shoveT,mode:__dbg.sk.mode,ptrs:[...__dbg.input.ptrs.values()].map(q=>q.ghost?'G':q.on?'on':'off')}));
  console.log('twist in air:',JSON.stringify(r));
  await sleep(900);console.log('after landing:',JSON.stringify(await p.evaluate(()=>({mode:__dbg.sk.mode,combo:__dbg.combo.list.map(e=>e.name)}))));
  await send('touchEnd',[]);
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
