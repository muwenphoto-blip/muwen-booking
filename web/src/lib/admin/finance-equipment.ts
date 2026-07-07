import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const SETTINGS_CATEGORY = '財務';
const SETTINGS_KEY = 'equipmentDepreciationByMonth';

function parseDepreciationMap(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: Record<string, number> = {};
    Object.entries(parsed || {}).forEach(([month, value]) => {
      const amount = parseInt(String(value ?? '').replace(/,/g, ''), 10);
      if (/^\d{4}-\d{2}$/.test(month) && Number.isFinite(amount) && amount >= 0) {
        map[month] = amount;
      }
    });
    return map;
  } catch {
    return {};
  }
}

export function monthKeyFromIsoDate(isoDate: string): string {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}`;
}

async function readDepreciationMap(): Promise<Record<string, number>> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('category', SETTINGS_CATEGORY)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error && !error.message.includes('settings')) throw new Error(error.message);
  return parseDepreciationMap(String(data?.value || '{}'));
}

async function writeDepreciationMap(map: Record<string, number>) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from('settings').upsert(
    {
      category: SETTINGS_CATEGORY,
      key: SETTINGS_KEY,
      value: JSON.stringify(map),
      description: '每月器材損耗金額（JSON, YYYY-MM）',
    },
    { onConflict: 'category,key' },
  );
  if (error) throw new Error(error.message);
}

export async function loadEquipmentDepreciation(monthKey: string): Promise<number> {
  if (!monthKey) return 0;
  const map = await readDepreciationMap();
  return map[monthKey] || 0;
}

export async function saveEquipmentDepreciation(
  monthKey: string,
  amount: number,
): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('月份格式錯誤');
  const value = parseInt(String(amount), 10);
  if (!Number.isFinite(value) || value < 0) throw new Error('請填寫有效金額');

  const map = await readDepreciationMap();
  if (value === 0) {
    delete map[monthKey];
  } else {
    map[monthKey] = value;
  }
  await writeDepreciationMap(map);
}

export type CashFlowDirection = 'positive' | 'negative' | 'even';

export function resolveCashFlow(netProfit: number, equipmentDepreciation: number) {
  const cashFlow = netProfit - equipmentDepreciation;
  const direction: CashFlowDirection =
    cashFlow > 0 ? 'positive' : cashFlow < 0 ? 'negative' : 'even';
  const label = direction === 'positive' ? '正流水' : direction === 'negative' ? '負流水' : '平';
  return { cashFlow, direction, label };
}
