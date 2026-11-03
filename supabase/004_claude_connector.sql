-- =====================================================================
-- Claude 連携（コネクタ）
-- - 各ユーザーが「連携キー」を発行し、Claude のコネクタに URL として登録する
-- - キーそのものは保存せず、ハッシュだけを保存する
-- - Claude からの読み書きは下の関数経由のみ。キーの持ち主のデータにしか触れない
-- SQL Editor に貼り付けて Run してください（何度実行してもOK）。
-- =====================================================================

create table if not exists public.connector_tokens (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.connector_tokens enable row level security;
revoke all on public.connector_tokens from anon, authenticated;
grant select (user_id, created_at, last_used_at) on public.connector_tokens to authenticated;
drop policy if exists "own token read" on public.connector_tokens;
create policy "own token read" on public.connector_tokens
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------- 連携キーの発行・削除（アプリの設定画面から呼ぶ） ----------
create or replace function public.create_connector_token()
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.connector_tokens (user_id, token_hash, created_at, last_used_at)
  values (uid, encode(extensions.digest(tok, 'sha256'), 'hex'), now(), null)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return tok;
end;
$$;

create or replace function public.delete_connector_token()
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.connector_tokens where user_id = auth.uid();
$$;

revoke all on function public.create_connector_token() from public, anon;
revoke all on function public.delete_connector_token() from public, anon;
grant execute on function public.create_connector_token() to authenticated;
grant execute on function public.delete_connector_token() to authenticated;

-- ---------- キー → ユーザーID（内部用） ----------
create or replace function public.mcp_uid(p_token text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare uid uuid;
begin
  if p_token is null or length(p_token) <> 48 then
    raise exception 'invalid token';
  end if;
  update public.connector_tokens
     set last_used_at = now()
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning user_id into uid;
  if uid is null then raise exception 'invalid token'; end if;
  return uid;
end;
$$;
revoke all on function public.mcp_uid(text) from public, anon, authenticated;

-- 1日の合計（内部用）
create or replace function public.mcp_day_totals(p_uid uuid, p_date date)
returns jsonb
language sql stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'kcal',    coalesce(round(sum(kcal)::numeric, 1), 0),
    'protein', coalesce(round(sum(protein)::numeric, 1), 0),
    'fat',     coalesce(round(sum(fat)::numeric, 1), 0),
    'carbs',   coalesce(round(sum(carbs)::numeric, 1), 0))
  from public.meal_entries where user_id = p_uid and eaten_on = p_date;
$$;
revoke all on function public.mcp_day_totals(uuid, date) from public, anon, authenticated;

-- ---------- Claude から呼ぶ関数 ----------

-- その日の状況（目標・合計・残り・記録一覧・体重・目標体重）
create or replace function public.mcp_get_day(p_token text, p_date date)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := public.mcp_uid(p_token);
  prof public.profiles;
  totals jsonb := public.mcp_day_totals(uid, p_date);
begin
  select * into prof from public.profiles where id = uid;
  return jsonb_build_object(
    'date', p_date,
    'targets', jsonb_build_object('kcal', prof.target_kcal, 'protein', prof.target_protein, 'fat', prof.target_fat, 'carbs', prof.target_carbs),
    'totals', totals,
    'remaining', jsonb_build_object(
      'kcal',    prof.target_kcal    - (totals->>'kcal')::numeric,
      'protein', prof.target_protein - (totals->>'protein')::numeric,
      'fat',     prof.target_fat     - (totals->>'fat')::numeric,
      'carbs',   prof.target_carbs   - (totals->>'carbs')::numeric),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'meal_type', meal_type, 'name', name, 'amount', amount,
               'kcal', kcal, 'protein', protein, 'fat', fat, 'carbs', carbs) order by created_at)
      from public.meal_entries where user_id = uid and eaten_on = p_date), '[]'::jsonb),
    'latest_weight', (
      select jsonb_build_object('date', logged_on, 'kg', weight_kg)
      from public.weight_logs where user_id = uid order by logged_on desc limit 1),
    'goal', case when prof.goal_weight_kg is null then null else jsonb_build_object(
      'goal_weight_kg', prof.goal_weight_kg, 'goal_date', prof.goal_date,
      'start_weight_kg', prof.goal_start_weight, 'start_date', prof.goal_start_date) end,
    'diet_style', prof.diet_style,
    'goal_type', prof.goal
  );
end;
$$;

