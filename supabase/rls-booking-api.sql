-- 第 4 步：預約 API 所需權限（SQL Editor 貼上執行一次）

-- 前端可讀 active 攝影師（排班用）
create policy "Public read active staff"
  on public.staff for select
  to anon, authenticated
  using (active = true);

-- 前端可讀設定與 active 服務（預約頁載入用）
create policy "Public read settings"
  on public.settings for select
  to anon, authenticated
  using (true);

create policy "Public read active services"
  on public.services for select
  to anon, authenticated
  using (active = true);

-- 客人可新增預約
create policy "Public insert bookings"
  on public.bookings for insert
  to anon, authenticated
  with check (true);

-- 只回傳各時段已預約數量，不暴露客人資料
create or replace function public.get_booking_slot_counts(p_date date)
returns table (booking_time text, booking_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select booking_time, count(*)::bigint
  from public.bookings
  where booking_date = p_date
    and status in ('待確認', '已接受', '已確認')
  group by booking_time;
$$;

grant execute on function public.get_booking_slot_counts(date) to anon, authenticated;
