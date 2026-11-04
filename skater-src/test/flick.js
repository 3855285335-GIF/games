const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');});
  await p.goto(L.URL);await p.waitForTimeout(1200);await p.tap('#mFree');await p.waitForTimeout(400);
  await p.evaluate(()=>{window.__noRender=true;window.__fl=[];const I=__dbg.input;const o=I._flickCheck.bind(I);
    I._flickCheck=(pp,t,rel)=>{const v=I._vel(pp,t);window.__fl.push([pp.role,pp.armed,Math.round(v[0]),Math.round(v[1]),Math.round(v[2]),pp.hist.length,+(t-pp.hist[0][0]).toFixed(3),rel?'R':'']);return o(pp,t,rel);};
    const od=I._move.bind(I);});
  const cdp=await ctx.newCDPSession(p);
  const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  const by=Math.round(await p.evaluate(()=>__dbg.input.boardY())),cx=195;
  await T('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(80);
  const t0=Date.now();
  for(let i=1;i<=4;i++){await T('touchMove',[[cx,by+50+i*22,1],[cx,by-50,2]]);await sleep(12);}
  console.log('wall ms for 4 moves',Date.now()-t0);
  await sleep(200);
  console.log(JSON.stringify(await p.evaluate(()=>({fl:window.__fl,ev:__dbg.input.events,mode:__dbg.sk.mode}))));
  await T('touchEnd',[]);
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
