import type { BookingDocumentState, DocumentPaymentKind, DocumentPaymentRow } from '@/lib/admin/booking-documents';
import { getBalanceDue, getDocumentGrandTotal, parseAmount } from '@/components/booking-document-shared';
import type { ServiceItem } from '@/lib/booking/types';

export const DEPOSIT_PERCENT_OPTIONS = [10, 20, 30, 40, 50, 60, 70] as const;

export type DepositPercentChoice = (typeof DEPOSIT_PERCENT_OPTIONS)[number] | 'custom' | '';

export function calcDepositFromPercent(total: number, percent: number): number {
  if (total <= 0 || percent <= 0) return 0;
  return Math.round((total * percent) / 100);
}

export function inferDepositPercent(total: number, deposit: number): DepositPercentChoice {
  if (deposit <= 0 || total <= 0) return '';
  for (const percent of DEPOSIT_PERCENT_OPTIONS) {
    if (calcDepositFromPercent(total, percent) === deposit) return percent;
  }
  return 'custom';
}

export function resolvePaymentAmountForKind(
  kind: DocumentPaymentKind,
  documentTotal: number,
  deposit: number,
): number {
  if (kind === 'full') return documentTotal;
  if (kind === 'deposit') return Math.max(0, deposit);
  if (kind === 'balance') return Math.max(0, documentTotal - deposit);
  return 0;
}

export function paymentKindLabel(kind: DocumentPaymentKind): string {
  if (kind === 'full') return '全額';
  if (kind === 'deposit') return '訂金（預付）';
  if (kind === 'balance') return '尾款（剩餘）';
  return '付款';
}

export function paymentCategoryForRow(row: DocumentPaymentRow, index: number): string {
  if (row.paymentKind === 'deposit') return '訂金';
  if (row.paymentKind === 'balance') return '尾款';
  if (row.paymentKind === 'full') return '拍攝收款';
  return index === 0 ? '訂金' : '尾款';
}

export function formatPaymentSummaryLine(
  row: DocumentPaymentRow,
  documentTotal: number,
  deposit: number,
): string {
  const parts: string[] = [];
  if (row.paymentKind) parts.push(paymentKindLabel(row.paymentKind));
  if (row.date) parts.push(row.date);
  const amount = parseAmount(row.amount);
  if (amount > 0) parts.push(`$${amount.toLocaleString('zh-Hant-TW')}`);
  if (row.paymentKind === 'full' && documentTotal > 0) {
    parts.push(`全額 ${documentTotal.toLocaleString('zh-Hant-TW')}`);
  }
  if (row.paymentKind === 'balance' && documentTotal > 0) {
    const balance = Math.max(0, documentTotal - deposit);
    parts.push(`剩餘 ${balance.toLocaleString('zh-Hant-TW')}`);
  }
  if (row.receiver) parts.push(`收款 ${row.receiver}`);
  return parts.join(' · ') || '（尚未設定）';
}

export function syncDepositIfPercentSet(
  state: BookingDocumentState,
  services: ServiceItem[],
): BookingDocumentState {
  const choice = state.depositPercent;
  if (!choice || choice === 'custom') return state;
  const percent = parseInt(choice, 10);
  if (!DEPOSIT_PERCENT_OPTIONS.includes(percent as (typeof DEPOSIT_PERCENT_OPTIONS)[number])) {
    return state;
  }
  return applyDepositPercentChoice(state, percent as DepositPercentChoice, services);
}

/** 依付款類型自動帶入金額（訂金／尾款／全額） */
export function syncPaymentAmountsForKinds(
  state: BookingDocumentState,
  services: ServiceItem[],
): BookingDocumentState {
  const { documentTotal, deposit } = documentTotals(state, services);
  const payments = (state.payments || []).map((row) => {
    if (!row.paymentKind) return row;
    const amount = resolvePaymentAmountForKind(row.paymentKind, documentTotal, deposit);
    if (amount <= 0) return row;
    return { ...row, amount: String(amount) };
  });
  return { ...state, payments };
}

export function applyDocumentPaymentTotals(
  state: BookingDocumentState,
  services: ServiceItem[],
): BookingDocumentState {
  return syncPaymentAmountsForKinds(syncDepositIfPercentSet(state, services), services);
}

