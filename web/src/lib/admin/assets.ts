import { BOOKING_STATUS_CLOSED, BOOKING_STATUS_CONFIRMED, BOOKING_STATUS_ACCEPTED } from '@/lib/admin/bookings';
import { monthKeyFromIsoDate, saveEquipmentDepreciation } from '@/lib/admin/finance-equipment';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export type AdminAssetRow = {
  id: string;
  name: string;
  purchaseDate: string;
  purchasePrice: number;
  marketPrice: number | null;
  lifeSpanMonths: number;
  expectedCasesPerMonth: number;
  notes: string;
  active: boolean;
  sortOrder: number;
};

export type AssetDepreciationMetrics = {
  casesThisMonth: number;
  utilizationRate: number;
  monthlyDepreciation: number;
  currentDepreciatedValue: number;
  estimatedValue: number;
  wearPercent: number;
};

export type AdminAssetWithMetrics = AdminAssetRow & {
  metrics: AssetDepreciationMetrics;
};

const ACTIVE_CASE_STATUSES = [BOOKING_STATUS_ACCEPTED, BOOKING_STATUS_CONFIRMED, BOOKING_STATUS_CLOSED];

function mapAssetRow(row: {
  id: string;
  name: string;
  purchase_date: string;
  purchase_price: number;
  market_price: number | null;
  life_span_months: number;
  expected_cases_per_month: number;
  notes: string;
  active: boolean;
  sort_order: number;
}): AdminAssetRow {
  return {
    id: row.id,
    name: row.name,
    purchaseDate: row.purchase_date,
    purchasePrice: Number(row.purchase_price) || 0,
    marketPrice: row.market_price == null ? null : Number(row.market_price),
    lifeSpanMonths: Number(row.life_span_months) || 36,
    expectedCasesPerMonth: Number(row.expected_cases_per_month) || 15,
    notes: row.notes || '',
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };
}

