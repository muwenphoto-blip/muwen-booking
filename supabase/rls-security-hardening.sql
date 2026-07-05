-- 多層安全加固（SQL Editor 貼上執行一次）
-- 執行前請已跑過 schema.sql 與 rls-booking-api.sql

-- ========== 1. staff：anon 只能讀公開 view，不可讀草稿欄位 ==========
create or replace view public.staff_public as
  select name, availability_schedule
  from public.staff
  where active = true;

grant select on public.staff_public to anon, authenticated;

drop policy if exists "Public read active staff" on public.staff;

-- ========== 2. settings：anon 只能讀預約/店家設定，不可讀「安全」類 ==========
drop policy if exists "Public read settings" on public.settings;

create policy "Public read booking settings"
  on public.settings for select
  to anon, authenticated
  using (category in ('店家', '預約規則', '表單選項'));

-- ========== 3. 預約 rate limit（security definer，不暴露 bookings 全表）==========
create or replace function public.count_recent_bookings_by_email(
  p_email text,
  p_since timestamptz
)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint
  from public.bookings
  where lower(trim(coalesce(email, ''))) = lower(trim(coalesce(p_email, '')))
    and email <> ''
    and created_at >= p_since;
$$;

grant execute on function public.count_recent_bookings_by_email(text, timestamptz) to anon, authenticated;

create index if not exists bookings_email_created_at_idx
  on public.bookings (lower(email), created_at desc);

-- ========== 4. 主控帳號唯一（防 bootstrap 競態建立兩個主控）==========
create unique index if not exists admin_users_single_master_idx
  on public.admin_users (role)
  where role = '主';
