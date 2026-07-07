-- 選片備註、交片完成標記（單一客人連結，不需 download_slug）
-- 於 Supabase SQL Editor 貼上執行一次

alter table public.delivery_photos
  add column if not exists selection_note text not null default '';

alter table public.photo_deliveries
  add column if not exists completed_at timestamptz;
