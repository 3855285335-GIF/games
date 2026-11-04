const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true,time:'auto'}));});
  await p.goto(L.URL);await p.waitForTimeout(1200);await p.evaluate(()=>{window.__noRender=true;});
  const pr=()=>p.evaluate(()=>({step:document.getElementById('pracN').textContent,t:document.getElementById('pracT').textContent,on:__dbg.practice.on,spd:+__dbg.sk.speed().toFixed(2)}));
  await p.tap('#mPrac');await sleep(300);console.log('practice start',JSON.stringify(await pr()));
  // 1 放手指（真触摸，按在板上）
  const cdp=await ctx.newCDPSession(p);
  const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y,id])=>({x,y,id,radiusX:10,radiusY:10,force:1}))});
  const g=await p.evaluate(()=>__dbg.geo);
  await send('touchStart',[[g.cx,g.cy+60,1],[g.cx,g.cy-60,2]]);await sleep(1000);await send('touchEnd',[]);await sleep(200);
  console.log('after place',JSON.stringify(await pr()));
  // 2 推到 11km/h（键盘 W）
  await p.keyboard.down('KeyW');await sleep(1600);await p.keyboard.up('KeyW');await sleep(200);console.log('after push',JSON.stringify(await pr()));
  // 3 转一大圈（W + D）
  await p.keyboard.down('KeyW');await p.keyboard.down('KeyD');await sleep(3200);await p.keyboard.up('KeyD');await p.keyboard.up('KeyW');await sleep(200);console.log('after steer',JSON.stringify(await pr()));
  // 3b Kickturn：停下来按 Z
  await p.evaluate(()=>{__dbg.sk.s=0;});await p.keyboard.down('KeyZ');await sleep(800);await p.keyboard.up('KeyZ');await sleep(400);console.log('after kick',JSON.stringify(await pr()));
  // 4 Ollie / 5 翻板 / 6 转板（键盘，自动接板）
  const resetRun=async()=>{await p.evaluate(()=>{const sk=__dbg.sk;sk.reset(-6,-14,0);sk.s=4;});await sleep(150);};
  await resetRun();await p.keyboard.press('Space');await sleep(1300);console.log('after ollie',JSON.stringify(await pr()));
  await resetRun();await p.keyboard.press('Space');await sleep(60);await p.keyboard.press('KeyJ');await sleep(1300);console.log('after flip',JSON.stringify(await pr()));
  await resetRun();await p.keyboard.press('Space');await sleep(60);await p.keyboard.press('KeyK');await sleep(1300);console.log('after shove',JSON.stringify(await pr()));
  // 7 Manual
  await resetRun();await p.keyboard.down('KeyM');await sleep(2000);await p.keyboard.up('KeyM');await sleep(200);console.log('after manual',JSON.stringify(await pr()));
  // 8 磨杆：已被传送到杆子前，算好时间起跳
  const pos=await p.evaluate(()=>({p:[__dbg.sk.p.x,__dbg.sk.p.z].map(v=>+v.toFixed(1)),s:+__dbg.sk.s.toFixed(1)}));console.log('teleported',JSON.stringify(pos));
  await p.evaluate(()=>new Promise(r=>{const sk=__dbg.sk;const R=__dbg.T.rails.find(x=>x.flat&&x.kind==='rail');const iv=setInterval(()=>{const d=Math.hypot(sk.p.x-R.ax,sk.p.z-R.az);if(d<1.35){clearInterval(iv);sk.pop('tail',0.5);r();}},5);}));
  await sleep(1800);console.log('after grind',JSON.stringify(await pr()),'chal:',await p.evaluate(()=>JSON.parse(localStorage.getItem('fs_chal')||'[]').join(',')));
  // 回放
  await p.tap('#bPause');await p.tap('#pReplay');await sleep(500);
  console.log('replay state',await p.evaluate(()=>__dbg.state),'frames',await p.evaluate(()=>__dbg.rec.buf.length));
  await p.tap('#rpSpd');await p.tap('#rpCam');await p.tap('#rpCam');await sleep(500);
  console.log('replay buttons',await p.textContent('#rpSpd'),await p.textContent('#rpCam'));
  await p.evaluate(()=>{const r=document.getElementById('rpBar');r.value=200;r.dispatchEvent(new Event('input'));});await sleep(300);
  await p.tap('#rpExit');await sleep(300);console.log('after replay exit',await p.evaluate(()=>__dbg.state),await p.isVisible('#pause'));
  // 回到起点 / 复位按钮
  await p.tap('#pResume');await sleep(200);await p.evaluate(()=>{__dbg.sk.reset(10,10,1);});await p.tap('#bReset');await sleep(200);
  // 时间切换
  await p.tap('#bPause');await p.tap('#pSet');await p.tap('#sTime span[data-v="night"]');await sleep(300);console.log('time',await p.evaluate(()=>__dbg.lighting.cur));
  await p.tap('#sTime span[data-v="auto"]');await sleep(300);console.log('time auto',await p.evaluate(()=>__dbg.lighting.cur));
  await p.evaluate(()=>{const r=document.getElementById('sFlick');r.value=5;r.dispatchEvent(new Event('input'));});console.log('settings',await p.evaluate(()=>localStorage.getItem('fs_settings')));
  await p.tap('#sClose');await p.tap('#pMenu');await sleep(300);
  // 改装：锁定状态
  await p.tap('#mGarage');await sleep(300);
  const locks=await p.evaluate(()=>[...document.querySelectorAll('#gGrid .gi')].map(e=>e.querySelector('.lock')?'L':'o').join(''));
  await p.tap('#gTabs span[data-k="wheel"]');await sleep(200);
  const wl=await p.evaluate(()=>[...document.querySelectorAll('#gGrid .gi')].map(e=>e.querySelector('.lock')?'L':'o').join(''));
  await p.locator('#gGrid .gi').nth(3).tap();await sleep(200);
  console.log('garage deck locks',locks,'wheel locks',wl,'board cfg',await p.evaluate(()=>localStorage.getItem('fs_board')));
  await p.tap('#gDone');
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
