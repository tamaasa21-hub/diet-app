-- =====================================================================
-- アカウント削除機能
-- ログイン中の本人だけが、自分のアカウントと全データを削除できる。
-- SQL Editor に貼り付けて Run してください（何度実行してもOK）。
-- =====================================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- auth.users を消すと、食事・体重・マイ食品・自作料理・プロフィールも
  -- 「on delete cascade」で一緒に消える
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
