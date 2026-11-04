const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await L.mock(ctx);const errs=[];
  const mk=async(name)=>{const p=await ctx.newPage();L.errs(p,errs,name+': ');
    await p.addInitScript(()=>{localStorage.setItem('fs_pracDone','true');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true,time:'day'}));});
    await p.goto(L.URL);await p.waitForTimeout(1000);await p.evaluate(()=>{window.__noRender=true;});
    await p.fill('#inName',name);await p.fill('#inRoom','end');await p.tap('#mFree');await sleep(300);return p;};
  const A=await mk('Alice'),B=await mk('Bob'),C=await mk('Cara');await sleep(2500);
  const game=async()=>{await A.evaluate(()=>__dbg.sk8.host());await sleep(700);await B.tap('#invYes');await C.tap('#invYes');await sleep(700);await A.tap('#lobbyGo');await sleep(700);};
  await game();
  const S=()=>A.evaluate(()=>{const S=__dbg.sk8.state;return S&&{phase:S.phase,letters:Object.entries(S.letters).map(([id,l])=>S.names[id]+':'+l).join(' '),setter:S.names[S.setter],copier:S.copier&&S.names[S.copier],winner:S.winner&&S.names[S.winner]};});
  console.log('start',JSON.stringify(await S()));
  // 让除了出招者之外的人一直做错，直到结束
  const pages={Alice:A,Bob:B,Cara:C};
  for(let i=0;i<40;i++){
    let s=await S();if(!s||s.phase==='over')break;
    if(s.phase==='set'){await pages[s.setter].evaluate(()=>__dbg.sk8.attempt('Kickflip',false));}
    else{await pages[s.copier].evaluate(()=>__dbg.sk8.attempt('Ollie',false));}
    await sleep(350);
  }
  const fin=await S();console.log('final',JSON.stringify(fin));
  for(const [n,p] of Object.entries(pages))console.log(n,'sees:',await p.evaluate(()=>{const v=__dbg.sk8.view();return v.msg;}),'| skatewin chal:',await p.evaluate(()=>JSON.parse(localStorage.getItem('fs_chal')||'[]').includes('skatewin')));
  // 关闭面板后，再来一局，然后 Cara 中途离开
  for(const p of [A,B,C])await p.evaluate(()=>{__dbg.sk8.state=null;__dbg.sk8.ui();});
  await game();console.log('game2',JSON.stringify(await S()));
  await C.close({runBeforeUnload:true});await sleep(1500);
  console.log('after Cara left',JSON.stringify(await S()));
  // 房主离开：Bob 应该在 12 秒后收到中断
  await A.close({runBeforeUnload:true});
  await sleep(13500);
  console.log('Bob after host left:',JSON.stringify(await B.evaluate(()=>__dbg.sk8.view())),'| toast:',await B.textContent('#toast'));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
