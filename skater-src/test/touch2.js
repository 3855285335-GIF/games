const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
  await p.goto(L.URL);await p.waitForTimeout(1200);await p.tap('#mFree');await p.waitForTimeout(400);
  await p.evaluate(()=>{window.__noRender=true;window.__ev=[];window.__fc=[];const I=__dbg.input;const of=I._flickCheck.bind(I);I._flickCheck=(pp,t,r)=>{const v=I._vel(pp,t);const n0=I.events.length;of(pp,t,r);if(Math.hypot(v[0],v[1])>700)window.__fc.push([pp.role,pp.armed,Math.round(v[0]),Math.round(v[1]),Math.round(v[2]),I.inAir,I.events.length>n0]);};const sk=__dbg.sk;for(const k of Object.keys(sk.cb)){const o=sk.cb[k];sk.cb[k]=(...a)=>{window.__ev.push(k+(k==='onBail'?':'+a[0]:''));return o(...a);};}});
  const cdp=await ctx.newCDPSession(p);
  const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  // 不等待返回，按固定间隔连发（模拟真实手指 ~120Hz 采样）
  const burst=async(frames,gap)=>{const ps=[];for(const f of frames){ps.push(send('touchMove',f));await sleep(gap);}await Promise.all(ps);};
  const st=()=>p.evaluate(()=>{const s=__dbg.sk;return {mode:s.mode,spd:+s.speed().toFixed(2),spin:+s.spin.toFixed(2),flipT:+s.flipT.toFixed(2),shoveT:+s.shoveT.toFixed(2),combo:__dbg.combo.list.map(e=>e.name).join('+'),total:__dbg.combo.total,ev:window.__ev.splice(0).join(',')};});
  const log=(n,o)=>console.log(n.padEnd(16),JSON.stringify(o));
  const by=Math.round(await p.evaluate(()=>__dbg.input.boardY())),cx=195;
  const push=async(n)=>{for(let k=0;k<n;k++){await send('touchStart',[[cx,by+60,1],[cx,by-40,2]]);await sleep(30);const fr=[];for(let i=1;i<=10;i++)fr.push([[cx,by+60-i*14,1],[cx,by-40-i*14,2]]);await burst(fr,16);await send('touchEnd',[]);await sleep(80);}};
  const popFrames=(dx)=>{const fr=[];for(let i=1;i<=5;i++)fr.push([[cx,by+50+i*20,1],[cx+(dx||0),by-50,2]]);return fr;};
  await push(3); log('push x3',await st());
  // Ollie
  await send('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(60);await burst(popFrames(),8);
  await sleep(150);log('ollie air?',await st());console.log('  flickchecks',JSON.stringify(await p.evaluate(()=>window.__fc.splice(0))));await sleep(1200);log('ollie land',await st());await send('touchEnd',[]);await sleep(500);
  // Kickflip：后指下划后前指左划，手指保持接触
  await push(2);
  await send('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(60);await burst(popFrames(),8);
  const kf=[];for(let i=1;i<=5;i++)kf.push([[cx,by+150,1],[cx-i*22,by-50,2]]);await burst(kf,8);
  await sleep(120);log('kickflip air',await st());await sleep(1200);log('kickflip land',await st());await send('touchEnd',[]);await sleep(500);
  // 360 flip：前指左划 + 后指左划两次
  await push(3);
  await send('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(60);await burst(popFrames(),8);
  const tf=[];for(let i=1;i<=5;i++)tf.push([[cx-i*22,by+150,1],[cx-i*22,by-50,2]]);await burst(tf,8);
  await sleep(60);
  const tf2=[];for(let i=1;i<=6;i++)tf2.push([[cx-110+i*4,by+150,1],[cx-110,by-50,2]]);await burst(tf2,30); // 慢慢回来（重新武装）
  const tf3=[];for(let i=1;i<=5;i++)tf3.push([[cx-86-i*22,by+150,1],[cx-110,by-50,2]]);await burst(tf3,8);
  await sleep(120);log('360flip air',await st());await sleep(1200);log('360flip land',await st());await send('touchEnd',[]);await sleep(500);
  // 不接板
  await push(1);
  await send('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(60);await burst(popFrames(),8);await send('touchEnd',[]);
  await sleep(1400);log('no catch',await st());await sleep(1800);
  // Nollie：前指快速下划
  await push(2);
  await send('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(60);
  const nf=[];for(let i=1;i<=5;i++)nf.push([[cx,by+50,1],[cx,by-50+i*18,2]]);await burst(nf,8);
  await sleep(1400);log('nollie',await st());await send('touchEnd',[]);await sleep(500);
  // 空中两指旋转
  await push(3);
  await send('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(60);await burst(popFrames(),8);
  const mx=cx,my=by+50,R=80,tw=[];
  for(let i=1;i<=10;i++){const a=i*(Math.PI*0.9)/10;tw.push([[mx+Math.sin(a)*R,my+Math.cos(a)*R+20,1],[mx-Math.sin(a)*R,my-Math.cos(a)*R+20,2]]);}
  await burst(tw,16);
  await sleep(100);log('twist air',await st());await sleep(1200);log('twist land',await st());await send('touchEnd',[]);
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
