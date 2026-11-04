-- ============================================================
-- 游戏总项目（games）· 一次性设置（只在新建的 games 项目里运行，不要在 chatter 里运行）
-- 以后所有游戏共用这个项目：保活是通用的，各游戏的表和函数用自己的前缀（滑板是 skate_）
-- 用法：SQL Editor → New query → 整段粘贴 → Run（可重复执行）
-- 包含两部分：
--   1. 保活签到：keepalive()，GitHub 每天调用一次，游戏打开时也会调用
--   2. 指尖滑板 · 限时赛排行榜：skate_submit() 提交成绩、skate_top() 读取排行
-- 安全：网页端不能直接读写这些表，只能调用这几个函数
-- ============================================================

-- ---------- 1. 保活签到 ----------
create table if not exists public.keepalive_state (
  id        integer primary key default 1 check (id = 1),
  last_ping timestamptz not null default now(),
  pings     bigint not null default 0
);
insert into public.keepalive_state (id) values (1) on conflict (id) do nothing;
alter table public.keepalive_state enable row level security;
revoke all on table public.keepalive_state from anon, authenticated;

create or replace function public.keepalive()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_pings bigint;
begin
  update public.keepalive_state set last_ping = now(), pings = pings + 1 where id = 1
  returning last_ping, pings into v_last, v_pings;
  return jsonb_build_object('ok', true, 'last_ping', v_last, 'pings', v_pings);
end $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- ---------- 2. 限时赛排行榜 ----------
create table if not exists public.skate_scores (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 12),
  score      integer not null check (score between 0 and 500000),
  map        text not null default 'park' check (map ~ '^[a-z0-9_]{1,16}$'),
  created_at timestamptz not null default now()
);
create index if not exists skate_scores_map_score on public.skate_scores (map, score desc);
create index if not exists skate_scores_name_time on public.skate_scores (name, created_at desc);

alter table public.skate_scores enable row level security;
revoke all on table public.skate_scores from anon, authenticated;

create or replace function public.skate_submit(p_name text, p_score integer, p_map text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 12);
  v_prev integer;
  v_best integer;
  v_rank integer;
  v_best_rank integer;
begin
  if v_name = '' then v_name := '滑手'; end if;
  if p_score is null or p_score < 0 or p_score > 500000 or p_map is null or p_map !~ '^[a-z0-9_]{1,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.skate_scores s where s.name = v_name and s.created_at > now() - interval '10 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  select max(s.score) into v_prev from public.skate_scores s where s.map = p_map and s.name = v_name;
  insert into public.skate_scores (name, score, map) values (v_name, p_score, p_map);
  v_best := greatest(coalesce(v_prev, 0), p_score);
  -- 名次 = 其他名字里最好成绩比你高的人数 + 1（同分并列）
  select count(*) filter (where t.best > p_score) + 1,
         count(*) filter (where t.best > v_best) + 1
    into v_rank, v_best_rank
    from (select s.name, max(s.score) as best from public.skate_scores s
           where s.map = p_map and s.name <> v_name group by s.name) t;
  return jsonb_build_object('ok', true, 'rank', v_rank, 'best', v_best, 'best_rank', v_best_rank,
                            'pb', v_prev is null or p_score > v_prev);
end $$;

create or replace function public.skate_top(p_map text, p_limit integer default 20)
returns table (n text, s integer) language sql stable security definer set search_path = public as $$
  -- 每个名字取最好成绩；同分时先打出这个分数的人排前面
  select b.name, b.score
    from (select distinct on (sc.name) sc.name, sc.score, sc.created_at
            from public.skate_scores sc
           where sc.map = p_map
           order by sc.name, sc.score desc, sc.created_at) b
   order by b.score desc, b.created_at
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.skate_submit(text, integer, text) from public;
revoke all on function public.skate_top(text, integer) from public;
grant execute on function public.skate_submit(text, integer, text) to anon, authenticated;
grant execute on function public.skate_top(text, integer) to anon, authenticated;

-- 让接口立刻认出新函数
notify pgrst, 'reload schema';

-- 完成 ✅
