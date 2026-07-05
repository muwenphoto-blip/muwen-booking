-- 排班送審／核定（SQL Editor 貼上執行一次）
-- availability_schedule = 已核定（客人預約用）
-- availability_schedule_draft = 攝影師送審草稿
-- schedule_pending = 是否有待核定排班

alter table public.staff
  add column if not exists availability_schedule_draft text not null default '';

alter table public.staff
  add column if not exists schedule_pending boolean not null default false;
