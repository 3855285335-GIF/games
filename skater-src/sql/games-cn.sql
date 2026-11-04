-- ============================================================
-- 游戏 · 国内网络联机（只在 games 项目里运行；可以重复执行，不会动排行榜和保活）
-- 为什么要这个：在中国大陆不开 VPN 时，Supabase 的实时通道（WebSocket）连不上，
--   但普通网络请求能用。所以改成用下面这些函数「牵线」，连上以后玩家之间直连传数据：
--   game_beat       心跳：报到自己在哪个房间，返回房间里的人 + 收走发给自己的信号
--   game_poll       长轮询：有新信号 / 中转位置就马上返回，没有就最多等 1.8 秒
--   game_signal     发信号（直连握手、表情、对战消息），只能发给同一个房间里的人
--   game_put_state  直连失败时的中转：写入自己的最新位置
--   game_leave      离开房间
-- 安全：网页端不能直接读写这些表，只能调用这几个函数；
--       不用登录：每个玩家打开游戏时生成一个随机密钥，服务器只存它的哈希，别人冒充不了
-- ============================================================

create table if not exists public.game_players (
  id          text primary key check (id ~ '^[a-z0-9]{8,24}$'),
  secret_hash text not null,
  created_at  timestamptz not null default now()
);
create table if not exists public.game_members (
  room      text not null check (char_length(room) between 1 and 100),
  player    text not null references public.game_players (id) on delete cascade,
  name      text not null default '',
  ws        boolean not null default false,
  playing   boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (room, player)
);
create index if not exists game_members_player on public.game_members (player);
create table if not exists public.game_signals (
  id          bigint generated always as identity primary key,
  room        text not null,
  to_player   text not null,
  from_player text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists game_signals_to on public.game_signals (to_player, id);
create index if not exists game_signals_from on public.game_signals (from_player, created_at);
create index if not exists game_signals_time on public.game_signals (created_at);
create sequence if not exists public.game_state_seq;
create table if not exists public.game_states (
  room       text not null,
  player     text not null,
  seq        bigint not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (room, player)
);
create index if not exists game_states_seq on public.game_states (room, seq);

alter table public.game_players enable row level security;
alter table public.game_members enable row level security;
alter table public.game_signals enable row level security;
alter table public.game_states  enable row level security;
-- 不建任何策略：网页端不能直接读写这些表
revoke all on table public.game_players, public.game_members, public.game_signals, public.game_states from anon, authenticated;
revoke all on sequence public.game_state_seq from anon, authenticated;

-- 身份：第一次用某个 id 时登记密钥哈希，以后必须带同一个密钥
create or replace function public._game_auth(p_id text, p_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if p_id is null or p_id !~ '^[a-z0-9]{8,24}$' or p_secret is null or char_length(p_secret) not between 16 and 64 then
    return false;
  end if;
  h := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  insert into public.game_players (id, secret_hash) values (p_id, h) on conflict (id) do nothing;
  return exists (select 1 from public.game_players where id = p_id and secret_hash = h);
end $$;

-- 房间成员列表（20 秒内报到过的才算在线）
create or replace function public._game_members(p_room text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.player, 'n', m.name, 'ws', m.ws, 'pl', m.playing) order by m.player), '[]'::jsonb)
    from public.game_members m
   where m.room = p_room and m.last_seen > now() - interval '20 seconds';
$$;

-- 收走发给自己的信号：取走即删，只要 1 分钟以内的，按 id 排序
create or replace function public._game_take(p_id text)
returns jsonb language sql volatile security definer set search_path = public as $$
  with d as (delete from public.game_signals s where s.to_player = p_id
             returning s.id, s.from_player, s.payload, s.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'f', d.from_player, 'p', d.payload) order by d.id)
                  filter (where d.created_at > now() - interval '60 seconds'), '[]'::jsonb)
    from d;
$$;

create or replace function public.game_beat(p_id text, p_secret text, p_room text, p_name text, p_ws boolean, p_playing boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public._game_auth(p_id, p_secret) then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if p_room is null or char_length(p_room) not between 1 and 100 then return jsonb_build_object('ok', false, 'reason', 'room'); end if;
  -- 一个人同一时间只在一个房间
  delete from public.game_members where player = p_id and room <> p_room;
  if not exists (select 1 from public.game_members where room = p_room and player = p_id) then
    select count(*) into v_n from public.game_members where room = p_room and last_seen > now() - interval '20 seconds';
    if v_n >= 6 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  end if;
  insert into public.game_members (room, player, name, ws, playing, last_seen)
  values (p_room, p_id, left(coalesce(p_name, ''), 12), coalesce(p_ws, false), coalesce(p_playing, false), now())
  on conflict (room, player) do update
    set name = excluded.name, ws = excluded.ws, playing = excluded.playing, last_seen = now();
  -- 偶尔顺手清理：走了的人、没人取的旧信号、没人用的身份
  if random() < 0.1 then
    delete from public.game_members where last_seen < now() - interval '2 minutes';
    delete from public.game_states s where not exists (select 1 from public.game_members m where m.room = s.room and m.player = s.player);
    delete from public.game_signals where created_at < now() - interval '2 minutes';
    delete from public.game_players p where p.created_at < now() - interval '1 day'
       and not exists (select 1 from public.game_members m where m.player = p.id);
  end if;
  return jsonb_build_object('ok', true, 'members', public._game_members(p_room), 'sigs', public._game_take(p_id));
end $$;

create or replace function public.game_poll(p_id text, p_secret text, p_room text, p_since bigint, p_states boolean, p_wait_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  deadline timestamptz := clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_wait_ms, 0), 0), 1800) / 1000.0);
  v_sigs   jsonb;
  v_states jsonb := '[]'::jsonb;
  v_seq    bigint := coalesce(p_since, 0);
