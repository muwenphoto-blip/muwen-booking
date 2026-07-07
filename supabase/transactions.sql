-- 財務交易（收支紀錄）
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  case_number text not null default '',
  transaction_date date not null,
  type text not null check (type in ('income', 'expense', 'refund')),
  category text not null default '',
  amount integer not null check (amount >= 0),
  payment_method text not null default '',
  receiver text not null default '',
  note text not null default '',
  source text not null default 'manual',
  source_ref text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists transactions_booking_source_uidx
  on public.transactions (booking_id, source, source_ref)
  where booking_id is not null;

create index if not exists transactions_date_idx on public.transactions (transaction_date desc);
create index if not exists transactions_type_idx on public.transactions (type);
create index if not exists transactions_booking_idx on public.transactions (booking_id);

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;