export function applyDepositPercentChoice(
  state: BookingDocumentState,
  choice: DepositPercentChoice,
  services: ServiceItem[],
): BookingDocumentState {
  const total = getDocumentGrandTotal(state, services);
  if (!choice) {
    return syncPaymentAmountsForKinds({ ...state, depositPercent: '', deposit: '' }, services);
  }
  if (choice === 'custom') {
    return { ...state, depositPercent: 'custom' };
  }
  const deposit = calcDepositFromPercent(total, choice);
  return syncPaymentAmountsForKinds(
    {
      ...state,
      depositPercent: String(choice),
      deposit: deposit > 0 ? String(deposit) : '',
    },
    services,
  );
}

export function documentTotals(state: BookingDocumentState, services: ServiceItem[]) {
  const documentTotal = getDocumentGrandTotal(state, services);
  const deposit = parseAmount(state.deposit);
  const balanceDue = getBalanceDue(state, services);
  return { documentTotal, deposit, balanceDue };
}

export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function fallbackPaymentDate(state: BookingDocumentState): string {
  const { year, month, day } = state.shootingDate || { year: '', month: '', day: '' };
  if (year && month && day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return todayIsoDate();
}

export function inferPaymentKind(
  row: DocumentPaymentRow,
  index: number,
  documentTotal: number,
  deposit: number,
): DocumentPaymentKind {
  if (row.paymentKind) return row.paymentKind;
  const amount = parseAmount(row.amount);
  if (amount <= 0) return '';
  if (documentTotal > 0 && amount === documentTotal) return 'full';
  if (deposit > 0 && amount === deposit) return 'deposit';
  if (documentTotal > 0 && deposit > 0 && amount === documentTotal - deposit) return 'balance';
  if (index === 0) return deposit > 0 ? 'deposit' : 'full';
  return 'balance';
}

/** 儲存／同步前補齊付款類型與日期，讓舊資料也能寫入 transactions */
export function prepareDocumentPaymentsForSync(
  state: BookingDocumentState,
  services: ServiceItem[],
): BookingDocumentState {
  const { documentTotal, deposit } = documentTotals(state, services);
  const defaultDate = fallbackPaymentDate(state);
  const payments = (state.payments || []).map((row, index) => {
    const amount = parseAmount(row.amount);
    if (amount <= 0) return row;
    const paymentKind = inferPaymentKind(row, index, documentTotal, deposit);
    return {
      ...row,
      paymentKind,
      date: String(row.date || '').trim() || defaultDate,
    };
  });
  return { ...state, payments };
}

export function sumDocumentPaymentAmounts(state: BookingDocumentState): number {
  return (state.payments || []).reduce((sum, row) => sum + Math.max(0, parseAmount(row.amount)), 0);
}

type PaymentRowRef = { payment: DocumentPaymentRow; index: number };

/** 決定要寫入財務的付款列，避免全額+訂金+尾款重複入帳 */
export function selectPaymentsForFinanceSync(
  state: BookingDocumentState,
  services: ServiceItem[],
): { rows: PaymentRowRef[]; errors: string[] } {
  const documentTotal = Math.round(getDocumentGrandTotal(state, services));
  const withAmount: PaymentRowRef[] = (state.payments || [])
    .map((payment, index) => ({ payment, index }))
    .filter(({ payment }) => parseAmount(payment.amount) > 0);

  const fullRows = withAmount.filter(({ payment }) => payment.paymentKind === 'full');
  if (fullRows.length) {
    const syncErrors =
      fullRows.length > 1 ? ['有多筆全額付款，僅同步第一筆至財務'] : [];
    return { rows: [fullRows[0]], errors: syncErrors };
  }

  const rows = withAmount;
  const total = rows.reduce((sum, { payment }) => sum + parseAmount(payment.amount), 0);
  if (documentTotal > 0 && total > documentTotal) {
    return {
      rows: [],
      errors: [
        `收款合計 NT$ ${total.toLocaleString('zh-Hant-TW')} 超過應收 NT$ ${documentTotal.toLocaleString('zh-Hant-TW')}，請刪除多餘付款或改為正確類型（全額／訂金／尾款）`,
      ],
    };
  }
  return { rows, errors: [] };
}
