const {chromium}=(()=>{try{return require('/home/claude/.npm-global/lib/node_modules/playwright');}catch(e){return require('playwright');}})();
// WebRtcHideLocalIpsWithMdns 关掉：测试里几个页面在同一台机器上直连，用真实的本机地址
exports.launch=()=>chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle','--autoplay-policy=no-user-gesture-required','--disable-features=WebRtcHideLocalIpsWithMdns']});
exports.URL='file://'+require('path').resolve(__dirname,'../out/skate.html');

// 国内联机函数的模拟（规则和 games-cn.sql 一样）
function makeGame(log){
  const G={players:new Map(),members:new Map(),sigs:[],sigId:0,states:new Map(),seq:0};
  const now=()=>Date.now(),K=(r,p)=>r+'|'+p;
  const auth=(id,sec)=>{if(typeof id!=='string'||!/^[a-z0-9]{8,24}$/.test(id)||typeof sec!=='string'||sec.length<16||sec.length>64)return false;if(!G.players.has(id))G.players.set(id,sec);return G.players.get(id)===sec;};
  const mem=(r,p)=>G.members.get(K(r,p));
  const members=(r)=>[...G.members.values()].filter(m=>m.room===r&&now()-m.last<20000).sort((a,b)=>a.player<b.player?-1:1).map(m=>({id:m.player,n:m.name,ws:m.ws,pl:m.playing}));
  const take=(id)=>{const out=[],keep=[];for(const s of G.sigs){if(s.to===id){if(now()-s.t<60000)out.push({id:s.id,f:s.from,p:s.p});}else keep.push(s);}G.sigs=keep;return out;};
  const states=(r,id,since)=>{const a=[];let mx=since;for(const st of G.states.values()){if(st.room!==r||st.player===id||st.seq<=since)continue;const m=mem(r,st.player);if(!m||now()-m.last>30000)continue;a.push({f:st.player,p:st.payload,seq:st.seq});mx=Math.max(mx,st.seq);}a.sort((x,y)=>x.seq-y.seq);return {a:a.map(x=>({f:x.f,p:x.p})),mx};};
  return {G,
    game_beat(b){if(!auth(b.p_id,b.p_secret))return{ok:false,reason:'auth'};const r=b.p_room;
      for(const [k,m] of G.members)if(m.player===b.p_id&&m.room!==r)G.members.delete(k);
      if(!mem(r,b.p_id)&&[...G.members.values()].filter(m=>m.room===r&&now()-m.last<20000).length>=6)return{ok:false,reason:'full'};
      G.members.set(K(r,b.p_id),{room:r,player:b.p_id,name:String(b.p_name||'').slice(0,12),ws:!!b.p_ws,playing:!!b.p_playing,last:now()});
      return{ok:true,members:members(r),sigs:take(b.p_id)};},
    async game_poll(b){if(!auth(b.p_id,b.p_secret))return{ok:false,reason:'auth'};if(!mem(b.p_room,b.p_id))return{ok:false,reason:'member'};
      if(log.hang&&log.hang.has(b.p_id)){log.hung=(log.hung||0)+1;return 'hang';}
      const end=now()+Math.min(Math.max(b.p_wait_ms|0,0),1800);let since=Number(b.p_since)||0;
      for(;;){const sg=take(b.p_id);let st={a:[],mx:since};if(b.p_states)st=states(b.p_room,b.p_id,since);
        if(sg.length||st.a.length||now()>=end)return{ok:true,sigs:sg,states:st.a,seq:st.mx};
        await new Promise(r=>setTimeout(r,30));}},
    game_signal(b){if(!auth(b.p_id,b.p_secret))return false;if(!b.p_payload||JSON.stringify(b.p_payload).length>16000)return false;
      const me=mem(b.p_room,b.p_id);if(!me||now()-me.last>60000)return false;
      const push=(to)=>{G.sigs.push({id:++G.sigId,room:b.p_room,to,from:b.p_id,p:b.p_payload,t:now()});};
      if(b.p_to==null){for(const m of G.members.values())if(m.room===b.p_room&&m.player!==b.p_id&&now()-m.last<30000)push(m.player);}
      else{const t=mem(b.p_room,b.p_to);if(!t||now()-t.last>60000)return false;push(b.p_to);}
      log.sigN=(log.sigN||0)+1;return true;},
    game_put_state(b){if(!auth(b.p_id,b.p_secret))return false;if(!mem(b.p_room,b.p_id))return false;const k=K(b.p_room,b.p_id),old=G.states.get(k);
      if(old&&now()-old.upd<100)return true;G.states.set(k,{room:b.p_room,player:b.p_id,seq:++G.seq,payload:b.p_payload,upd:now()});log.putN=(log.putN||0)+1;return true;},
    game_leave(b){if(!auth(b.p_id,b.p_secret))return false;G.members.delete(K(b.p_room,b.p_id));G.states.delete(K(b.p_room,b.p_id));return true;},
  };
}

