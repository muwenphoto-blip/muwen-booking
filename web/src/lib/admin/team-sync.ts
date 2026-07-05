import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole } from '@/lib/admin/session';

type AdminSupabase = SupabaseClient;

export function validatePersonName(name: string, label = '姓名') {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2) throw new Error(`請輸入${label}`);
  if (trimmed === '不指定') throw new Error('「不指定」為系統保留名稱');
  return trimmed;
}

export function validateAccountName(name: string) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2) throw new Error('登入帳號至少 2 字');
  return trimmed;
}

export async function assertAccountNameAvailable(
  supabase: AdminSupabase,
  accountName: string,
  excludeUserId?: string,
) {
  let query = supabase.from('admin_users').select('id').eq('account_name', accountName);
  if (excludeUserId) query = query.neq('id', excludeUserId);
  const { data } = await query.maybeSingle();
  if (data) throw new Error(`登入帳號「${accountName}」已被使用`);
}

export async function assertPhotographerLinkAvailable(
  supabase: AdminSupabase,
  photographerName: string,
  excludeUserId?: string,
) {
  if (!photographerName) return;
  let query = supabase.from('admin_users').select('id').eq('photographer_name', photographerName);
  if (excludeUserId) query = query.neq('id', excludeUserId);
  const { data } = await query.maybeSingle();
  if (data) throw new Error(`「${photographerName}」已有其他登入帳號`);
}

export async function ensureStaffMember(supabase: AdminSupabase, name: string) {
  const trimmed = validatePersonName(name);
  const { data: existing } = await supabase.from('staff').select('id, active').eq('name', trimmed).maybeSingle();
  if (existing) {
    if (!existing.active) {
      const { error } = await supabase.from('staff').update({ active: true }).eq('id', existing.id);
      if (error) throw new Error(error.message);
    }
    return;
  }
  const { error } = await supabase.from('staff').insert({
    name: trimmed,
    active: true,
    availability_schedule: '',
  });
  if (error) throw new Error(error.message);
}

export async function syncStaffActiveByPhotographer(
  supabase: AdminSupabase,
  photographerName: string,
  active: boolean,
) {
  const name = String(photographerName || '').trim();
  if (!name) return;
  const { error } = await supabase.from('staff').update({ active }).eq('name', name);
  if (error) throw new Error(error.message);
}

export async function updateBookingsStaffName(
  supabase: AdminSupabase,
  oldName: string,
  newName: string,
) {
  if (!oldName || !newName || oldName === newName) return;
  const { error } = await supabase
    .from('bookings')
    .update({ staff_name: newName })
    .eq('staff_name', oldName)
    .in('status', ['待確認', '已接受', '已確認']);
  if (error) throw new Error(error.message);
}

export async function renamePhotographerName(
  supabase: AdminSupabase,
  oldName: string,
  newName: string,
) {
  const from = validatePersonName(oldName, '原攝影師姓名');
  const to = validatePersonName(newName, '新攝影師姓名');
  if (from === to) return;

  const { data: conflict } = await supabase.from('staff').select('id').eq('name', to).maybeSingle();
  if (conflict) throw new Error(`攝影師「${to}」已存在`);

  const { data: staffRow } = await supabase.from('staff').select('id').eq('name', from).maybeSingle();
  if (!staffRow) throw new Error(`找不到攝影師「${from}」`);

  const { error: staffError } = await supabase.from('staff').update({ name: to }).eq('id', staffRow.id);
  if (staffError) throw new Error(staffError.message);

  const { data: linkedUsers, error: usersError } = await supabase
    .from('admin_users')
    .select('id, account_name, role, photographer_name')
    .eq('photographer_name', from);
  if (usersError) throw new Error(usersError.message);

  for (const user of linkedUsers ?? []) {
    const role = user.role as AdminRole;
    const updates: Record<string, string> = { photographer_name: to };
    if (role === '副' && user.account_name === from) {
      await assertAccountNameAvailable(supabase, to, user.id);
      updates.account_name = to;
    }
    const { error } = await supabase.from('admin_users').update(updates).eq('id', user.id);
    if (error) throw new Error(error.message);
  }

  await updateBookingsStaffName(supabase, from, to);
}

export async function applyPhotographerChange(
  supabase: AdminSupabase,
  params: {
    userId: string;
    oldName: string;
    newName: string;
  },
) {
  const oldName = String(params.oldName || '').trim();
  const newName = validatePersonName(params.newName, '攝影師姓名');
  if (oldName === newName) return;

  const { data: existingStaff } = await supabase.from('staff').select('id').eq('name', newName).maybeSingle();

  if (existingStaff) {
    await assertPhotographerLinkAvailable(supabase, newName, params.userId);
    const { error } = await supabase
      .from('admin_users')
      .update({ photographer_name: newName })
      .eq('id', params.userId);
    if (error) throw new Error(error.message);
    return;
  }

  if (oldName) {
    await renamePhotographerName(supabase, oldName, newName);
    return;
  }

  await ensureStaffMember(supabase, newName);
  await assertPhotographerLinkAvailable(supabase, newName, params.userId);
  const { error } = await supabase
    .from('admin_users')
    .update({ photographer_name: newName })
    .eq('id', params.userId);
  if (error) throw new Error(error.message);
}