function parseIsoDate(value: string): Date {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function monthsBetween(fromIso: string, toDate: Date): number {
  const from = parseIsoDate(fromIso);
  const months =
    (toDate.getFullYear() - from.getFullYear()) * 12 + (toDate.getMonth() - from.getMonth());
  const dayAdjust = toDate.getDate() < from.getDate() ? -1 : 0;
  return Math.max(0, months + dayAdjust);
}

function monthRange(monthKey: string): { from: string; to: string } | null {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const from = `${match[1]}-${match[2]}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export function calculateAssetDepreciation(
  asset: AdminAssetRow,
  casesThisMonth: number,
  referenceDate = new Date(),
): AssetDepreciationMetrics {
  const purchasePrice = Math.max(0, asset.purchasePrice);
  const lifespan = Math.max(1, asset.lifeSpanMonths);
  const expectedCases = Math.max(1, asset.expectedCasesPerMonth);
  const utilization = casesThisMonth / expectedCases;
  const monthsOwned = monthsBetween(asset.purchaseDate, referenceDate);
  const wearRatio = Math.min(1, (monthsOwned / lifespan) * utilization);
  const currentDepreciatedValue = Math.max(0, Math.round(purchasePrice * (1 - wearRatio)));
  const monthlyDepreciation = Math.round((purchasePrice / lifespan) * utilization);
  const estimatedValue =
    asset.marketPrice != null
      ? Math.min(currentDepreciatedValue, Math.max(0, asset.marketPrice))
      : currentDepreciatedValue;

  return {
    casesThisMonth,
    utilizationRate: Math.round(utilization * 1000) / 10,
    monthlyDepreciation,
    currentDepreciatedValue,
    estimatedValue,
    wearPercent: Math.round(wearRatio * 1000) / 10,
  };
}

export type AssetOption = {
  id: string;
  name: string;
};

export async function loadActiveAssetOptions(): Promise<AssetOption[]> {
  const assets = await loadAdminAssets();
  return assets.filter((asset) => asset.active).map((asset) => ({ id: asset.id, name: asset.name }));
}

export async function loadAssetUsageForMonth(monthKey: string): Promise<{
  counts: Map<string, number>;
  anyTagged: boolean;
  globalCases: number;
}> {
  const range = monthRange(monthKey);
  const counts = new Map<string, number>();
  if (!range) {
    return { counts, anyTagged: false, globalCases: 0 };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, document_data')
    .gte('booking_date', range.from)
    .lte('booking_date', range.to)
    .in('status', ACTIVE_CASE_STATUSES);
  if (error) throw new Error(error.message);

  let anyTagged = false;
  for (const row of data ?? []) {
    const document = row.document_data as { usedAssetIds?: string[] } | null;
    const ids = Array.isArray(document?.usedAssetIds)
      ? document.usedAssetIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!ids.length) continue;
    anyTagged = true;
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  }

  const globalCases = await countCasesForMonth(monthKey);
  return { counts, anyTagged, globalCases };
}

export async function countCasesForMonth(monthKey: string): Promise<number> {
  const range = monthRange(monthKey);
  if (!range) return 0;

  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .gte('booking_date', range.from)
    .lte('booking_date', range.to)
    .in('status', ACTIVE_CASE_STATUSES);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function loadAdminAssets(): Promise<AdminAssetRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('assets')
    .select(
      'id, name, purchase_date, purchase_price, market_price, life_span_months, expected_cases_per_month, notes, active, sort_order',
    )
    .order('sort_order')
    .order('name');
  if (error) {
    if (error.message.includes('assets')) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapAssetRow);
}

export async function loadAssetsWithMetrics(monthKey: string): Promise<{
  monthKey: string;
  casesThisMonth: number;
  assets: AdminAssetWithMetrics[];
  totalMonthlyDepreciation: number;
  totalCurrentValue: number;
}> {
  const [assets, usage] = await Promise.all([
    loadAdminAssets(),
    loadAssetUsageForMonth(monthKey),
  ]);

  const range = monthRange(monthKey);
  const referenceDate = range ? parseIsoDate(range.to) : new Date();

  const withMetrics = assets.map((asset) => {
    const casesThisMonth = usage.anyTagged
      ? usage.counts.get(asset.id) || 0
      : usage.globalCases;
    return {
      ...asset,
      metrics: calculateAssetDepreciation(asset, casesThisMonth, referenceDate),
    };
  });

  const activeAssets = withMetrics.filter((asset) => asset.active);
  const totalMonthlyDepreciation = activeAssets.reduce(
    (sum, asset) => sum + asset.metrics.monthlyDepreciation,
    0,
  );
  const totalCurrentValue = withMetrics.reduce(
    (sum, asset) => sum + asset.metrics.estimatedValue,
    0,
  );

  return {
    monthKey,
    casesThisMonth: usage.globalCases,
    assets: withMetrics,
    totalMonthlyDepreciation,
    totalCurrentValue,
  };
}

export async function syncMonthDepreciationFromAssets(monthKey: string): Promise<number> {
  const snapshot = await loadAssetsWithMetrics(monthKey);
  if (!snapshot.assets.length) return 0;
  await saveEquipmentDepreciation(monthKey, snapshot.totalMonthlyDepreciation);
  return snapshot.totalMonthlyDepreciation;
}

async function logAssetChange(
  session: { account: string; role: string },
  action: string,
  summary: string,
) {
  const supabase = createAdminSupabaseClient();
  await supabase.from('admin_logs').insert({
    admin_account: session.account,
    admin_role: session.role,
    action,
    summary,
    detail: '',
  });
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function addAdminAsset(
  session: { account: string; role: string },
  payload: {
    name: string;
    purchaseDate: string;
    purchasePrice: number;
    marketPrice?: number | null;
    lifeSpanMonths?: number;
    expectedCasesPerMonth?: number;
    notes?: string;
  },
) {
  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('器材名稱至少 2 字');
  const purchaseDate = String(payload.purchaseDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new Error('請填寫購入日期');
  const purchasePrice = parseInt(String(payload.purchasePrice), 10);
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error('請填寫購入價格');

  const supabase = createAdminSupabaseClient();
  const { data: maxRow } = await supabase
    .from('assets')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const marketPrice =
    payload.marketPrice == null || payload.marketPrice === undefined
      ? null
      : parseInt(String(payload.marketPrice), 10);

  const { error } = await supabase.from('assets').insert({
    name,
    purchase_date: purchaseDate,
    purchase_price: purchasePrice,
    market_price: Number.isFinite(marketPrice as number) ? marketPrice : null,
    life_span_months: parsePositiveInt(payload.lifeSpanMonths, 36),
    expected_cases_per_month: parsePositiveInt(payload.expectedCasesPerMonth, 15),
    notes: String(payload.notes || '').trim(),
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    active: true,
  });
  if (error) throw new Error(error.message);

  const monthKey = monthKeyFromIsoDate(new Date().toISOString().slice(0, 10));
  await syncMonthDepreciationFromAssets(monthKey);
  await logAssetChange(session, '新增器材', name);
  return { message: `已新增器材「${name}」` };
}

export async function updateAdminAsset(
  session: { account: string; role: string },
  id: string,
  payload: {
    name?: string;
    purchaseDate?: string;
    purchasePrice?: number;
    marketPrice?: number | null;
    lifeSpanMonths?: number;
    expectedCasesPerMonth?: number;
    notes?: string;
    active?: boolean;
  },
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('assets')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此器材');

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (name.length < 2) throw new Error('器材名稱至少 2 字');
    updates.name = name;
  }
  if (payload.purchaseDate !== undefined) {
    const purchaseDate = String(payload.purchaseDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new Error('請填寫購入日期');
    updates.purchase_date = purchaseDate;
  }
  if (payload.purchasePrice !== undefined) {
    const purchasePrice = parseInt(String(payload.purchasePrice), 10);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error('請填寫購入價格');
    updates.purchase_price = purchasePrice;
  }
  if (payload.marketPrice !== undefined) {
    if (payload.marketPrice == null || payload.marketPrice === ('' as unknown)) {
      updates.market_price = null;
    } else {
      const marketPrice = parseInt(String(payload.marketPrice), 10);
      updates.market_price = Number.isFinite(marketPrice) && marketPrice >= 0 ? marketPrice : null;
    }
  }
  if (payload.lifeSpanMonths !== undefined) {
    updates.life_span_months = parsePositiveInt(payload.lifeSpanMonths, 36);
  }
  if (payload.expectedCasesPerMonth !== undefined) {
    updates.expected_cases_per_month = parsePositiveInt(payload.expectedCasesPerMonth, 15);
  }
  if (payload.notes !== undefined) updates.notes = String(payload.notes).trim();
  if (payload.active !== undefined) updates.active = Boolean(payload.active);

  const { error } = await supabase.from('assets').update(updates).eq('id', id);
  if (error) throw new Error(error.message);

  const monthKey = monthKeyFromIsoDate(new Date().toISOString().slice(0, 10));
  await syncMonthDepreciationFromAssets(monthKey);
  await logAssetChange(session, '更新器材', String(payload.name ?? row.name));
  return { message: '器材資料已更新' };
}

export async function deleteAdminAsset(
  session: { account: string; role: string },
  id: string,
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('assets')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此器材');

  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) throw new Error(error.message);

  const monthKey = monthKeyFromIsoDate(new Date().toISOString().slice(0, 10));
  await syncMonthDepreciationFromAssets(monthKey);
  await logAssetChange(session, '刪除器材', row.name);
  return { message: '器材已刪除' };
}
