-- 器材資產（財務 → 器材管理）
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purchase_date date not null,
  purchase_price integer not null check (purchase_price >= 0),
  market_price integer check (market_price is null or market_price >= 0),
  life_span_months integer not null default 36 check (life_span_months > 0),
  expected_cases_per_month integer not null default 15 check (expected_cases_per_month > 0),
  notes text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists assets_updated_at on public.assets;
create trigger assets_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

alter table public.assets enable row level security;
