import type { DocumentItemRow } from '@/lib/admin/booking-documents';
import { effectiveItemQuantity, formatAmount, parseAmount } from '@/components/booking-document-shared';

export type DocumentDiscountMode = 'manual' | 'per_extra' | 'group_free' | '';

export function normalizeDiscountMode(mode: string | undefined): DocumentDiscountMode {
  if (mode === 'per_extra' || mode === 'group_free' || mode === 'manual') return mode;
  return 'manual';
}

export function calculateRuleDiscount(row: DocumentItemRow): number {
  const mode = normalizeDiscountMode(row.discountMode);
  const qty = effectiveItemQuantity(row.quantity, row.price, row.discount);
  const unitPrice = parseAmount(row.price);

  if (mode === 'per_extra') {
    const basePeople = Math.max(0, parseAmount(row.discountBasePeople || ''));
    const perExtra = parseAmount(row.discountPerExtra || '');
    const extraPeople = Math.max(0, qty - basePeople);
    return extraPeople * perExtra;
  }

  if (mode === 'group_free') {
    const groupPay = Math.max(1, parseAmount(row.discountGroupPay || '') || 1);
    const groupFree = Math.max(1, parseAmount(row.discountGroupFree || '') || 1);
    const bundleSize = groupPay + groupFree;
    const freePeople = Math.floor(qty / bundleSize) * groupFree;
    return freePeople * unitPrice;
  }

  return parseAmount(row.discount);
}

export function applyItemRowAutoDiscount(row: DocumentItemRow): DocumentItemRow {
  const mode = normalizeDiscountMode(row.discountMode);
  if (mode === 'manual') return row;
  const discount = formatAmount(calculateRuleDiscount({ ...row, discount: '' }));
  return { ...row, discount: discount || '0' };
}

export function describeDiscountRule(row: DocumentItemRow): string {
  if (row.promotionName) return `活動：${row.promotionName}`;
  const mode = normalizeDiscountMode(row.discountMode);
  if (mode === 'per_extra') {
    const base = row.discountBasePeople || '0';
    const per = row.discountPerExtra || '0';
    return `超過 ${base} 人，每人減 ${per} 元`;
  }
  if (mode === 'group_free') {
    const pay = row.discountGroupPay || '?';
    const free = row.discountGroupFree || '?';
    return `每滿 ${pay} 人送 ${free} 人`;
  }
  return '';
}