// 模拟 Supabase：实时通道（WebSocket）+ HTTP 广播 + 数据库接口（排行榜、保活、国内联机）
// opts.noGame：模拟还没运行国内联机 SQL（这些函数返回 404）
exports.mock=async(ctx,log,opts)=>{
  opts=opts||{};
  // 老测试的坐标都是按「公园」写的：没指定时默认公园（新版第一次打开默认小院）

  const socks=[];log=log||{joins:[],bcast:0,rest:[],perSec:{}};log.rest=log.rest||[];log.ev=log.ev||{};log.hev=log.hev||{};log.rpc=log.rpc||{};
  const deliver=(topic,payload,from)=>{for(const x of socks)if(x!==from&&x.topic===topic)x.ws.send(JSON.stringify({topic,event:'broadcast',payload,ref:null}));};
  await ctx.routeWebSocket(/realtime\/v1\/websocket/,ws=>{
    const me={ws,topic:null,url:ws.url()};socks.push(me);
    ws.onMessage(m=>{const o=JSON.parse(m);
      if(o.event==='phx_join'){me.topic=o.topic;log.joins.push({url:me.url,payload:o.payload,topic:o.topic});ws.send(JSON.stringify({topic:o.topic,event:'phx_reply',payload:{status:'ok',response:{}},ref:o.ref,join_ref:o.join_ref}));}
      else if(o.event==='heartbeat')ws.send(JSON.stringify({topic:'phoenix',event:'phx_reply',payload:{status:'ok',response:{}},ref:o.ref}));
      else if(o.event==='broadcast'){log.bcast++;const ev=o.payload&&o.payload.event;log.ev[ev]=(log.ev[ev]||0)+1;const s=Math.floor(Date.now()/1000);log.perSec[s]=(log.perSec[s]||0)+1;deliver(o.topic,o.payload,me);}});
    ws.onClose(()=>{const i=socks.indexOf(me);if(i>=0)socks.splice(i,1);});});
  // HTTP 广播：POST /realtime/v1/api/broadcast {messages:[{topic,event,payload,private}]}，送给连着实时通道的人
  await ctx.route(/realtime\/v1\/api\/broadcast/,route=>{const r=route.request();let b={};try{b=JSON.parse(r.postData()||'{}');}catch(e){}
    for(const m of b.messages||[]){log.hev[m.event]=(log.hev[m.event]||0)+1;deliver('realtime:'+m.topic,{type:'broadcast',event:m.event,payload:m.payload},null);}
    route.fulfill({status:202,contentType:'application/json',body:'{}'}).catch(()=>{});});
  log.scores=log.scores||[];
  const game=makeGame(log);log.game=game;
  await ctx.route(/supabase\.co\/rest\/v1\//,async route=>{const r=route.request();const url=r.url();log.rest.push({url,method:r.method(),headers:r.headers(),body:r.postData()});
    const fn=(url.match(/rpc\/([a-z_]+)/)||[])[1];if(fn)log.rpc[fn]=(log.rpc[fn]||0)+1;
    const ok=(x)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)}).catch(()=>{});
    if(/skate_submit/.test(url)){const b=JSON.parse(r.postData()||'{}');const prev=log.scores.filter(x=>x.p_map===b.p_map&&x.p_name===b.p_name).reduce((m,x)=>Math.max(m,x.p_score),-1);log.scores.push(b);const others={};for(const x of log.scores)if(x.p_map===b.p_map&&x.p_name!==b.p_name)others[x.p_name]=Math.max(others[x.p_name]||0,x.p_score);const bests=Object.values(others),best=Math.max(prev,b.p_score);const rank=bests.filter(v=>v>b.p_score).length+1,best_rank=bests.filter(v=>v>best).length+1;return ok({ok:true,rank,best,best_rank,pb:prev<0||b.p_score>prev});}
    if(/skate_top/.test(url)){const b=JSON.parse(r.postData()||'{}');const best={};for(const x of log.scores)if(x.p_map===b.p_map)best[x.p_name]=Math.max(best[x.p_name]||0,x.p_score);const arr=Object.entries(best).map(([n,s])=>({n,s})).sort((a,c)=>c.s-a.s);return ok(arr);}
    if(fn&&fn.startsWith('game_')){
      if(opts.noGame)return route.fulfill({status:404,contentType:'application/json',body:'{"code":"PGRST202"}'}).catch(()=>{});
      let b={};try{b=JSON.parse(r.postData()||'{}');}catch(e){}
      const res=await game[fn](b);if(res==='hang')return; // 模拟请求卡住：永远不回
      return ok(res);}
    ok({ok:true});});
  return {socks,log};
};
exports.errs=(p,arr,tag)=>{p.on('pageerror',e=>arr.push((tag||'')+'PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')arr.push((tag||'')+m.type()+': '+m.text());});};