-- 食事をまとめて記録（最大30件）
create or replace function public.mcp_add_entries(p_token text, p_date date, p_entries jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := public.mcp_uid(p_token);
  ids jsonb;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 or jsonb_array_length(p_entries) > 30 then
    raise exception 'entries must be an array of 1-30 items';
  end if;
  with ins as (
    insert into public.meal_entries (user_id, eaten_on, meal_type, name, amount, kcal, protein, fat, carbs)
    select uid, p_date, e->>'meal_type', left(e->>'name', 100), nullif(left(coalesce(e->>'amount', ''), 50), ''),
           greatest(0, coalesce((e->>'kcal')::numeric, 0)),
           greatest(0, coalesce((e->>'protein')::numeric, 0)),
           greatest(0, coalesce((e->>'fat')::numeric, 0)),
           greatest(0, coalesce((e->>'carbs')::numeric, 0))
    from jsonb_array_elements(p_entries) e
    returning id
  )
  select jsonb_agg(id) into ids from ins;
  return jsonb_build_object('inserted_ids', ids) || public.mcp_get_day(p_token, p_date);
end;
$$;

-- 記録を1件削除
create or replace function public.mcp_delete_entry(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := public.mcp_uid(p_token);
  d date;
begin
  delete from public.meal_entries where id = p_id and user_id = uid returning eaten_on into d;
  if d is null then raise exception 'entry not found'; end if;
  return jsonb_build_object('deleted', p_id) || public.mcp_get_day(p_token, d);
end;
$$;

-- 期間の集計（日ごとの合計と体重。最大120日）
create or replace function public.mcp_get_range(p_token text, p_from date, p_to date)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := public.mcp_uid(p_token);
  prof public.profiles;
begin
  if p_to < p_from or p_to - p_from > 120 then
    raise exception 'range must be 0-120 days';
  end if;
  select * into prof from public.profiles where id = uid;
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'targets', jsonb_build_object('kcal', prof.target_kcal, 'protein', prof.target_protein, 'fat', prof.target_fat, 'carbs', prof.target_carbs),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', eaten_on, 'kcal', round(sum_k, 1), 'protein', round(sum_p, 1),
               'fat', round(sum_f, 1), 'carbs', round(sum_c, 1), 'items', n) order by eaten_on)
      from (
        select eaten_on, sum(kcal) sum_k, sum(protein) sum_p, sum(fat) sum_f, sum(carbs) sum_c, count(*) n
        from public.meal_entries where user_id = uid and eaten_on between p_from and p_to
        group by eaten_on) t), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('date', logged_on, 'kg', weight_kg) order by logged_on)
      from public.weight_logs where user_id = uid and logged_on between p_from and p_to), '[]'::jsonb)
  );
end;
$$;

-- 体重を記録（同じ日は上書き）
create or replace function public.mcp_log_weight(p_token text, p_date date, p_weight numeric)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := public.mcp_uid(p_token);
begin
  if p_weight < 20 or p_weight > 300 then raise exception 'weight out of range'; end if;
  insert into public.weight_logs (user_id, logged_on, weight_kg) values (uid, p_date, p_weight)
  on conflict (user_id, logged_on) do update set weight_kg = excluded.weight_kg;
  -- 最新の体重ならプロフィールも更新
  update public.profiles set weight_kg = p_weight
   where id = uid and not exists (select 1 from public.weight_logs where user_id = uid and logged_on > p_date);
  return jsonb_build_object('date', p_date, 'weight_kg', p_weight);
end;
$$;

-- マイ食品の一覧
create or replace function public.mcp_list_foods(p_token text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare uid uuid := public.mcp_uid(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', name, 'unit', unit, 'kcal', kcal, 'protein', protein, 'fat', fat, 'carbs', carbs) order by name)
    from public.foods where user_id = uid), '[]'::jsonb);
end;
$$;

-- マイ食品に登録
create or replace function public.mcp_add_food(p_token text, p_food jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare uid uuid := public.mcp_uid(p_token);
begin
  insert into public.foods (user_id, name, unit, kcal, protein, fat, carbs)
  values (uid, left(p_food->>'name', 100), coalesce(nullif(left(p_food->>'unit', 50), ''), '1食'),
          greatest(0, coalesce((p_food->>'kcal')::numeric, 0)), greatest(0, coalesce((p_food->>'protein')::numeric, 0)),
          greatest(0, coalesce((p_food->>'fat')::numeric, 0)), greatest(0, coalesce((p_food->>'carbs')::numeric, 0)));
  return jsonb_build_object('added', p_food->>'name');
end;
$$;

-- Claude 連携サーバー（ログインなし・連携キーで本人確認）から呼べるようにする
grant execute on function public.mcp_get_day(text, date)               to anon, authenticated;
grant execute on function public.mcp_add_entries(text, date, jsonb)    to anon, authenticated;
grant execute on function public.mcp_delete_entry(text, uuid)          to anon, authenticated;
grant execute on function public.mcp_get_range(text, date, date)       to anon, authenticated;
grant execute on function public.mcp_log_weight(text, date, numeric)   to anon, authenticated;
grant execute on function public.mcp_list_foods(text)                  to anon, authenticated;
grant execute on function public.mcp_add_food(text, jsonb)             to anon, authenticated;
