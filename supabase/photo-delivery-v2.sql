-- 選片備註、雙連結（選片／下載）、交片完成標記
-- 於 Supabase SQL Editor 貼上執行一次

alter table public.delivery_photos
  add column if not exists selection_note text not null default '';

alter table public.photo_deliveries
  add column if not exists download_slug text,
  add column if not exists completed_at timestamptz;

create unique index if not exists photo_deliveries_download_slug_idx
  on public.photo_deliveries (download_slug)
  where download_slug is not null;

-- 既有案件補上下載連結代碼（與 url_slug 分開）
update public.photo_deliveries
set download_slug = replace(gen_random_uuid()::text, '-', '')
where download_slug is null or download_slug = '';
