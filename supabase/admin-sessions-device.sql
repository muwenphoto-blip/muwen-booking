-- 若已執行過 admin-sessions.sql，再執行此檔加入裝置與登入位置欄位

alter table public.admin_sessions
  add column if not exists device_label text not null default '',
  add column if not exists user_agent text not null default '',
  add column if not exists client_ip text not null default '',
  add column if not exists location_label text not null default '';
