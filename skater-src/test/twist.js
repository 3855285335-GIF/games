const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1200);await p.tap('#mFree');await p.waitForTimeout(400);
  await p.evaluate(()=>{window.__noRender=true;window.__L=[];const I=__dbg.input;const o=I._flickCheck.bind(I);
    I._flickCheck=(pp,t,rel)=>{const v=I._vel(pp,t);const n0=I.events.length;const r=o(pp,t,rel);if(Math.hypot(v[0],v[1])>500)window.__L.push(['chk',pp.role,Math.round(v[0]),Math.round(v[1]),I.events.length>n0?'EVENT '+JSON.stringify(I.events[I.events.length-1]):'']);return r;};
    const ou=I.update.bind(I);I.update=(dt,g)=>{const pa=I.prevAng;const r=ou(dt,g);const arr=[...I.ptrs.values()];if(arr.length===2){const b=arr.find(q=>q.role==='back'),f=arr.find(q=>q.role==='front');window.__L.push(['upd',b&&f?+Math.atan2(b.y-f.y,b.x-f.x).toFixed(2):null,pa==null?null:+pa.toFixed(2),+r.twist.toFixed(3),arr.map(q=>(q.flicked?'F':'')+(q.armed?'a':'')+q.role[0]).join(''),I.anchor&&I.anchor.sig]);}return r;};});
  const cdp=await ctx.newCDPSession(p);
  const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  const burst=async(frames,gap)=>{const ps=[];for(const f of frames){ps.push(send('touchMove',f));await sleep(gap);}await Promise.all(ps);};
  const by=Math.round(await p.evaluate(()=>__dbg.input.boardY())),cx=195;
  await p.evaluate(()=>{__dbg.sk.s=4;});
  // 直接在空中做旋转（先用键盘方式起跳避免干扰）
  await p.evaluate(()=>__dbg.sk.pop('tail',1));
  await send('touchStart',[[cx,by+70,1],[cx,by-90,2]]);await sleep(40);
  const mx=cx,my=by-10,R=80,tw=[];
  for(let i=1;i<=12;i++){const a=i*(Math.PI*0.9)/12;tw.push([[mx+Math.sin(a)*R,my+Math.cos(a)*R,1],[mx-Math.sin(a)*R,my-Math.cos(a)*R,2]]);}
  await burst(tw,20);await sleep(60);
  console.log(JSON.stringify(await p.evaluate(()=>({L:window.__L,spin:+__dbg.sk.spin.toFixed(2),mode:__dbg.sk.mode,flipT:__dbg.sk.flipT,shoveT:__dbg.sk.shoveT}))));
  await send('touchEnd',[]);
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
