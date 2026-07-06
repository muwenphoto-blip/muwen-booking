-- 後台登入 session 追蹤（SQL Editor 貼上執行一次）

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users (id) on delete cascade,
  account_name text not null default '',
  role text not null default '',
  photographer_name text not null default '',
  device_label text not null default '',
  user_agent text not null default '',
  client_ip text not null default '',
  location_label text not null default '',
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.admin_sessions
  add column if not exists device_label text not null default '',
  add column if not exists user_agent text not null default '',
  add column if not exists client_ip text not null default '',
  add column if not exists location_label text not null default '';

create index if not exists admin_sessions_last_seen_idx on public.admin_sessions (last_seen desc);
create index if not exists admin_sessions_user_id_idx on public.admin_sessions (user_id);

alter table public.admin_sessions enable row level security;
