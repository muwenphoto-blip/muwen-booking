import type { SupabaseClient } from '@supabase/supabase-js';

type AdminSupabase = SupabaseClient;

const CATEGORY = '安全';
const RECOVERY_FAILS_KEY = 'recoveryFails';
const MAX_FAILS = 5;
const LOCK_MINUTES = 30;

type FailRecord = {
  count: number;
  lockedUntil?: string;
};

type FailStore = Record<string, FailRecord>;

function clientKey(ip: string): string {
  return String(ip || 'unknown').trim().toLowerCase() || 'unknown';
}

async function loadFailStore(supabase: AdminSupabase): Promise<FailStore> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('category', CATEGORY)
    .eq('key', RECOVERY_FAILS_KEY)
    .maybeSingle();
  if (!data?.value) return {};
  try {
    return JSON.parse(data.value) as FailStore;
  } catch {
    return {};
  }
}

async function saveFailStore(supabase: AdminSupabase, store: FailStore) {
  const { error } = await supabase.from('settings').upsert(
    {
      category: CATEGORY,
      key: RECOVERY_FAILS_KEY,
      value: JSON.stringify(store),
      description: '復原金鑰嘗試次數',
    },
    { onConflict: 'category,key' },
  );
  if (error) throw new Error(error.message);
}

export async function assertRecoveryAllowed(supabase: AdminSupabase, ip: string) {
  const key = clientKey(ip);
  const store = await loadFailStore(supabase);
  const record = store[key];
  if (!record?.lockedUntil) return;
  if (new Date(record.lockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(record.lockedUntil).getTime() - Date.now()) / 60000);
    throw new Error(`復原金鑰嘗試次數過多，請 ${mins} 分鐘後再試`);
  }
  delete store[key];
  await saveFailStore(supabase, store);
}

export async function recordRecoveryFailure(supabase: AdminSupabase, ip: string) {
  const key = clientKey(ip);
  const store = await loadFailStore(supabase);
  const prev = store[key]?.count ?? 0;
  const count = prev + 1;
  if (count >= MAX_FAILS) {
    store[key] = {
      count,
      lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString(),
    };
  } else {
    store[key] = { count };
  }
  await saveFailStore(supabase, store);
}

export async function clearRecoveryFailures(supabase: AdminSupabase, ip: string) {
  const key = clientKey(ip);
  const store = await loadFailStore(supabase);
  if (!store[key]) return;
  delete store[key];
  await saveFailStore(supabase, store);
}
