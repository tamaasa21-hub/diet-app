-- =====================================================================
-- AI機能（音声・成分表示の読み取り）の使いすぎ防止
-- 1人あたり1日の回数を数える。SQL Editor に貼り付けて Run してください。
-- （schema.sql を実行済みのプロジェクトに追加で実行します。何度実行してもOK）
-- =====================================================================
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  used_on date not null,
  count   int  not null default 0,
  primary key (user_id, used_on)
);

alter table public.ai_usage enable row level security;
grant select on public.ai_usage to authenticated;
revoke all on public.ai_usage from anon;

drop policy if exists "own usage read" on public.ai_usage;
create policy "own usage read" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 1回分を消費する。上限に達していたら -1、そうでなければ残り回数を返す
-- （書き込みはこの関数経由のみ。利用者が自分で回数を減らすことはできない）
create or replace function public.consume_ai_quota(p_limit int)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'Asia/Tokyo')::date;
  c     int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.ai_usage (user_id, used_on, count)
  values (uid, today, 1)
  on conflict (user_id, used_on) do update
    set count = public.ai_usage.count + 1
    where public.ai_usage.count < p_limit
  returning count into c;
  if c is null then
    return -1;
  end if;
  return p_limit - c;
end;
$$;

revoke all on function public.consume_ai_quota(int) from public, anon;
grant execute on function public.consume_ai_quota(int) to authenticated;
