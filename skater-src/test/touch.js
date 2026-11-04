const L=require('./lib');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.goto(L.URL);await p.waitForTimeout(1500);
  await p.evaluate(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_tut','0');});
  await p.tap('#mFree');await p.waitForTimeout(600);await p.evaluate(()=>{window.__noRender=true;});
  if(await p.isVisible('#help'))await p.tap('#hClose');
  await p.waitForTimeout(300);
  const cdp=await ctx.newCDPSession(p);
  const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  const st=()=>p.evaluate(()=>{const s=__dbg.sk;return {mode:s.mode,spd:+s.speed().toFixed(2),hd:+s.heading.toFixed(2),man:!!s.manual,spin:+s.spin.toFixed(2),combo:__dbg.combo.list.map(e=>e.name).join('+'),total:__dbg.combo.total,by:Math.round(__dbg.input.boardY()),fingers:__dbg.input.ptrs.size};});
  const log=(n,o)=>console.log(n.padEnd(14),JSON.stringify(o));
  let s=await st();log('start',s);const by=s.by,cx=195;
  // 1 推板 x3
  for(let k=0;k<3;k++){let B=[cx,by+60,1],F=[cx,by-40,2];await T('touchStart',[B,F]);await sleep(40);
    for(let i=1;i<=10;i++){await T('touchMove',[[cx,by+60-i*15,1],[cx,by-40-i*15,2]]);await sleep(30);} await T('touchEnd',[]);await sleep(120);}
  s=await st();log('after push',s);
  // 2 转弯（两指右移）
  const h0=s.hd;await T('touchStart',[[cx,by+60,1],[cx,by-40,2]]);await sleep(40);
  for(let i=1;i<=6;i++){await T('touchMove',[[cx+i*8,by+60,1],[cx+i*8,by-40,2]]);await sleep(30);} await sleep(500);
  s=await st();log('steer right',{...s,dHeading:+(s.hd-h0).toFixed(2)});await T('touchEnd',[]);await sleep(300);
  // 3 Ollie：后指快速下划，手指不离开
  await T('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(80);
  for(let i=1;i<=4;i++){await T('touchMove',[[cx,by+50+i*22,1],[cx,by-50,2]]);await sleep(12);}
  await sleep(60);s=await st();log('ollie pop',s);
  await sleep(1300);s=await st();log('ollie landed',s);await T('touchEnd',[]);await sleep(1200);
  // 4 Kickflip：后指下划 + 前指左划
  s=await st();if(s.spd<2){for(let k=0;k<2;k++){await T('touchStart',[[cx,by+60,1],[cx,by-40,2]]);await sleep(40);for(let i=1;i<=10;i++){await T('touchMove',[[cx,by+60-i*15,1],[cx,by-40-i*15,2]]);await sleep(30);}await T('touchEnd',[]);await sleep(120);}}
  await T('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(80);
  for(let i=1;i<=4;i++){await T('touchMove',[[cx,by+50+i*22,1],[cx,by-50,2]]);await sleep(12);}
  await sleep(30);
  for(let i=1;i<=4;i++){await T('touchMove',[[cx,by+138,1],[cx-i*24,by-50-i*3,2]]);await sleep(12);}
  await sleep(50);s=await st();log('kickflip air',{...s,flipT:await p.evaluate(()=>+__dbg.sk.flipT.toFixed(2))});
  await sleep(1300);s=await st();log('kickflip land',s);await T('touchEnd',[]);await sleep(1300);
  // 5 不接板：起跳后松开所有手指
  await T('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(80);
  for(let i=1;i<=4;i++){await T('touchMove',[[cx,by+50+i*22,1],[cx,by-50,2]]);await sleep(12);}
  await T('touchEnd',[]);await sleep(1100);s=await st();log('no catch',s);await sleep(1800);
  // 6 Manual：先推一下，再只用后指慢慢下拉
  for(let k=0;k<3;k++){await T('touchStart',[[cx,by+60,1],[cx,by-40,2]]);await sleep(40);for(let i=1;i<=10;i++){await T('touchMove',[[cx,by+60-i*15,1],[cx,by-40-i*15,2]]);await sleep(30);}await T('touchEnd',[]);await sleep(120);}
  await T('touchStart',[[cx,by+40,3]]);await sleep(60);
  for(let i=1;i<=10;i++){await T('touchMove',[[cx,by+40+i*4,3]]);await sleep(40);}
  await sleep(700);s=await st();log('manual',{...s,manA:await p.evaluate(()=>+__dbg.sk.manA.toFixed(2))});
  await p.screenshot({path:'g_manual.png'});
  await T('touchEnd',[]);await sleep(1500);
  // 7 空中转体：起跳后两指绕中点旋转 120°
  for(let k=0;k<2;k++){await T('touchStart',[[cx,by+60,1],[cx,by-40,2]]);await sleep(40);for(let i=1;i<=10;i++){await T('touchMove',[[cx,by+60-i*15,1],[cx,by-40-i*15,2]]);await sleep(30);}await T('touchEnd',[]);await sleep(120);}
  await T('touchStart',[[cx,by+50,1],[cx,by-50,2]]);await sleep(80);
  for(let i=1;i<=4;i++){await T('touchMove',[[cx,by+50+i*22,1],[cx,by-50,2]]);await sleep(12);}
  const mx=cx,my=by+44,R=94;
  for(let i=1;i<=8;i++){const a=Math.PI/2+i*(Math.PI*2/3)/8;await T('touchMove',[[mx-Math.cos(a)*R,my+Math.sin(a)*R*0.5+R*0.5,1],[mx+Math.cos(a)*R,my-Math.sin(a)*R*0.5-R*0.5+R,2]]);await sleep(20);}
  await sleep(40);s=await st();log('twist spin',s);
  await sleep(1200);s=await st();log('twist land',s);await T('touchEnd',[]);
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
