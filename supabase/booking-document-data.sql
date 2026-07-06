-- 儲存案號文件的完整編輯狀態（項目表／合約／估價單）
-- 在 Supabase SQL Editor 貼上執行一次
alter table public.bookings
  add column if not exists document_data jsonb;

comment on column public.bookings.document_data is '案號文件編輯狀態（項目表／合約／估價單）';
