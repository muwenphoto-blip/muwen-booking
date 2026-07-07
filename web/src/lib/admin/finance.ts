import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import { parseAmount } from '@/components/booking-document-shared';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export type TransactionType = 'income' | 'expense' | 'refund';
export type FinancePeriod = 'week' | 'month' | 'year';

export type FinanceTransactionRow = {
  id: string;
  bookingId: string | null;
  caseNumber: string;
  transactionDate: string;
  type: TransactionType;
  category: string;
  amount: number;
  paymentMethod: string;
  receiver: string;
  note: string;
  source: string;
  sourceRef: string;
  createdBy: string;
  createdAt: string;
};

export type FinanceSummaryBucket = {
  key: string;
  label: string;
  income: number;
  expense: number;
  refund: number;
  netProfit: number;
  discountCost: number;
  transactionCount: number;
};

export type FinanceSummary = {
  period: FinancePeriod;
  rangeLabel: string;
  from: string;
  to: string;
  income: number;
  expense: number;
  refund: number;
  netProfit: number;
  discountCost: number;
  transactionCount: number;
  buckets: FinanceSummaryBucket[];
};

export type FinanceCategoryBreakdown = {
  category: string;
  type: TransactionType;
  amount: number;
  count: number;
};

export type FinanceAccountingMetrics = {
  grossRevenue: number;
  discountCost: number;
  netRevenue: number;
  totalExpense: number;
  totalRefund: number;
  netProfit: number;
  netProfitMargin: number;
  discountRate: number;
  transactionCount: number;
  equipmentDepreciation: number;
  cashFlow: number;
  cashFlowDirection: 'positive' | 'negative' | 'even';
  cashFlowLabel: string;
  monthKey: string;
};

export type FinanceAccountingReport = {
  generatedAt: string;
  period: FinancePeriod;
  rangeLabel: string;
  from: string;
  to: string;
  accounting: FinanceAccountingMetrics;
  categoryBreakdown: FinanceCategoryBreakdown[];
  incomeCategories: FinanceCategoryBreakdown[];
  expenseCategories: FinanceCategoryBreakdown[];
  refundCategories: FinanceCategoryBreakdown[];
  buckets: FinanceSummaryBucket[];
  transactions: FinanceTransactionRow[];
  performance: import('@/lib/admin/finance-performance').FinancePerformanceReport;
};

export const INCOME_CATEGORIES = ['拍攝收款', '訂金', '尾款', '加購', '其他收入'] as const;
export const EXPENSE_CATEGORIES = ['人事', '器材', '器材損耗', '租棚', '行銷', '雜支', '其他支出'] as const;
export const REFUND_CATEGORIES = ['退款', '其他退款'] as const;

function mapTransactionRow(row: {
  id: string;
  booking_id: string | null;
  case_number: string;
  transaction_date: string;
  type: string;
  category: string;
  amount: number;
  payment_method: string;
  receiver: string;
  note: string;
  source: string;
  source_ref: string;
  created_by: string;
  created_at: string;
}): FinanceTransactionRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    caseNumber: row.case_number || '',
    transactionDate: row.transaction_date,
    type: row.type as TransactionType,
    category: row.category || '',
    amount: Number(row.amount) || 0,
    paymentMethod: row.payment_method || '',
    receiver: row.receiver || '',
    note: row.note || '',
    source: row.source || 'manual',
    sourceRef: row.source_ref || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
  };
}

function parseIsoDate(value: string): Date {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31);
}

export function getFinancePeriodRange(period: FinancePeriod, anchor: string) {
  const base = parseIsoDate(anchor);
  if (period === 'week') {
    const from = startOfWeek(base);
    const to = endOfWeek(base);
    return {
      from: formatIsoDate(from),
      to: formatIsoDate(to),
      label: `${from.getFullYear()}年${from.getMonth() + 1}月${from.getDate()}日～${to.getMonth() + 1}月${to.getDate()}日`,
    };
  }
  if (period === 'month') {
    const from = startOfMonth(base);
    const to = endOfMonth(base);
    return {
      from: formatIsoDate(from),
      to: formatIsoDate(to),
      label: `${from.getFullYear()}年${from.getMonth() + 1}月`,
    };
  }
  const from = startOfYear(base);
  const to = endOfYear(base);
  return {
    from: formatIsoDate(from),
    to: formatIsoDate(to),
    label: `${from.getFullYear()}年`,
  };
}

