import type { SupabaseClient } from '@supabase/supabase-js';

type AdminSupabase = SupabaseClient;

const CATEGORY = '安全';
const FAILS_KEY = 'loginFails';
const LOCK_MINUTES = 15;
const MAX_FAILS = 5;

type FailRecord = {
  count: number;
  lockedUntil?: string;
};

type FailStore = Record<string, FailRecord>;

async function loadFailStore(supabase: AdminSupabase): Promise<FailStore> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('category', CATEGORY)
    .eq('key', FAILS_KEY)
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
      key: FAILS_KEY,
      value: JSON.stringify(store),
      description: '登入失敗次數',
    },
    { onConflict: 'category,key' },
  );
  if (error) throw new Error(error.message);
}

export async function assertLoginAllowed(supabase: AdminSupabase, account: string) {
  const key = String(account || '').trim().toLowerCase();
  if (!key) return;
  const store = await loadFailStore(supabase);
  const record = store[key];
  if (!record?.lockedUntil) return;
  if (new Date(record.lockedUntil).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(record.lockedUntil).getTime() - Date.now()) / 60000);
    throw new Error(`登入失敗次數過多，請 ${mins} 分鐘後再試`);
  }
  delete store[key];
  await saveFailStore(supabase, store);
}

export async function recordLoginFailure(supabase: AdminSupabase, account: string) {
  const key = String(account || '').trim().toLowerCase();
  if (!key) return;
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

export async function clearLoginFailures(supabase: AdminSupabase, account: string) {
  const key = String(account || '').trim().toLowerCase();
  if (!key) return;
  const store = await loadFailStore(supabase);
  if (!store[key]) return;
  delete store[key];
  await saveFailStore(supabase, store);
}

export const RECOVERY_KEY_SETTING = 'recoveryKeyHash';

export async function getRecoveryKeyHash(supabase: AdminSupabase): Promise<string | null> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('category', CATEGORY)
    .eq('key', RECOVERY_KEY_SETTING)
    .maybeSingle();
  return data?.value || null;
}

export async function setRecoveryKeyHash(supabase: AdminSupabase, hash: string) {
  const { error } = await supabase.from('settings').upsert(
    {
      category: CATEGORY,
      key: RECOVERY_KEY_SETTING,
      value: hash,
      description: '主控復原金鑰雜湊',
    },
    { onConflict: 'category,key' },
  );
  if (error) throw new Error(error.message);
}
