-- =====================================================================
-- 食事記録アプリ データベース定義
-- Supabase の「SQL Editor」にこのファイルの中身をすべて貼り付けて「Run」してください。
-- 何度実行しても壊れないように書いてあります。
-- =====================================================================

-- ---------- 1. プロフィール（身体情報と1日の目標値） ----------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  height_cm      numeric(5,1),
  weight_kg      numeric(5,1),
  age            int,
  sex            text check (sex in ('male', 'female')),
  activity_level text check (activity_level in ('low', 'light', 'moderate', 'high', 'very_high')),
  goal           text check (goal in ('lose', 'maintain', 'gain')),
  diet_style     text not null default 'balanced' check (diet_style in ('balanced', 'low_fat')),
  target_kcal    int,
  target_protein numeric(6,1),
  target_fat     numeric(6,1),
  target_carbs   numeric(6,1),
  onboarded      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- 2. 食事の記録 ----------
create table if not exists public.meal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_on   date not null,
  meal_type  text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name       text not null,
  amount     text,
  kcal       numeric(7,1) not null default 0,
  protein    numeric(6,1) not null default 0,
  fat        numeric(6,1) not null default 0,
  carbs      numeric(6,1) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists meal_entries_user_date on public.meal_entries (user_id, eaten_on);

-- ---------- 3. よく食べる食品（マイ食品） ----------
create table if not exists public.foods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  unit       text not null default '1食',
  kcal       numeric(7,1) not null default 0,
  protein    numeric(6,1) not null default 0,
  fat        numeric(6,1) not null default 0,
  carbs      numeric(6,1) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists foods_user on public.foods (user_id);

-- ---------- 4. 自作料理と材料 ----------
create table if not exists public.recipes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists recipes_user on public.recipes (user_id);

create table if not exists public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  amount     text,
  kcal       numeric(7,1) not null default 0,
  protein    numeric(6,1) not null default 0,
  fat        numeric(6,1) not null default 0,
  carbs      numeric(6,1) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists recipe_ingredients_recipe on public.recipe_ingredients (recipe_id);

-- ---------- 5. 体重の記録（1日1件） ----------
create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_on  date not null,
  weight_kg  numeric(5,1) not null,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

-- =====================================================================
-- Row Level Security（RLS）: 自分のデータだけ読み書きできるようにする
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.meal_entries       enable row level security;
alter table public.foods              enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.weight_logs        enable row level security;

-- profiles は id = ログイン中のユーザーID の行だけ
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- それ以外のテーブルは user_id = ログイン中のユーザーID の行だけ
do $$
declare t text;
begin
  foreach t in array array['meal_entries', 'foods', 'recipes', 'recipe_ingredients', 'weight_logs'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- 材料を追加するときは「自分の料理」にしか追加できないようにする
drop policy if exists "ingredient belongs to own recipe" on public.recipe_ingredients;
create policy "ingredient belongs to own recipe" on public.recipe_ingredients
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = (select auth.uid())
  ));

-- =====================================================================
-- 新規登録されたら空のプロフィール行を自動で作る
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at を自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