function shiftAnchor(period: FinancePeriod, anchor: string, delta: number): string {
  const date = parseIsoDate(anchor);
  if (period === 'week') {
    date.setDate(date.getDate() + delta * 7);
  } else if (period === 'month') {
    date.setMonth(date.getMonth() + delta);
  } else {
    date.setFullYear(date.getFullYear() + delta);
  }
  return formatIsoDate(date);
}

export function getFinanceNavigation(period: FinancePeriod, anchor: string) {
  const range = getFinancePeriodRange(period, anchor);
  return {
    ...range,
    period,
    anchor,
    prevAnchor: shiftAnchor(period, anchor, -1),
    nextAnchor: shiftAnchor(period, anchor, 1),
  };
}

function sumByType(rows: FinanceTransactionRow[]) {
  let income = 0;
  let expense = 0;
  let refund = 0;
  rows.forEach((row) => {
    if (row.type === 'income') income += row.amount;
    if (row.type === 'expense') expense += row.amount;
    if (row.type === 'refund') refund += row.amount;
  });
  return { income, expense, refund, netProfit: income - expense - refund };
}

function buildBuckets(
  period: FinancePeriod,
  from: string,
  to: string,
  transactions: FinanceTransactionRow[],
  discountByDate: Map<string, number>,
): FinanceSummaryBucket[] {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  if (period === 'week') {
    const buckets: FinanceSummaryBucket[] = [];
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(fromDate);
      day.setDate(fromDate.getDate() + i);
      const key = formatIsoDate(day);
      const dayRows = transactions.filter((row) => row.transactionDate === key);
      const totals = sumByType(dayRows);
      buckets.push({
        key,
        label: `${day.getMonth() + 1}/${day.getDate()}（${labels[i]}）`,
        ...totals,
        discountCost: discountByDate.get(key) || 0,
        transactionCount: dayRows.length,
      });
    }
    return buckets;
  }

  if (period === 'month') {
    const buckets: FinanceSummaryBucket[] = [];
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const key = formatIsoDate(cursor);
      const dayRows = transactions.filter((row) => row.transactionDate === key);
      const totals = sumByType(dayRows);
      buckets.push({
        key,
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        ...totals,
        discountCost: discountByDate.get(key) || 0,
        transactionCount: dayRows.length,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  const buckets: FinanceSummaryBucket[] = [];
  for (let month = 0; month < 12; month += 1) {
    const start = new Date(fromDate.getFullYear(), month, 1);
    const end = new Date(fromDate.getFullYear(), month + 1, 0);
    const key = `${start.getFullYear()}-${String(month + 1).padStart(2, '0')}`;
    const monthRows = transactions.filter((row) => {
      const date = parseIsoDate(row.transactionDate);
      return date >= start && date <= end;
    });
    const totals = sumByType(monthRows);
    let discountCost = 0;
    discountByDate.forEach((value, dateKey) => {
      const date = parseIsoDate(dateKey);
      if (date >= start && date <= end) discountCost += value;
    });
    buckets.push({
      key,
      label: `${month + 1}月`,
      ...totals,
      discountCost,
      transactionCount: monthRows.length,
    });
  }
  return buckets;
}

function sumDocumentDiscount(document: BookingDocumentState): number {
  let total = 0;
  (document.itemRows || []).forEach((row) => {
    total += parseAmount(row.discount);
  });
  return Math.round(total);
}

async function loadDiscountCostByDate(from: string, to: string): Promise<Map<string, number>> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_date, document_data')
    .gte('booking_date', from)
    .lte('booking_date', to);
  if (error) {
    if (error.message.includes('document_data')) return new Map();
    throw new Error(error.message);
  }

  const map = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const document = row.document_data as BookingDocumentState | null;
    if (!document) return;
    const discount = sumDocumentDiscount(document);
    if (discount <= 0) return;
    const key = String(row.booking_date || '');
    map.set(key, (map.get(key) || 0) + discount);
  });
  return map;
}

