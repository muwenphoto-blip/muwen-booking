-- 修正：線上預約（anon）插入時，案號 trigger 需能讀取 staff.case_prefix
-- 若已執行過 booking-case-number.sql，請在 SQL Editor 再執行本檔一次

create or replace function public.generate_booking_case_number(p_staff_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
  last_num int;
  next_num int;
begin
  perform pg_advisory_xact_lock(9847321);

  if coalesce(btrim(p_staff_name), '') = '' or p_staff_name = '不指定' then
    raise exception '尚未指派攝影師，無法產生案號';
  end if;

  select public.normalize_case_prefix(case_prefix)
  into prefix
  from public.staff
  where name = p_staff_name;

  if prefix is null or length(prefix) <> 2 then
    raise exception '攝影師「%」尚未設定案號前綴，請至團隊管理設定', p_staff_name;
  end if;

  select coalesce(max(substr(case_number, 3)::int), 0)
  into last_num
  from public.bookings
  where case_number ~ ('^' || prefix || '[0-9]{1,5}$');

  next_num := last_num + 1;
  if next_num > 99999 then
    raise exception '攝影師「%」案號已滿（%99999）', p_staff_name, prefix;
  end if;

  return prefix || lpad(next_num::text, 5, '0');
end;
$$;

grant execute on function public.generate_booking_case_number(text) to anon, authenticated, service_role;
