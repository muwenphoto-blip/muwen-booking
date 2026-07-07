import type { ReactNode } from 'react';
import type {
  BookingDocumentState,
  DateParts,
  DocumentItemRow,
  DocumentLineItem,
  DocumentPaymentRow,
} from '@/lib/admin/booking-documents';

export type BookingDocumentSharedProps = {
  state: BookingDocumentState;
  services: import('@/lib/booking/types').ServiceItem[];
  shopName: string;
  shopFullName: string;
  shopAddress: string;
  shopPhone: string;
  onChange: (next: BookingDocumentState) => void;
  fieldErrors?: Record<string, string>;
  onFieldTouch?: (fieldId: string) => void;
  onFieldBlur?: (fieldId: string) => void;
  formMode?: 'default' | 'walk-in';
  handlerOptions?: { value: string; label: string }[];
};

function toRocYear(gregorianYear: string): string {
  const num = Number(gregorianYear);
  if (!Number.isFinite(num)) return gregorianYear;
  return String(num - 1911);
}

export function formatDateParts(parts: DateParts): string {
  const y = String(parts.year ?? '').trim();
  const m = String(parts.month ?? '').trim();
  const d = String(parts.day ?? '').trim();
  if (!y && !m && !d) return '';

  const yearLabel = y ? `中華民國${toRocYear(y)}年` : '';

  if (y && m && d) {
    return `${yearLabel}${m.padStart(2, '0')}月${d.padStart(2, '0')}日`;
  }

  const chunks: string[] = [];
  if (y) chunks.push(yearLabel);
  if (m) chunks.push(`${m}月`);
  if (d) chunks.push(`${d}日`);
  return chunks.join('');
}