export async function loadFinanceTransactions(filters?: {
  from?: string;
  to?: string;
  type?: TransactionType;
  limit?: number;
}): Promise<FinanceTransactionRow[]> {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from('transactions')
    .select(
      'id, booking_id, case_number, transaction_date, type, category, amount, payment_method, receiver, note, source, source_ref, created_by, created_at',
    )
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.from) query = query.gte('transaction_date', filters.from);
  if (filters?.to) query = query.lte('transaction_date', filters.to);
  if (filters?.type) query = query.eq('type', filters.type);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) {
    if (error.message.includes('transactions')) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapTransactionRow);
}

export async function loadFinanceSummary(
  period: FinancePeriod,
  anchor: string,
): Promise<FinanceSummary> {
  const range = getFinancePeriodRange(period, anchor);
  const [transactions, discountByDate] = await Promise.all([
    loadFinanceTransactions({ from: range.from, to: range.to }),
    loadDiscountCostByDate(range.from, range.to),
  ]);

  const totals = sumByType(transactions);
  let discountCost = 0;
  discountByDate.forEach((value) => {
    discountCost += value;
  });

  return {
    period,
    rangeLabel: range.label,
    from: range.from,
    to: range.to,
    ...totals,
    discountCost,
    transactionCount: transactions.length,
    buckets: buildBuckets(period, range.from, range.to, transactions, discountByDate),
  };
}

function parseTransactionDate(raw: string): string {
  const text = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split(/[/.-]/).map((part) => part.trim());
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return formatIsoDate(new Date());
}

