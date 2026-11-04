const L=require('./lib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await L.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5,hasTouch:true,isMobile:true});await L.mock(ctx);
  const p=await ctx.newPage();const errs=[];L.errs(p,errs);
  await p.addInitScript(()=>{localStorage.setItem('fs_settings',JSON.stringify({q:1,easy:false,music:false,sfx:false,dots:true,time:'auto'}));});
  await p.goto(L.URL);await p.waitForTimeout(1500);
  // 练习模式：手指示范
  await p.tap('#mPrac');await sleep(300);await p.evaluate(()=>{__dbg.practice.next();});await sleep(2600);await p.screenshot({path:'v3s_practice.png'});
  // 夜晚 + 磨杆火花
  await p.evaluate(()=>{__dbg.practice.stop();__dbg.settings.time='night';__dbg.applyTime();const sk=__dbg.sk;sk.reset(-22.5,-40,0);sk.s=4.5;
    const I={lean:0,push:0,brake:0,manual:0,twist:0,spinRate:0,fingers:2,caught:true,fb:0};sk.__step=sk.step.bind(sk);for(let i=0;i<Math.round(0.42*240);i++)sk.__step(1/240,I);sk.pop('tail',0.7);for(let i=0;i<240*0.62;i++)sk.__step(1/240,I);
    sk.step=()=>{};});
  await sleep(2200);await p.screenshot({path:'v3s_night_grind.png'});
  await p.evaluate(()=>{__dbg.settings.time='auto';__dbg.applyTime();});
  // S.K.A.T.E. 面板 + 表情（假数据）
  await p.evaluate(()=>{const sk8=__dbg.sk8;sk8.state={gid:'x',host:'zz',order:['me1','b','c'],names:{me1:'我',b:'阿杰',c:'小美'},letters:{me1:1,b:3,c:0},setter:'c',phase:'copy',trick:'Kickflip',copier:'me1',queue:['b'],n:5,until:Date.now()+30000,winner:null,last:'小美 出了 Kickflip'};sk8.h.myId=()=>'me1';sk8.ui();
    const sk=__dbg.sk;sk.step=sk.__step;sk.reset(-6,-14,0);sk.s=3;__dbg.fx.emoji('🔥','me');__dbg.fx.trick('Kickflip  +110','#7dff9b');});
  await sleep(900);await p.screenshot({path:'v3s_sk8.png'});
  console.log('errors:',errs.length?errs:'none');await b.close();
})();