export function parseAmount(value: string): number {
  const n = parseFloat(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** 有單價但沒填數量時，預設以 1 計算（避免第二筆以後小計變成 0）。 */
export function effectiveItemQuantity(quantity: string, price: string, discount = ''): number {
  const qty = parseAmount(quantity);
  if (qty > 0) return qty;
  if (parseAmount(price) || parseAmount(discount)) return 1;
  return 0;
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** 單項總額 = 價格 × 數量 − 折扣 */
export function calcItemRowTotal(price: string, discount: string, quantity: string): string {
  const hasInput = parseAmount(price) || parseAmount(discount) || parseAmount(quantity);
  if (!hasInput) return '';
  const qty = effectiveItemQuantity(quantity, price, discount);
  const total = Math.max(0, parseAmount(price) * qty - parseAmount(discount));
  return formatAmount(total) || '0';
}

export function getItemRowTotal(row: DocumentItemRow): number {
  if (parseAmount(row.price) || parseAmount(row.discount) || parseAmount(row.quantity)) {
    return parseAmount(calcItemRowTotal(row.price, row.discount, row.quantity));
  }
  return parseAmount(row.itemTotal);
}

export function isItemRowFilled(row: DocumentItemRow): boolean {
  return Boolean(
    row.serviceContent ||
      row.packageChoice ||
      row.price ||
      row.discount ||
      row.itemTotal ||
      row.quantity,
  );
}

export function summarizeItemRows(rows: DocumentItemRow[]) {
  let subtotalQty = 0;
  let subtotalAmount = 0;
  let grandTotal = 0;

  rows.forEach((row) => {
    if (!isItemRowFilled(row)) return;
    const qty = effectiveItemQuantity(row.quantity, row.price, row.discount);
    const price = parseAmount(row.price);
    subtotalQty += qty;
    subtotalAmount += price * qty;
    grandTotal += getItemRowTotal(row);
  });

  return { subtotalQty, subtotalAmount, grandTotal };
}

function itemRowToLineItem(row: DocumentItemRow): Partial<DocumentLineItem> {
  const serviceContent = row.packageChoice
    ? `${row.serviceContent}｜${row.packageChoice}`
    : row.serviceContent;
  return {
    serviceContent,
    quantity: row.quantity,
    unitPrice: row.price,
    amount: calcItemRowTotal(row.price, row.discount, row.quantity),
  };
}

/** 項目表為金額主來源，同步估價單明細與合約／估價總額 */
export function applyDocumentFinancialSync(state: BookingDocumentState): BookingDocumentState {
  const { grandTotal } = summarizeItemRows(state.itemRows);
  const fullTotal = grandTotal + parseAmount(state.additionalAmount);
  const totalStr = formatAmount(fullTotal);
  const amountStr = formatAmount(grandTotal);

  const lineItems = state.lineItems.map((line, index) => {
    const item = state.itemRows[index];
    if (!item || !isItemRowFilled(item)) return line;
    return { ...line, ...itemRowToLineItem(item) };
  });

  return {
    ...state,
    lineItems,
    amount: amountStr || state.amount,
    total: totalStr || state.total,
  };
}

export function getDocumentGrandTotal(state: BookingDocumentState): number {
  const { grandTotal } = summarizeItemRows(state.itemRows);
  return grandTotal + parseAmount(state.additionalAmount);
}

/** 合約尾款 = 應收總額 − 訂金 */
export function getBalanceDue(state: BookingDocumentState): number {
  return Math.max(0, getDocumentGrandTotal(state) - parseAmount(state.deposit));
}

export function patchDocumentState(
  state: BookingDocumentState,
  patch: BookingDocumentState | ((prev: BookingDocumentState) => BookingDocumentState),
): BookingDocumentState {
  const next = typeof patch === 'function' ? patch(state) : patch;
  return applyDocumentFinancialSync(next);
}

export function updateItemRow(
  state: BookingDocumentState,
  index: number,
  patch: Partial<DocumentItemRow>,
): BookingDocumentState {
  const itemRows = state.itemRows.map((row, i) => (i === index ? { ...row, ...patch } : row));
  return { ...state, itemRows };
}

export function updateItemRowWithCalc(
  state: BookingDocumentState,
  index: number,
  patch: Partial<DocumentItemRow>,
): BookingDocumentState {
  const row = { ...state.itemRows[index], ...patch };
  const itemTotal = calcItemRowTotal(row.price, row.discount, row.quantity);
  return applyDocumentFinancialSync(updateItemRow(state, index, { ...patch, itemTotal }));
}

export function updateLineItem(
  state: BookingDocumentState,
  index: number,
  patch: Partial<DocumentLineItem>,
): BookingDocumentState {
  const lineItems = state.lineItems.map((row, i) => (i === index ? { ...row, ...patch } : row));
  const line = lineItems[index];
  const itemPatch: Partial<DocumentItemRow> = {};
  if (patch.quantity !== undefined) itemPatch.quantity = patch.quantity;
  if (patch.unitPrice !== undefined) itemPatch.price = patch.unitPrice;
  if (patch.amount !== undefined) itemPatch.itemTotal = patch.amount;
  if (patch.serviceContent !== undefined) {
    const parts = String(patch.serviceContent).split('｜');
    itemPatch.serviceContent = parts[0]?.trim() || '';
    itemPatch.packageChoice = parts[1]?.trim() || '';
  }
  const itemRows = state.itemRows.map((row, i) => {
    if (i !== index) return row;
    const merged = { ...row, ...itemPatch };
    if (itemPatch.price !== undefined || itemPatch.quantity !== undefined) {
      merged.itemTotal = calcItemRowTotal(merged.price, merged.discount, merged.quantity);
    }
    return merged;
  });
  return applyDocumentFinancialSync({ ...state, lineItems, itemRows });
}

export function updatePayment(
  state: BookingDocumentState,
  index: number,
  patch: Partial<DocumentPaymentRow>,
): BookingDocumentState {
  const payments = state.payments.map((row, i) => (i === index ? { ...row, ...patch } : row));
  return { ...state, payments };
}

export function EditSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="booking-doc-edit-section">
      <div className="booking-doc-edit-section-head">
        <h4>{title}</h4>
        {hint ? <p>{hint}</p> : null}
      </div>
      <div className="booking-doc-edit-section-body">{children}</div>
    </section>
  );
}
