-- 手動加入攝影師（把名字改成你 GAS 試算表 Staff 分頁裡的名字）
-- Supabase → SQL Editor 貼上執行

insert into public.staff (name, active, availability_schedule)
values
  ('鴨鴨', true, '')
on conflict (name) do update
set active = excluded.active;

-- availability_schedule 留空 = 全部時段可接（和 GAS 一样）
