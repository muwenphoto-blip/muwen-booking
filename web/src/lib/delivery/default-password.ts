import { hashPassword } from '@/lib/admin/password';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function getDeliveryDefaultPasswordPlain(): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('category', '交片')
    .eq('key', 'defaultPassword')
    .maybeSingle();

  const fromDb = String(data?.value || '').trim();
  if (fromDb) return fromDb;

  const fromEnv = String(process.env.DELIVERY_DEFAULT_PASSWORD || '').trim();
  if (fromEnv) return fromEnv;

  return 'muwen2026';
}

export async function hashDeliveryDefaultPassword(): Promise<string> {
  return hashPassword(await getDeliveryDefaultPasswordPlain());
}
