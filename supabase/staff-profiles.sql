-- 員工基本資料（僅主控可透過後台 API 讀寫，不對外開放）
-- Supabase Dashboard → SQL Editor 貼上執行一次

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

alter table public.staff_profiles enable row level security;

-- 不建立 anon 政策；僅 service_role（後端 API）可存取
