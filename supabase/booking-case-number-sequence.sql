-- 案號流水：刪除預約後也不重用（請在 Supabase SQL Editor 執行一次）
-- 每位攝影師前綴（AA、XE…）各自累加，只增不減
-- 修復：函式變數不可與欄位同名 prefix，否則會報 column reference "prefix" is ambiguous

create table if not exists public.staff_case_sequences (
  prefix text primary key,
  last_num integer not null default 0 check (last_num >= 0)
);

-- 從現有預約補登已用過的最大流水號
insert into public.staff_case_sequences (prefix, last_num)
select upper(substr(case_number, 1, 2)) as prefix,
       max(substr(case_number, 3)::int) as last_num
from public.bookings
where case_number ~ '^[A-Z]{2}[0-9]{1,5}$'
group by upper(substr(case_number, 1, 2))
on conflict (prefix) do update
set last_num = greatest(public.staff_case_sequences.last_num, excluded.last_num);

-- 從收支紀錄補登（已刪除預約的案號也不重用）
insert into public.staff_case_sequences (prefix, last_num)
select upper(substr(case_number, 1, 2)) as prefix,
       max(substr(case_number, 3)::int) as last_num
from public.transactions
where case_number ~ '^[A-Z]{2}[0-9]{1,5}$'
group by upper(substr(case_number, 1, 2))
on conflict (prefix) do update
set last_num = greatest(public.staff_case_sequences.last_num, excluded.last_num);

create or replace function public.generate_booking_case_number(p_staff_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next_num int;
begin
  perform pg_advisory_xact_lock(9847321);

  if coalesce(btrim(p_staff_name), '') = '' or p_staff_name = '不指定' then
    raise exception '尚未指派攝影師，無法產生案號';
  end if;

  select public.normalize_case_prefix(case_prefix)
  into v_prefix
  from public.staff
  where name = p_staff_name;

  if v_prefix is null or length(v_prefix) <> 2 then
    raise exception '攝影師「%」尚未設定案號前綴，請至團隊管理設定', p_staff_name;
  end if;

  insert into public.staff_case_sequences (prefix, last_num)
  values (v_prefix, 0)
  on conflict (prefix) do nothing;

  update public.staff_case_sequences
  set last_num = staff_case_sequences.last_num + 1
  where staff_case_sequences.prefix = v_prefix
  returning staff_case_sequences.last_num into v_next_num;

  if v_next_num > 99999 then
    raise exception '攝影師「%」案號已滿（%99999）', p_staff_name, v_prefix;
  end if;

  return v_prefix || lpad(v_next_num::text, 5, '0');
end;
$$;

grant execute on function public.generate_booking_case_number(text) to anon, authenticated, service_role;

-- 清除已刪除預約留下的孤兒收支（booking_id 為空、來自預約單同步）
delete from public.transactions
where booking_id is null
  and source = 'document_payment';
