-- =====================================================================
-- 目標体重機能：プロフィールに「目標体重・目標日・スタート時の体重と日付」を追加
-- SQL Editor に貼り付けて Run してください（何度実行してもOK）。
-- =====================================================================
alter table public.profiles add column if not exists goal_weight_kg    numeric(5,1);
alter table public.profiles add column if not exists goal_date         date;
alter table public.profiles add column if not exists goal_start_weight numeric(5,1);
alter table public.profiles add column if not exists goal_start_date   date;
