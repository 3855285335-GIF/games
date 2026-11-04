const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const M=await L.mock(ctx);const errs=[];
  const mk=async(name)=>{const p=await ctx.newPage();L.errs(p,errs,name+': ');
    await p.addInitScript(()=>{localStorage.setItem('fs_helpSeen','true');localStorage.setItem('fs_tut','9');localStorage.setItem('fs_settings',JSON.stringify({q:0,easy:false,music:false,sfx:false,dots:true}));});
    await p.goto(L.URL);await p.waitForTimeout(1000);await p.evaluate(()=>{window.__noRender=true;});
    await p.fill('#inName',name);await p.fill('#inRoom','测试房');await p.tap('#mFree');await p.waitForTimeout(300);return p;};
  const A=await mk('Alice'),B=await mk('Bob');
  await sleep(2500);
  const j=M.log.joins[0];
  console.log('join url ok:',/apikey=sb_publishable_2FQ9q01lGWiDntr7VUrzcQ_SkgIo8uf/.test(j.url)&&/vsn=1\.0\.0/.test(j.url),'| topic:',j.topic,'| access_token=key:',j.payload.access_token==='sb_publishable_2FQ9q01lGWiDntr7VUrzcQ_SkgIo8uf','| cfg:',JSON.stringify(j.payload.config));
  const r=M.log.rest[0];console.log('keepalive:',r&&r.method,r&&r.url,'apikey hdr:',r&&!!r.headers.apikey,'auth hdr:',r&&r.headers.authorization&&r.headers.authorization.slice(0,20));
  console.log('A sees',await A.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)),'B sees',await B.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)));
  // A 往前滑，B 观察远程位置是否平滑
  await A.evaluate(()=>{__dbg.sk.s=5;});
  const before=M.log.bcast;const t0=Date.now();
  const samples=[];for(let i=0;i<40;i++){samples.push(await B.evaluate(()=>{const r=[...__dbg.remotes.values()][0];return r?[r.board.root.position.z,performance.now()]:null;}));await sleep(50);}
  const el=(Date.now()-t0)/1000;
  const zs=samples.filter(Boolean);let maxJump=0,back=0;for(let i=1;i<zs.length;i++){const d=zs[i][0]-zs[i-1][0];maxJump=Math.max(maxJump,Math.abs(d));if(d<-0.02)back++;}
  const az=await A.evaluate(()=>__dbg.sk.p.z);
  console.log('remote z first/last',zs[0][0].toFixed(2),zs[zs.length-1][0].toFixed(2),'| A real z',az.toFixed(2),'| max step per 50ms',maxJump.toFixed(3),'| backward steps',back);
  console.log('2 players: broadcasts/s =',((M.log.bcast-before)/el).toFixed(1),'(sent by both, before fan-out)');
  // 第三个人加入
  const C=await mk('Cara');await sleep(2500);
  await B.evaluate(()=>{__dbg.sk.s=5;});await C.evaluate(()=>{__dbg.sk.s=5;});await A.evaluate(()=>{__dbg.sk.s=5;});
  const b2=M.log.bcast,t1=Date.now();await sleep(3000);const el2=(Date.now()-t1)/1000;
  console.log('3 players moving: broadcasts/s =',((M.log.bcast-b2)/el2).toFixed(1),'=> delivered/s ≈',(((M.log.bcast-b2)/el2)*3).toFixed(0),'(limit 100)');
  console.log('C sees',await C.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name+':'+r.R.interval.toFixed(0)+'ms')));
  // 静止时降频
  await A.evaluate(()=>{__dbg.sk.s=0;});await B.evaluate(()=>{__dbg.sk.s=0;});await C.evaluate(()=>{__dbg.sk.s=0;});await sleep(1500);
  const b3=M.log.bcast,t2=Date.now();await sleep(4000);console.log('3 players idle: broadcasts/s =',((M.log.bcast-b3)/((Date.now()-t2)/1000)).toFixed(2));
  // 离开
  await A.close({runBeforeUnload:true});await sleep(800);
  console.log('after Alice left, B sees',await B.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)));
  // 断线重连
  const joinsBefore=M.log.joins.length;
  for(const s of M.socks.slice())if(s.topic&&s.url)try{s.ws.close();}catch(e){}
  await sleep(5000);
  console.log('rejoins after server drop:',M.log.joins.length-joinsBefore,'| B net:',await B.evaluate(()=>document.getElementById('net').textContent),'| B sees',await B.evaluate(()=>[...__dbg.remotes.values()].map(r=>r.R.name)));
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
