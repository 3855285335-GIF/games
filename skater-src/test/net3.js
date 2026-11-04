const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const M=await L.mock(ctx);const errs=[];
  const mk=async(name,map)=>{const p=await ctx.newPage();L.errs(p,errs,name+': ');
    await p.addInitScript((m)=>{localStorage.setItem('fs_pracDone','true');localStorage.setItem('fs_map',JSON.stringify(m));localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true,time:'day'}));},map||'park');
    await p.goto(L.URL);await p.waitForTimeout(1200);await p.evaluate(()=>{window.__noRender=true;});
    await p.fill('#inName',name);await p.fill('#inRoom','测试房');await p.evaluate(()=>document.getElementById('inRoom').dispatchEvent(new Event('change')));return p;};
  const A=await mk('Alice'),B=await mk('Bob');
  await A.tap('#mFree');await sleep(400);
  await sleep(2500);
  console.log('B in menu sees:',await B.textContent('#roomInfo'));
  const j=M.log.joins.map(x=>x.topic);console.log('topics:',[...new Set(j)].join(' | '));
  const C=await mk('Cara');await B.tap('#mFree');await C.tap('#mFree');await sleep(2500);
  console.log('A sees',await A.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)),'| C sees',await C.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)));
  // 表情
  await A.tap('#bEmo');await A.locator('#emobar span').nth(1).tap();await sleep(500);
  console.log('emoji on B:',await B.evaluate(()=>[...document.querySelectorAll('.emo')].map(e=>e.textContent)));
  // 不同地图不应该互相看见
  const D=await mk('Dan','roof');await D.tap('#mFree');await sleep(2000);
  console.log('Dan(roof) sees',await D.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)),'| A still sees',await A.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)));
  await D.close();
  // S.K.A.T.E.：A 发起，B、C 加入
  await A.evaluate(()=>__dbg.sk8.host());await sleep(800);
  console.log('B invite visible:',await B.isVisible('#inv'),await B.textContent('#invT'));
  await B.tap('#invYes');await C.tap('#invYes');await sleep(800);
  console.log('A lobby:',await A.textContent('#lobbyS'));
  await A.tap('#lobbyGo');await sleep(800);
  const view=async(p)=>p.evaluate(()=>{const v=__dbg.sk8.view();return v.kind==='game'?{msg:v.msg,rows:v.rows.map(r=>r.name+':'+r.letters+(r.turn?'*':'')).join(' '),mine:v.mine}:v;});
  console.log('A view',JSON.stringify(await view(A)));console.log('B view',JSON.stringify(await view(B)));
  // 模拟回合：谁轮到谁做（出招者落地 Kickflip，第一个照做的人失败，第二个成功）
  const pages={Alice:A,Bob:B,Cara:C};
  const turnOf=async()=>{for(const [n,p] of Object.entries(pages)){const t=await p.evaluate(()=>__dbg.sk8.myTurn());if(t)return [n,t];}return null;};
  for(let round=0;round<14;round++){
    const t=await turnOf();if(!t){break;}
    const [n,kind]=t;const p=pages[n];
    const st=await p.evaluate(()=>__dbg.sk8.state&&{trick:__dbg.sk8.state.trick,phase:__dbg.sk8.state.phase});
    let action;
    if(kind==='set'){action=round%5===4?'bail':'Kickflip';}
    else action=(round%3===0)?'Heelflip':st.trick; // 有时做错
    await p.evaluate((a)=>{a==='bail'?__dbg.sk8.attempt(null,true):__dbg.sk8.attempt(a,false);},action);
    await sleep(700);
    const s=await A.evaluate(()=>{const S=__dbg.sk8.state;return S&&{phase:S.phase,letters:Object.entries(S.letters).map(([id,l])=>S.names[id]+':'+l).join(' '),last:S.last,winner:S.winner&&S.names[S.winner]};});
    console.log('r'+round,n,kind,action,'=>',JSON.stringify(s));
    if(s&&s.phase==='over')break;
  }
  console.log('B final view',JSON.stringify(await view(B)));
  // 排行榜：A 限时赛结束提交成绩
  await A.evaluate(()=>{__dbg.toMenu();});await sleep(300);await A.tap('#mTimed');await sleep(300);
  await A.evaluate(()=>{__dbg.combo.add('Kickflip',1234);__dbg.combo.bank();__dbg.__setTime(0.1);});await sleep(1500);
  console.log('result rank:',await A.textContent('#rRank'));
  await A.tap('#rLb');await sleep(1200);console.log('leaderboard:',await A.textContent('#lbList'),'|',await A.textContent('#lbNote'));
  const sub=M.log.rest.filter(r=>/skate_/.test(r.url)).map(r=>r.url.split('/').pop()+' '+r.body);console.log('rpc calls:',sub.join(' || '));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
