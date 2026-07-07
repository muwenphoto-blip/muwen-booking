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

export function applyDepositPercentChoice(
  state: BookingDocumentState,
  choice: DepositPercentChoice,
  services: ServiceItem[],
): BookingDocumentState {
  const total = getDocumentGrandTotal(state, services);
  if (!choice) {
    return { ...state, depositPercent: '', deposit: '' };
  }
  if (choice === 'custom') {
    return { ...state, depositPercent: 'custom' };
  }
  const deposit = calcDepositFromPercent(total, choice);
  return {
    ...state,
    depositPercent: String(choice),
    deposit: deposit > 0 ? String(deposit) : '',
  };
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