function parsePositiveAmount(raw: unknown): number {
  const n = parseInt(String(raw ?? '').replace(/,/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error('請填寫有效金額');
  return n;
}

async function logFinanceChange(
  session: { account: string; role: string },
  action: string,
  summary: string,
  detail = '',
) {
  const supabase = createAdminSupabaseClient();
  await supabase.from('admin_logs').insert({
    admin_account: session.account,
    admin_role: session.role,
    action,
    summary,
    detail,
  });
}

export async function createFinanceTransaction(
  session: { account: string; role: string },
  payload: {
    bookingId?: string;
    caseNumber?: string;
    transactionDate: string;
    type: TransactionType;
    category: string;
    amount: number;
    paymentMethod?: string;
    receiver?: string;
    note?: string;
  },
) {
  const amount = parsePositiveAmount(payload.amount);
  const category = String(payload.category || '').trim();
  if (!category) throw new Error('請選擇類別');

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from('transactions').insert({
    booking_id: payload.bookingId || null,
    case_number: String(payload.caseNumber || '').trim(),
    transaction_date: parseTransactionDate(payload.transactionDate),
    type: payload.type,
    category,
    amount,
    payment_method: String(payload.paymentMethod || '').trim(),
    receiver: String(payload.receiver || '').trim(),
    note: String(payload.note || '').trim(),
    source: 'manual',
    source_ref: '',
    created_by: session.account,
  });
  if (error) throw new Error(error.message);

  await logFinanceChange(session, '新增收支', category, String(amount));
  return { message: '已新增收支紀錄' };
}

export async function updateFinanceTransaction(
  session: { account: string; role: string },
  id: string,
  payload: {
    bookingId?: string | null;
    caseNumber?: string;
    transactionDate?: string;
    type?: TransactionType;
    category?: string;
    amount?: number;
    paymentMethod?: string;
    receiver?: string;
    note?: string;
  },
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('transactions')
    .select('id, source')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此筆紀錄');
  if (row.source !== 'manual') throw new Error('系統同步的收款紀錄請至預約單修改');

  const updates: Record<string, unknown> = {};
  if (payload.bookingId !== undefined) updates.booking_id = payload.bookingId || null;
  if (payload.caseNumber !== undefined) updates.case_number = String(payload.caseNumber || '').trim();
  if (payload.transactionDate !== undefined) {
    updates.transaction_date = parseTransactionDate(payload.transactionDate);
  }
  if (payload.type !== undefined) updates.type = payload.type;
  if (payload.category !== undefined) {
    const category = String(payload.category || '').trim();
    if (!category) throw new Error('請選擇類別');
    updates.category = category;
  }
  if (payload.amount !== undefined) updates.amount = parsePositiveAmount(payload.amount);
  if (payload.paymentMethod !== undefined) updates.payment_method = String(payload.paymentMethod || '').trim();
  if (payload.receiver !== undefined) updates.receiver = String(payload.receiver || '').trim();
  if (payload.note !== undefined) updates.note = String(payload.note || '').trim();

  const { error } = await supabase.from('transactions').update(updates).eq('id', id);
  if (error) throw new Error(error.message);

  await logFinanceChange(session, '更新收支', id);
  return { message: '收支紀錄已更新' };
}

export async function deleteFinanceTransaction(
  session: { account: string; role: string },
  id: string,
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('transactions')
    .select('id, source, category, amount')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此筆紀錄');
  if (row.source !== 'manual') throw new Error('系統同步的收款紀錄請至預約單修改');

  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await logFinanceChange(session, '刪除收支', row.category || '', String(row.amount || ''));
  return { message: '收支紀錄已刪除' };
}

export async function syncTransactionsFromDocument(
  bookingId: string,
  caseNumber: string,
  document: BookingDocumentState,
  createdBy: string,
) {
  const supabase = createAdminSupabaseClient();
  const activeRefs: string[] = [];

  for (let index = 0; index < (document.payments || []).length; index += 1) {
    const payment = document.payments[index];
    const amount = Math.round(parseAmount(payment.amount));
    if (amount <= 0) continue;

    const sourceRef = String(index);
    activeRefs.push(sourceRef);
    const fallbackDate =
      document.shootingDate?.year && document.shootingDate?.month && document.shootingDate?.day
        ? `${document.shootingDate.year}-${String(document.shootingDate.month).padStart(2, '0')}-${String(document.shootingDate.day).padStart(2, '0')}`
        : formatIsoDate(new Date());
    const transactionDate = parseTransactionDate(payment.date || fallbackDate);

    const { error } = await supabase.from('transactions').upsert(
      {
        booking_id: bookingId,
        case_number: caseNumber || document.caseNumber || '',
        transaction_date: transactionDate,
        type: 'income',
        category: index === 0 ? '訂金' : '尾款',
        amount,
        payment_method: '',
        receiver: String(payment.receiver || '').trim(),
        note: '',
        source: 'document_payment',
        source_ref: sourceRef,
        created_by: createdBy,
      },
      { onConflict: 'booking_id,source,source_ref' },
    );
    if (error && !error.message.includes('transactions')) throw new Error(error.message);
  }

  const { data: existing, error: listError } = await supabase
    .from('transactions')
    .select('id, source_ref')
    .eq('booking_id', bookingId)
    .eq('source', 'document_payment');
  if (listError) {
    if (listError.message.includes('transactions')) return;
    throw new Error(listError.message);
  }

  const staleIds = (existing ?? [])
    .filter((row) => !activeRefs.includes(String(row.source_ref || '')))
    .map((row) => row.id);
  if (staleIds.length) {
    await supabase.from('transactions').delete().in('id', staleIds);
  }
}

export async function backfillTransactionsFromBookings(createdBy: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, case_number, document_data')
    .not('document_data', 'is', null);
  if (error) {
    if (error.message.includes('document_data')) {
      throw new Error('請先執行 supabase/booking-document-data.sql');
    }
    throw new Error(error.message);
  }

  let synced = 0;
  for (const row of data ?? []) {
    const document = row.document_data as BookingDocumentState | null;
    if (!document) continue;
    await syncTransactionsFromDocument(row.id, row.case_number || '', document, createdBy);
    synced += 1;
  }
  return { synced };
}

export function formatCurrency(amount: number): string {
  return `NT$ ${Math.round(amount).toLocaleString('zh-Hant-TW')}`;
}
