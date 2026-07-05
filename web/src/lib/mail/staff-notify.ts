import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function getStaffNotifyEmailByName(staffName: string): Promise<string | null> {
  const name = String(staffName || '').trim();
  if (!name || name === '不指定') return null;

  const supabase = createAdminSupabaseClient();
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id')
    .eq('name', name)
    .eq('active', true)
    .maybeSingle();
  if (staffError || !staff) return null;

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('email')
    .eq('staff_id', staff.id)
    .maybeSingle();
  if (profileError) return null;

  const email = String(profile?.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function listActivePhotographerNames(): Promise<string[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('staff')
    .select('name')
    .eq('active', true)
    .neq('name', '不指定')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.name).filter(Boolean);
}

export async function assertActivePhotographerName(name: string): Promise<string> {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === '不指定') {
    throw new Error('請選擇有效的攝影師');
  }
  const names = await listActivePhotographerNames();
  if (!names.includes(trimmed)) {
    throw new Error(`找不到攝影師「${trimmed}」`);
  }
  return trimmed;
}
