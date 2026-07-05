-- 沐紋映像｜Supabase 初始結構
-- 對應 apps-script 試算表：Bookings, Staff, Services, Settings, AdminUsers, AdminLogs
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行

-- 通用：更新 updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ========== bookings（Bookings 分頁）==========
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_date date not null,
  booking_time text not null,
  staff_name text not null default '不指定',
  service text not null,
  headcount text not null default '1',
  customer_name text not null,
  gender text,
  phone text not null,
  phone_country text default '+886',
  email text,
  note text,
  status text not null default '待確認'
    check (status in ('待確認', '已接受', '已拒絕', '已取消', '已確認', '已結案'))
);

create index if not exists bookings_date_idx on public.bookings (booking_date);
create index if not exists bookings_status_idx on public.bookings (status);

-- ========== staff（Staff 分頁）==========
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  -- 格式同 GAS：1=08:00,10:00;3=09:00（0=日…6=六）
  availability_schedule text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

-- ========== staff_profiles（員工基本資料，僅主控後台可見）==========
create table if not exists public.staff_profiles (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  legal_name text not null default '',
  phone text not null default '',
  email text not null default '',
  birth_date date,
  id_number text not null default '',
  address text not null default '',
  emergency_contact text not null default '',
  emergency_phone text not null default '',
  hired_on date,
  employment_type text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists staff_profiles_updated_at on public.staff_profiles;
create trigger staff_profiles_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- ========== services（Services 分頁）==========
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  name text not null,
  name_en text not null default '',
  options_json jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists services_updated_at on public.services;
create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ========== settings（Settings 分頁：類別|鍵|值|說明）==========
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  key text not null,
  value text not null default '',
  description text not null default '',
  unique (category, key)
);

-- ========== admin_users（AdminUsers 分頁）==========
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  account_name text not null unique,
  password_hash text not null,
  active boolean not null default true,
  role text not null default '副'
    check (role in ('主', '副主', '副')),
  photographer_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

-- ========== admin_logs（AdminLogs 分頁）==========
create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_account text not null default '',
  admin_role text not null default '',
  action text not null,
  summary text not null default '',
  detail text not null default ''
);

create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);

-- ========== 預設設定（對應 CONFIG + DEFAULT_SERVICES）==========
insert into public.settings (category, key, value, description) values
  ('店家', 'shopName', '沐紋映像', '店名'),
  ('店家', 'shopEmail', 'muwenphoto@gmail.com', '店家信箱'),
  ('預約規則', 'openDays', '2,3,4,5,6', '營業日 0=日 6=六'),
  ('預約規則', 'openTime', '10:00', '開始營業'),
  ('預約規則', 'closeTime', '18:00', '結束營業'),
  ('預約規則', 'slotMinutes', '30', '每格分鐘'),
  ('預約規則', 'maxPerSlot', '1', '同一時段最多幾筆'),
  ('預約規則', 'minDaysAhead', '0', '最早可預約幾天後'),
  ('預約規則', 'maxDaysAhead', '60', '最晚可預約幾天後'),
  ('表單選項', 'headcountOptions', '1,2,3,4', '人數選項'),
  ('表單選項', 'genderOptions', '男|Male,女|Female,其他|Other', '性別選項')
on conflict (category, key) do nothing;

insert into public.services (sort_order, name, name_en, options_json) values
  (1, '證件照', 'ID Photo', '[]'::jsonb),
  (2, '形象照', 'Profile Photo', '[{"label":"半身","labelEn":"Half Body"},{"label":"全身","labelEn":"Full Body"}]'::jsonb),
  (3, '全家福', 'Family Photo', '[]'::jsonb),
  (4, '寵物照', 'Pet Photo', '[]'::jsonb),
  (5, '商品照', 'Product Photo', '[]'::jsonb),
  (6, '其他', 'Other', '[]'::jsonb)
on conflict do nothing;

-- 注意：admin_users 主控帳號在第 5 步「後台登入」時建立（需 bcrypt 雜湊）

-- ========== RLS（先全部關閉，第 3 步接 Next.js 後再細調）==========
alter table public.bookings enable row level security;
alter table public.staff enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.services enable row level security;
alter table public.settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_logs enable row level security;

-- 暫時只允許 service_role（後端 API）讀寫；anon 尚無權限
-- 之後會改成：客人只能 insert bookings、管理員透過 API 操作
