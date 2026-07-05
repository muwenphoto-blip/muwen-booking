-- 新增「已結案」狀態（SQL Editor 貼上執行一次）

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('待確認', '已接受', '已拒絕', '已取消', '已確認', '已結案'));

-- 已結案不佔時段（與已取消、已拒絕相同）
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
