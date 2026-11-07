const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_pracDone','true');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true,flick:3,steer:3,time:'day'}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  await p.evaluate(()=>{window.__noRender=true;__dbg.startGame('free');window.__ev=[];window.__nm=[];const c=__dbg.combo,oa=c.add.bind(c),os=c.startLive.bind(c);c.add=(n,pt)=>{window.__nm.push(n);return oa(n,pt);};c.startLive=(n,r,k)=>{window.__nm.push(n);return os(n,r,k);};const sk=__dbg.sk;for(const k of Object.keys(sk.cb)){const o=sk.cb[k];sk.cb[k]=(...a)=>{window.__ev.push(k+(k==='onBail'?':'+a[0]:''));return o(...a);};}});
  await sleep(500);
  const cdp=await ctx.newCDPSession(p);
  const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  const burst=async(frames,gap)=>{const ps=[];for(const f of frames){ps.push(send('touchMove',f));await sleep(gap);}await Promise.all(ps);};
  const G=async()=>p.evaluate(()=>__dbg.geo);
  // 板子坐标 → 屏幕坐标
  const at=(g,al,ac)=>{const ux=g.fx-g.rx,uy=g.fy-g.ry,L=Math.hypot(ux,uy),nx=ux/L,ny=uy/L;return [g.cx+nx*al*L/2+(-ny)*ac*g.halfW, g.cy+ny*al*L/2+nx*ac*g.halfW];};
  const st=()=>p.evaluate(()=>{const s=__dbg.sk;return {mode:s.mode,spd:+s.speed().toFixed(2),hd:+s.heading.toFixed(2),lean:+s.lean.toFixed(2),man:!!s.manual,spin:+s.spin.toFixed(2),flipT:+s.flipT.toFixed(2),slide:!!s.slide,combo:window.__nm.splice(0).join('+'),ev:window.__ev.splice(0).join(','),ptrs:[...__dbg.input.ptrs.values()].map(q=>(q.ghost?'G':q.on?'on':'off')+':'+q.role).join(' ')};});
  const R={};const log=(n,o)=>{R[n]=o;console.log(n.padEnd(15),JSON.stringify(o));};
  const reset=async(spd)=>{await p.evaluate((v)=>{const sk=__dbg.sk;__dbg.combo.clear();sk.reset(2.6, -9.6, 0);sk.s=v;__dbg.renderQ.copy(sk.qv);window.__ev=[];window.__nm=[];},spd);await sleep(450);};
  let g=await G();console.log('geo',JSON.stringify(Object.fromEntries(Object.entries(g).map(([k,v])=>[k,Math.round(v)]))));
  // 1 板外的手指：应该是灰色、推不动
  await send('touchStart',[[60,220,9]]);await sleep(30);await burst([[[60,180,9]],[[60,140,9]],[[60,100,9]]],30);
  log('offboard push',await st());await send('touchEnd',[]);await sleep(100);
  await reset(0);
  // 2 推板：两指从板尾附近往板头推，推出板子
  const push=async()=>{g=await G();const A=at(g,-0.6,0),B=at(g,0.3,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(40);
    const fr=[];for(let i=1;i<=12;i++){const a=at(g,-0.6+i*0.17,0),b2=at(g,0.3+i*0.17,0);fr.push([[a[0],a[1],1],[b2[0],b2[1],2]]);}await burst(fr,16);await send('touchEnd',[]);await sleep(60);};
  for(let k=0;k<3;k++)await push();
  log('push x3',await st());
  // 3 推出板外后继续往上滑：不应该再加速
  g=await G();{const A=at(g,0.2,0),B=at(g,0.7,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(40);
    const fr=[];for(let i=1;i<=20;i++)fr.push([[A[0],A[1]-i*25,1],[B[0],B[1]-i*25,2]]);const s0=(await st()).spd;await burst(fr,16);await sleep(100);const s1=await st();log('slide past top',{before:s0,...s1});await send('touchEnd',[]);}
  await sleep(100);
  await reset(3);
  // 4 转弯：两指压在板子右半边
  g=await G();{const h0=(await st()).hd;const A=at(g,-0.4,0.7),B=at(g,0.4,0.7);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(700);const s=await st();log('press right',{dHeading:+(s.hd-h0).toFixed(2),lean:s.lean,ptrs:s.ptrs});
    // 手指滑到屏幕边：脱板，不再转
    await burst([[[A[0]+60,A[1],1],[B[0]+60,B[1],2]],[[A[0]+120,A[1],1],[B[0]+120,B[1],2]],[[388,A[1],1],[388,B[1],2]]],30);await sleep(400);const s2=await st();log('slid to edge',{lean:s2.lean,ptrs:s2.ptrs});await send('touchEnd',[]);}
  await reset(4);
  // 5 Ollie：后指往下划出板尾，然后手指放回板上接板
  g=await G();{const A=at(g,-0.55,0),B=at(g,0.5,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(60);
    const fr=[];for(let i=1;i<=5;i++){const a=at(g,-0.55-i*0.34,0);fr.push([[a[0],a[1],1],[B[0],B[1],2]]);}await burst(fr,8);await sleep(120);log('ollie',await st());await send('touchEnd',[]);
    await sleep(300);g=await G();const C=at(g,-0.3,0),D=at(g,0.4,0);await send('touchStart',[[C[0],C[1],3],[D[0],D[1],4]]);await sleep(900);log('ollie landed',await st());await send('touchEnd',[]);}
  await reset(4);
  // 6 Kickflip（先划再松）：前指先侧拨出板边，后指再往板尾划、松手；板子转完再放回接板
  g=await G();{const A=at(g,-0.55,0),B=at(g,0.5,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(60);
    const fr2=[];for(let i=1;i<=5;i++){const b2=at(g,0.5,-i*0.3);fr2.push([[A[0],A[1],1],[b2[0],b2[1],2]]);}await burst(fr2,8);await sleep(60);const Bo=at(g,0.5,-1.5);
    const fr=[];for(let i=1;i<=5;i++){const a=at(g,-0.55-i*0.34,0);fr.push([[a[0],a[1],1],[Bo[0],Bo[1],2]]);}await burst(fr,8);await sleep(40);
    log('kickflip air',await st());await send('touchEnd',[]);await sleep(800);g=await G();const C=at(g,-0.3,0);await send('touchStart',[[C[0],C[1],3]]);await sleep(900);log('kickflip land',await st());await send('touchEnd',[]);}
  await reset(4);
  // 6b Pop Shove-it：后指侧着划出板边、松手 = 起跳 + 转半圈
  g=await G();{const A=at(g,-0.55,0),B=at(g,0.5,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(60);
    const fr=[];for(let i=1;i<=5;i++){const a=at(g,-0.55,i*0.35);fr.push([[a[0],a[1],1],[B[0],B[1],2]]);}await burst(fr,8);await send('touchEnd',[]);await sleep(150);
    log('shove air',await st());await sleep(650);g=await G();const C=at(g,-0.3,0);await send('touchStart',[[C[0],C[1],3]]);await sleep(900);log('shove land',await st());await send('touchEnd',[]);}
  await reset(4);
  // 6c 前指侧拨以后直接抬起后指（不划）：也起跳 + 翻板
  g=await G();{const A=at(g,-0.55,0),B=at(g,0.5,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(60);
    const fr2=[];for(let i=1;i<=5;i++){const b2=at(g,0.5,-i*0.3);fr2.push([[A[0],A[1],1],[b2[0],b2[1],2]]);}await burst(fr2,8);await send('touchEnd',[]);await sleep(150);
    log('lift air',await st());await sleep(650);g=await G();const C=at(g,-0.3,0);await send('touchStart',[[C[0],C[1],3]]);await sleep(900);log('lift land',await st());await send('touchEnd',[]);}
  await reset(4);
  // 7 起跳后不放回：应该没接住
  g=await G();{const A=at(g,-0.55,0),B=at(g,0.5,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(60);
    const fr=[];for(let i=1;i<=5;i++){const a=at(g,-0.55-i*0.34,0);fr.push([[a[0],a[1],1],[B[0],B[1],2]]);}await burst(fr,8);await send('touchEnd',[]);await sleep(1300);log('no catch',await st());}
  await sleep(1800);await reset(4);
  // 8 Manual：一根手指按住板尾
  g=await G();{const A=at(g,-0.8,0);await send('touchStart',[[A[0],A[1],5]]);await sleep(600);log('manual',{...(await st()),manA:await p.evaluate(()=>+__dbg.sk.manA.toFixed(2))});await send('touchEnd',[]);}
  await reset(5);
  // 9 Powerslide：两指一起往右横甩
  g=await G();{const A=at(g,-0.4,0),B=at(g,0.4,0);await send('touchStart',[[A[0],A[1],1],[B[0],B[1],2]]);await sleep(60);
    const fr=[];for(let i=1;i<=5;i++){const a=at(g,-0.4,i*0.7),b2=at(g,0.4,i*0.7);fr.push([[a[0],a[1],1],[b2[0],b2[1],2]]);}await burst(fr,8);await sleep(200);log('powerslide',await st());await send('touchEnd',[]);await sleep(900);log('after slide',await st());}
  // 先划再松的几种手势必须都能做出来（2026-11-07 第 5 版的核心）
  const need=[['ollie landed',/^Ollie$/],['kickflip land',/Kickflip/],['shove land',/Shove-it/],['lift land',/Kickflip/],['after slide',/Powerslide/]];let bad=0;
  for(const [k,re] of need){const o=R[k]||{};const g=re.test(o.combo||'')&&!/onBail/.test(o.ev||'');console.log((g?'PASS ':'FAIL ')+k+'：'+(o.combo||'无')+' '+(o.ev||''));if(!g)bad++;}
  if(!/onBail:catch/.test((R['no catch']||{}).ev||'')){console.log('FAIL 起跳后不放回应该没接住');bad++;}
  console.log('errors:',errs.length?errs:'none');console.log(bad||errs.length?'有失败':'全部通过');await b.close();process.exit(bad||errs.length?1:0);
})();
