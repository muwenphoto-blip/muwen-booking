-- 新增「現場服務人員」後台角色（門市端：預約列表、現場登記、查看排班）
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check
  check (role in ('主', '副主', '副', '現場'));
