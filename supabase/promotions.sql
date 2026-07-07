-- 優惠活動（系統設定 → 優惠活動）
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  rule_type text not null check (rule_type in ('per_extra', 'group_free', 'fixed')),
  rule_config jsonb not null default '{}'::jsonb,
  targets jsonb not null default '[]'::jsonb,
  starts_at date,
  ends_at date,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists promotions_updated_at on public.promotions;
create trigger promotions_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;
