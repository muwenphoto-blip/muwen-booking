-- 交片／選片模組（SQL Editor 貼上執行一次）

-- ========== 資料表 ==========
create table if not exists public.photo_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  url_slug text not null unique,
  password_hash text not null,
  password_changed boolean not null default false,
  phase text not null default 'selecting'
    check (phase in ('selecting', 'delivering', 'expired')),
  selection_locked_at timestamptz,
  selection_reopened boolean not null default false,
  finals_started_at timestamptz,
  final_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photo_deliveries_booking_idx on public.photo_deliveries (booking_id);
create index if not exists photo_deliveries_slug_idx on public.photo_deliveries (url_slug);
create index if not exists photo_deliveries_expires_idx on public.photo_deliveries (final_expires_at);

drop trigger if exists photo_deliveries_updated_at on public.photo_deliveries;
create trigger photo_deliveries_updated_at
  before update on public.photo_deliveries
  for each row execute function public.set_updated_at();

create table if not exists public.delivery_photos (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.photo_deliveries (id) on delete cascade,
  kind text not null check (kind in ('preview', 'final')),
  storage_path text not null,
  file_name text not null default '',
  selection text not null default 'pending'
    check (selection in ('pending', 'keep', 'reject')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists delivery_photos_delivery_idx on public.delivery_photos (delivery_id, kind);

-- 預設訪客密碼（僅 service_role 可讀，上線後請至後台修改）
insert into public.settings (category, key, value, description)
values ('交片', 'defaultPassword', 'muwen2026', '交片頁預設密碼（首次登入須修改）')
on conflict (category, key) do nothing;

-- ========== Storage bucket（私人，僅透過 API 簽名網址存取）==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-deliveries',
  'photo-deliveries',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
