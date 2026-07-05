-- 第 3 步測試用：允許前端讀取公開設定（店名、營業規則、服務項目）
-- 在 Supabase → SQL Editor 貼上執行（只需一次）

create policy "Public read settings"
  on public.settings for select
  to anon, authenticated
  using (true);

create policy "Public read services"
  on public.services for select
  to anon, authenticated
  using (active = true);
