-- 預約案號（SQL Editor 貼上執行一次）
-- 每位攝影師在 staff.case_prefix 設定 2 碼英文前綴（如 XE、DJ）
-- 案號格式：2 碼英文前綴 + 5 位流水號，例如 XE00001、XE00002 … XE99999（每位攝影師獨立編號）

alter table public.bookings
  add column if not exists case_number text;

alter table public.staff
  add column if not exists case_prefix text;

create unique index if not exists bookings_case_number_idx
  on public.bookings (case_number)
  where case_number is not null;

create unique index if not exists staff_case_prefix_idx
  on public.staff (case_prefix)
  where case_prefix is not null and btrim(case_prefix) <> '';

alter table public.bookings
  alter column case_number drop not null;

create or replace function public.normalize_case_prefix(raw text)
returns text
language sql
immutable
as $$
  select upper(substr(regexp_replace(coalesce(raw, ''), '[^A-Za-z]', '', 'g'), 1, 2));
$$;

create or replace function public.generate_booking_case_number(p_staff_name text)
returns text
language plpgsql
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

create or replace function public.bookings_set_case_number()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.case_number is null or btrim(new.case_number) = '' then
      if coalesce(new.staff_name, '') <> '不指定' then
        new.case_number := public.generate_booking_case_number(new.staff_name);
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (new.case_number is null or btrim(new.case_number) = '')
       and coalesce(new.staff_name, '') <> '不指定'
       and (old.staff_name is distinct from new.staff_name or old.case_number is null) then
      new.case_number := public.generate_booking_case_number(new.staff_name);
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_case_number on public.bookings;
drop trigger if exists bookings_case_number_insert on public.bookings;
drop trigger if exists bookings_case_number_update on public.bookings;

create trigger bookings_case_number_insert
  before insert on public.bookings
  for each row execute function public.bookings_set_case_number();

create trigger bookings_case_number_update
  before update of staff_name on public.bookings
  for each row execute function public.bookings_set_case_number();

-- 既有預約補案號（依建立時間、每位攝影師各自從 00001 開始）
do $$
declare
  row_id uuid;
begin
  for row_id in
    select id
    from public.bookings
    where case_number is null
      and coalesce(staff_name, '') <> '不指定'
    order by created_at asc, id asc
  loop
    update public.bookings
    set case_number = public.generate_booking_case_number(staff_name)
    where id = row_id;
  end loop;
end $$;

-- 舊版 2～4 碼數字案號統一為 5 位（AA01 → AA00001）
update public.bookings
set case_number = substr(case_number, 1, 2) || lpad(substr(case_number, 3)::text, 5, '0')
where case_number ~ '^[A-Z]{2}[0-9]{1,5}$'
  and char_length(case_number) < 7;