begin
  if not public._game_auth(p_id, p_secret) then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if not exists (select 1 from public.game_members where room = p_room and player = p_id) then
    return jsonb_build_object('ok', false, 'reason', 'member');
  end if;
  loop
    v_sigs := public._game_take(p_id);
    if coalesce(p_states, false) then
      select coalesce(jsonb_agg(jsonb_build_object('f', s.player, 'p', s.payload) order by s.seq), '[]'::jsonb),
             coalesce(max(s.seq), coalesce(p_since, 0))
        into v_states, v_seq
        from public.game_states s
       where s.room = p_room and s.player <> p_id and s.seq > coalesce(p_since, 0)
         and exists (select 1 from public.game_members m where m.room = s.room and m.player = s.player and m.last_seen > now() - interval '30 seconds');
    end if;
    exit when jsonb_array_length(v_sigs) > 0 or jsonb_array_length(v_states) > 0 or clock_timestamp() >= deadline;
    perform pg_sleep(0.1);
  end loop;
  return jsonb_build_object('ok', true, 'sigs', v_sigs, 'states', v_states, 'seq', v_seq);
end $$;

-- p_to 为空 = 发给房间里其他所有人
create or replace function public.game_signal(p_id text, p_secret text, p_room text, p_to text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public._game_auth(p_id, p_secret) then return false; end if;
  if p_payload is null or octet_length(p_payload::text) > 16000 then return false; end if;
  if not exists (select 1 from public.game_members where room = p_room and player = p_id and last_seen > now() - interval '60 seconds') then return false; end if;
  -- 防刷屏：每人 10 秒内最多 300 条
  if (select count(*) from public.game_signals where from_player = p_id and created_at > now() - interval '10 seconds') > 300 then return false; end if;
  if p_to is null then
    insert into public.game_signals (room, to_player, from_player, payload)
    select p_room, m.player, p_id, p_payload from public.game_members m
     where m.room = p_room and m.player <> p_id and m.last_seen > now() - interval '30 seconds';
  else
    if not exists (select 1 from public.game_members where room = p_room and player = p_to and last_seen > now() - interval '60 seconds') then return false; end if;
    insert into public.game_signals (room, to_player, from_player, payload) values (p_room, p_to, p_id, p_payload);
  end if;
  return true;
end $$;

create or replace function public.game_put_state(p_id text, p_secret text, p_room text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public._game_auth(p_id, p_secret) then return false; end if;
  if p_payload is null or octet_length(p_payload::text) > 3000 then return false; end if;
  if not exists (select 1 from public.game_members where room = p_room and player = p_id) then return false; end if;
  insert into public.game_states (room, player, seq, payload, updated_at)
  values (p_room, p_id, nextval('public.game_state_seq'), p_payload, now())
  on conflict (room, player) do update set seq = excluded.seq, payload = excluded.payload, updated_at = now()
   where public.game_states.updated_at < now() - interval '100 milliseconds';
  return true;
end $$;

-- 只离开指定的房间（换房间时，旧房间的“离开”晚到也不会把新房间的报到删掉）
create or replace function public.game_leave(p_id text, p_secret text, p_room text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public._game_auth(p_id, p_secret) then return false; end if;
  delete from public.game_members where player = p_id and room = p_room;
  delete from public.game_states where player = p_id and room = p_room;
  return true;
end $$;

-- 权限：内部函数谁都不能直接调；对外函数给网页端（没登录也能用）
revoke all on function public._game_auth(text, text) from public, anon, authenticated;
revoke all on function public._game_members(text) from public, anon, authenticated;
revoke all on function public._game_take(text) from public, anon, authenticated;
revoke all on function public.game_beat(text, text, text, text, boolean, boolean) from public;
revoke all on function public.game_poll(text, text, text, bigint, boolean, integer) from public;
revoke all on function public.game_signal(text, text, text, text, jsonb) from public;
revoke all on function public.game_put_state(text, text, text, jsonb) from public;
revoke all on function public.game_leave(text, text, text) from public;
grant execute on function public.game_beat(text, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.game_poll(text, text, text, bigint, boolean, integer) to anon, authenticated;
grant execute on function public.game_signal(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.game_put_state(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.game_leave(text, text, text) to anon, authenticated;

-- 让接口立刻认出新函数
notify pgrst, 'reload schema';

-- 完成 ✅
