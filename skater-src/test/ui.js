const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.goto(L.URL);await p.waitForTimeout(1500);await p.evaluate(()=>{window.__noRender=true;});
  const vis=async(ids)=>{const o={};for(const id of ids)o[id]=await p.isVisible('#'+id);return JSON.stringify(o);};
  const P=['menu','pause','settings','help','chal','result','hud'];
  console.log('initial',await vis(P));
  await p.tap('#mHelp');console.log('help open',await vis(P));await p.tap('#hClose');console.log('help closed',await vis(P));
  await p.tap('#mSet');await p.tap('#sEasy');await p.tap('#sQ span[data-v="1"]');await p.tap('#sMus');
  console.log('settings saved',await p.evaluate(()=>localStorage.getItem('fs_settings')));await p.tap('#sClose');
  await p.tap('#mChal');console.log('chal',await vis(P),await p.textContent('#chCount2'),'items',await p.locator('#chList .ch').count());await p.tap('#chClose');
  // 选板
  await p.locator('#decks img').nth(3).tap();console.log('deck stored',await p.evaluate(()=>localStorage.getItem('fs_deck')));
  await p.fill('#inName','小明');await p.fill('#inRoom','abc');
  await p.tap('#mFree');await sleep(400);console.log('playing (first time help shown?)',await vis(P));
  if(await p.isVisible('#help'))await p.tap('#hClose');
  await p.tap('#bPause');console.log('paused',await vis(P));
  await p.tap('#pSet');console.log('settings from pause',await vis(P));await p.tap('#sClose');console.log('back to pause',await vis(P));
  await p.tap('#pResume');console.log('resumed',await vis(P));
  // 挑战触发：大跳台
  await p.evaluate(()=>{const sk=__dbg.sk;const I={lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0};sk.reset(18,-17,0);sk.s=6.6;for(let i=0;i<240*2.2;i++)sk.step(1/240,I);});
  await sleep(300);
  console.log('gap challenge',await p.evaluate(()=>JSON.parse(localStorage.getItem('fs_chal')||'[]')),'toast:',await p.textContent('#toast'));
  // 限时赛结束
  await p.tap('#bPause');await p.tap('#pMenu');console.log('menu again',await vis(P));
  await p.tap('#mTimed');await sleep(300);if(await p.isVisible('#help'))await p.tap('#hClose');
  console.log('timer visible',await p.isVisible('#timer'),await p.textContent('#timer'));
  await p.evaluate(()=>{__dbg.combo.add('Kickflip',800);});
  await p.evaluate(()=>{window.__forceEnd=true;});
  // 把剩余时间改成 0.2 秒
  await p.evaluate(()=>{for(let i=0;i<5;i++);});
  await p.evaluate(()=>{const s=document.getElementById('timer');});
  await p.evaluate(()=>{__dbg.__setTime && __dbg.__setTime(0.2);});
  await sleep(1500);
  console.log('result',await vis(P),'score',await p.textContent('#rScore'),'best',await p.evaluate(()=>localStorage.getItem('fs_best')),await p.textContent('#rBest'));
  await p.tap('#rMenu');console.log('back to menu',await vis(P));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
