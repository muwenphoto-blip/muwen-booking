'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DocumentItemRow,
  DocumentLineItem,
  DocumentPaymentRow,
} from '@/lib/admin/booking-documents';
import {
  serviceOptionsFor,
  serviceOptionPlaceholder,
  syncServiceChange,
  syncServiceOptionChange,
  EMPTY_ITEM_DISCOUNT_RULE,
} from '@/lib/admin/booking-documents';
import type { ServiceItem } from '@/lib/booking/types';
import {
  isItemRowFilled,
  updateItemRow,
  updateLineItem,
  updateItemRowWithCalc,
  updatePayment,
  getItemRowTotal,
  calcItemRowTotal,
  parseAmount,
} from '@/components/booking-document-shared';
import type { BookingDocumentSharedProps } from '@/components/booking-document-shared';
import {
  DEPOSIT_PERCENT_OPTIONS,
  applyDepositPercentChoice,
  documentTotals,
  formatPaymentSummaryLine,
  resolvePaymentAmountForKind,
  todayIsoDate,
  calcDepositFromPercent,
  type DepositPercentChoice,
} from '@/lib/admin/document-payment';
import type { DocumentPaymentKind } from '@/lib/admin/booking-documents';
import { ServiceOptionPicker } from '@/components/service-option-picker';
import { DocumentDiscountHelper } from '@/components/document-discount-helper';
import { describeDiscountRule } from '@/lib/admin/document-discount';

function isLineItemFilled(row: DocumentLineItem): boolean {
  return Boolean(row.serviceContent || row.quantity || row.unitPrice || row.amount || row.remarks);
}

function isPaymentFilled(row: DocumentPaymentRow): boolean {
  return Boolean(
    row.date && row.paymentKind && parseAmount(row.amount) > 0,
  );
}

function toPaymentDateInputValue(value: string): string {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split(/[/.-]/).map((part) => part.trim());
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return '';
}

function findFirstEmptyIndex<T>(rows: T[], isFilled: (row: T) => boolean): number {
  const index = rows.findIndex((row) => !isFilled(row));
  return index < 0 ? rows.length - 1 : index;
}

function formatItemSummary(row: DocumentItemRow, services: ServiceItem[]): string {
  const parts: string[] = [];
  if (row.serviceContent) {
    const item = services.find((s) => s.name === row.serviceContent);
    parts.push(item?.label || row.serviceContent);
  }
  if (row.packageChoice) {
    const item = services.find((s) => s.name === row.serviceContent);
    const opt = item?.options.find((entry) => entry.value === row.packageChoice);
    parts.push(opt?.value || row.packageChoice);
  }
  if (row.quantity) parts.push(`數量 ${row.quantity}`);
  return parts.join(' · ') || '（尚未設定）';
}

function getPackageEnglishLabel(row: DocumentItemRow, services: ServiceItem[]): string {
  if (!row.packageChoice || !row.serviceContent) return '';
  const item = services.find((s) => s.name === row.serviceContent);
  const opt = item?.options.find((entry) => entry.value === row.packageChoice);
  if (!opt) return '';
  const label = String(opt.label || '').trim();
  const value = String(opt.value || '').trim();
  if (!label || label === value) return '';
  if (label.startsWith(value)) return label.slice(value.length).trim();
  return '';
}

function formatLineSummary(row: DocumentLineItem): string {
  const parts: string[] = [];
  if (row.serviceContent) parts.push(row.serviceContent);
  if (row.quantity) parts.push(`× ${row.quantity}`);
  if (row.amount) parts.push(`$${row.amount}`);
  else if (row.unitPrice) parts.push(`單價 $${row.unitPrice}`);
  return parts.join(' ') || '（尚未設定）';
}

function formatPaymentSummary(row: DocumentPaymentRow, documentTotal: number, deposit: number): string {
  return formatPaymentSummaryLine(row, documentTotal, deposit);
}

type ItemRowListProps = BookingDocumentSharedProps;

export function ItemRowList({ state, services, promotions = [], onChange }: ItemRowListProps) {
  const filledIndices = useMemo(
    () => state.itemRows.map((row, i) => (isItemRowFilled(row, services) ? i : -1)).filter((i) => i >= 0),
    [state.itemRows, services],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftIndex, setDraftIndex] = useState<number | null>(null);

  useEffect(() => {
    setEditingIndex(null);
    setDraftIndex(null);
  }, [state.caseNumber]);

  const canAdd = findFirstEmptyIndex(state.itemRows, (row) => isItemRowFilled(row, services)) >= 0;

  function startAdd() {
    const index = findFirstEmptyIndex(state.itemRows, (row) => isItemRowFilled(row, services));
    if (index >= state.itemRows.length) return;
    setDraftIndex(index);
    setEditingIndex(index);
  }

  function finishEdit(index: number) {
    const row = state.itemRows[index];
    if (!isItemRowFilled(row, services)) return;
    if ((parseAmount(row.price) || parseAmount(row.discount)) && !String(row.quantity || '').trim()) {
      onChange(
        updateItemRowWithCalc(state, index, {
          quantity: '1',
        }),
      );
    }
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function cancelEdit(index: number) {
    if (draftIndex === index && !filledIndices.includes(index)) {
      onChange(updateItemRow(state, index, {
        serviceContent: '',
        packageChoice: '',
        price: '',
        discount: '',
        itemTotal: '',
        quantity: '',
        ...EMPTY_ITEM_DISCOUNT_RULE,
      }));
    }
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function removeRow(index: number) {
    onChange(updateItemRow(state, index, {
      serviceContent: '',
      packageChoice: '',
      price: '',
      discount: '',
      itemTotal: '',
      quantity: '',
      ...EMPTY_ITEM_DISCOUNT_RULE,
    }));
    setEditingIndex(null);
    setDraftIndex(null);
  }

  const showEmpty = filledIndices.length === 0 && editingIndex === null;

  return (
    <div className="booking-doc-row-list">
      {showEmpty ? <p className="booking-doc-row-list-empty admin-muted">無</p> : null}

      {filledIndices.map((index) => {
        if (editingIndex === index) return null;
        const row = state.itemRows[index];
        const meta: string[] = [];
        if (row.price) meta.push(`價格 ${row.price}`);
        if (row.discount) meta.push(`折扣 ${row.discount}`);
        const ruleHint = describeDiscountRule(row);
        if (ruleHint) meta.push(ruleHint);
        const lineTotal = getItemRowTotal(row);
        if (lineTotal > 0) meta.push(`小計 ${lineTotal}`);
        const packageEnglish = getPackageEnglishLabel(row, services);

        return (
          <div key={index} className="booking-doc-row-card">
            <div className="booking-doc-row-card-body">
              <span className="booking-doc-row-card-no">{index + 1}</span>
              <div className="booking-doc-row-card-text">
                <strong>{formatItemSummary(row, services)}</strong>
                {packageEnglish ? <p className="booking-doc-row-card-en">{packageEnglish}</p> : null}
                {meta.length ? <p>{meta.join(' · ')}</p> : null}
              </div>
            </div>
            <div className="booking-doc-row-card-actions">
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => setEditingIndex(index)}
              >
                編輯
              </button>
              <button
                type="button"
                className="admin-button reject"
                onClick={() => removeRow(index)}
              >
                刪除
              </button>
            </div>
          </div>
        );
      })}

      {editingIndex !== null ? (
        <ItemRowEditor
          index={editingIndex}
          row={state.itemRows[editingIndex]}
          services={services}
          promotions={promotions}
          isNew={draftIndex === editingIndex}
          onChange={onChange}
          state={state}
          onDone={() => finishEdit(editingIndex)}
          onCancel={() => cancelEdit(editingIndex)}
        />
      ) : null}

      {editingIndex === null && canAdd ? (
        <button type="button" className="booking-doc-add-row" onClick={startAdd}>
          <span className="booking-doc-add-row-icon">+</span>
          <span>新增項目</span>
        </button>
      ) : null}
    </div>
  );
}

function ItemRowEditor({
  index,
  row,
  services,
  promotions = [],
  state,
  isNew,
  onChange,
  onDone,
  onCancel,
}: {
  index: number;
  row: DocumentItemRow;
  services: ServiceItem[];
  promotions?: import('@/lib/admin/promotions').AdminPromotionRow[];
  state: ItemRowListProps['state'];
  isNew: boolean;
  onChange: ItemRowListProps['onChange'];
  onDone: () => void;
  onCancel: () => void;
}) {
  const canDone = isItemRowFilled(row, services);
  const packageOptions = serviceOptionsFor(row.serviceContent, services);

  return (
    <div className="booking-doc-row-editor">
      <div className="booking-doc-row-editor-head">
        <strong>{isNew ? '新增項目' : `編輯項目 ${index + 1}`}</strong>
      </div>
      <div className="admin-grid-2">
        <label className="admin-field">
          <span>服務內容</span>
          <select
            value={row.serviceContent}
            onChange={(e) => {
              const serviceName = e.target.value;
              if (index === 0) {
                onChange(syncServiceChange(state, serviceName, services, promotions));
                return;
              }
              onChange(
                updateItemRow(state, index, {
                  serviceContent: serviceName,
                  packageChoice: '',
                }),
              );
            }}
          >
            <option value="">請選擇</option>
            {services.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field admin-field--full">
          <span>方案</span>
          <ServiceOptionPicker
            value={row.packageChoice}
            options={packageOptions}
            placeholder={serviceOptionPlaceholder(packageOptions.length)}
            disabled={!row.serviceContent || packageOptions.length === 0}
            onChange={(nextValue) => {
              const next = updateItemRow(state, index, { packageChoice: nextValue });
              if (index === 0) {
                onChange(syncServiceOptionChange(next, nextValue, services, promotions));
              } else {
                onChange(next);
              }
            }}
          />
        </label>
        <label className="admin-field">
          <span>單價</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={row.price}
            onChange={(e) => onChange(updateItemRowWithCalc(state, index, { price: e.target.value }))}
          />
        </label>
        <label className="admin-field">
          <span>折扣（元）</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={row.discount}
            readOnly={(row.discountMode || 'manual') !== 'manual'}
            className={
              (row.discountMode || 'manual') !== 'manual' ? 'booking-doc-readonly-field' : undefined
            }
            onChange={(e) =>
              onChange(updateItemRowWithCalc(state, index, { discount: e.target.value }))
            }
          />
        </label>
        <label className="admin-field admin-field--full">
          <span>數量（人數優惠請填拍攝人數）</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={row.quantity}
            onChange={(e) =>
              onChange(updateItemRowWithCalc(state, index, { quantity: e.target.value }))
            }
          />
        </label>
        <DocumentDiscountHelper
          row={row}
          onPatch={(patch) => onChange(updateItemRowWithCalc(state, index, patch))}
        />
        <label className="admin-field">
          <span>單項總額</span>
          <input
            className="booking-doc-readonly-field"
            readOnly
            tabIndex={-1}
            value={calcItemRowTotal(row.price, row.discount, row.quantity)}
            placeholder="自動計算"
          />
        </label>
      </div>
      <div className="booking-doc-row-editor-actions">
        <button type="button" className="admin-button" disabled={!canDone} onClick={onDone}>
          完成
        </button>
        <button type="button" className="admin-button secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

type QuoteLineListProps = BookingDocumentSharedProps;

export function QuoteLineList({ state, onChange }: QuoteLineListProps) {
  const filledIndices = useMemo(
    () => state.lineItems.map((row, i) => (isLineItemFilled(row) ? i : -1)).filter((i) => i >= 0),
    [state.lineItems],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftIndex, setDraftIndex] = useState<number | null>(null);

  useEffect(() => {
    if (filledIndices.length === 0) {
      setEditingIndex(0);
      setDraftIndex(0);
      return;
    }
    setEditingIndex(null);
    setDraftIndex(null);
  }, [state.caseNumber]);

  const canAdd = findFirstEmptyIndex(state.lineItems, isLineItemFilled) >= 0;

  function startAdd() {
    const index = findFirstEmptyIndex(state.lineItems, isLineItemFilled);
    if (index >= state.lineItems.length) return;
    setDraftIndex(index);
    setEditingIndex(index);
  }

  function finishEdit(index: number) {
    if (!isLineItemFilled(state.lineItems[index])) return;
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function cancelEdit(index: number) {
    if (draftIndex === index && !filledIndices.includes(index)) {
      onChange(updateLineItem(state, index, {
        serviceContent: '',
        quantity: '',
        unitPrice: '',
        amount: '',
        remarks: '',
      }));
    }
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function removeRow(index: number) {
    onChange(updateLineItem(state, index, {
      serviceContent: '',
      quantity: '',
      unitPrice: '',
      amount: '',
      remarks: '',
    }));
    if (editingIndex === index) {
      setEditingIndex(filledIndices.length > 1 ? null : 0);
      setDraftIndex(filledIndices.length > 1 ? null : 0);
    }
  }

  return (
    <div className="booking-doc-row-list">
      {filledIndices.map((index) => {
        if (editingIndex === index) return null;
        const row = state.lineItems[index];
        const meta: string[] = [];
        if (row.remarks) meta.push(row.remarks);

        return (
          <div key={index} className="booking-doc-row-card">
            <div className="booking-doc-row-card-body">
              <span className="booking-doc-row-card-no">{String(index + 1).padStart(2, '0')}</span>
              <div className="booking-doc-row-card-text">
                <strong>{formatLineSummary(row)}</strong>
                {meta.length ? <p>{meta.join(' · ')}</p> : null}
              </div>
            </div>
            <div className="booking-doc-row-card-actions">
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => setEditingIndex(index)}
              >
                編輯
              </button>
              <button
                type="button"
                className="admin-button reject"
                onClick={() => removeRow(index)}
              >
                刪除
              </button>
            </div>
          </div>
        );
      })}

      {editingIndex !== null ? (
        <div className="booking-doc-row-editor">
          <div className="booking-doc-row-editor-head">
            <strong>{draftIndex === editingIndex ? '新增明細' : `編輯明細 ${editingIndex + 1}`}</strong>
          </div>
          <div className="admin-grid-2">
            <label className="admin-field admin-field--full">
              <span>服務內容</span>
              <input
                value={state.lineItems[editingIndex].serviceContent}
                onChange={(e) =>
                  onChange(updateLineItem(state, editingIndex, { serviceContent: e.target.value }))
                }
              />
            </label>
            <label className="admin-field">
              <span>數量</span>
              <input
                value={state.lineItems[editingIndex].quantity}
                onChange={(e) =>
                  onChange(updateLineItem(state, editingIndex, { quantity: e.target.value }))
                }
              />
            </label>
            <label className="admin-field">
              <span>單價</span>
              <input
                value={state.lineItems[editingIndex].unitPrice}
                onChange={(e) =>
                  onChange(updateLineItem(state, editingIndex, { unitPrice: e.target.value }))
                }
              />
            </label>
            <label className="admin-field">
              <span>金額</span>
              <input
                value={state.lineItems[editingIndex].amount}
                onChange={(e) =>
                  onChange(updateLineItem(state, editingIndex, { amount: e.target.value }))
                }
              />
            </label>
            <label className="admin-field admin-field--full">
              <span>備註</span>
              <input
                value={state.lineItems[editingIndex].remarks}
                onChange={(e) =>
                  onChange(updateLineItem(state, editingIndex, { remarks: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="booking-doc-row-editor-actions">
            <button
              type="button"
              className="admin-button"
              disabled={!isLineItemFilled(state.lineItems[editingIndex])}
              onClick={() => finishEdit(editingIndex)}
            >
              完成
            </button>
            <button
              type="button"
              className="admin-button secondary"
              onClick={() => cancelEdit(editingIndex)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {editingIndex === null && canAdd ? (
        <button type="button" className="booking-doc-add-row" onClick={startAdd}>
          <span className="booking-doc-add-row-icon">+</span>
          <span>新增明細</span>
        </button>
      ) : null}
    </div>
  );
}

type PaymentDraft = {
  date: string;
  paymentKind: DocumentPaymentKind;
  amount: string;
  customerSignature: string;
  receiver: string;
};

function isPaymentDraftFilled(draft: PaymentDraft): boolean {
  return Boolean(draft.date && draft.paymentKind && parseAmount(draft.amount) > 0);
}

type PaymentRowListProps = BookingDocumentSharedProps;

export function PaymentRowList({ state, onChange, services, handlerOptions }: PaymentRowListProps) {
  const { documentTotal, deposit, balanceDue } = documentTotals(state, services);
  const filledIndices = useMemo(
    () => state.payments.map((row, i) => (isPaymentFilled(row) ? i : -1)).filter((i) => i >= 0),
    [state.payments],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);

  const canAdd = findFirstEmptyIndex(state.payments, isPaymentFilled) >= 0;

  function startAdd() {
    const index = findFirstEmptyIndex(state.payments, isPaymentFilled);
    if (index >= state.payments.length) return;
    const defaultKind: DocumentPaymentKind = deposit > 0 ? 'balance' : 'deposit';
    const amount = resolvePaymentAmountForKind(defaultKind, documentTotal, deposit);
    setPaymentDraft({
      date: todayIsoDate(),
      paymentKind: defaultKind,
      amount: amount > 0 ? String(amount) : '',
      customerSignature: '',
      receiver: '',
    });
    setDraftIndex(index);
    setEditingIndex(index);
  }

  function openEdit(index: number) {
    const row = state.payments[index];
    setPaymentDraft({
      date: toPaymentDateInputValue(row.date) || row.date,
      paymentKind: row.paymentKind || '',
      amount: row.amount,
      customerSignature: row.customerSignature,
      receiver: row.receiver,
    });
    setDraftIndex(null);
    setEditingIndex(index);
  }

  function updateDraftKind(kind: DocumentPaymentKind) {
    if (!paymentDraft) return;
    if (kind === 'refund') {
      setPaymentDraft({ ...paymentDraft, paymentKind: kind });
      return;
    }
    const amount = resolvePaymentAmountForKind(kind, documentTotal, deposit);
    setPaymentDraft({
      ...paymentDraft,
      paymentKind: kind,
      amount: amount > 0 ? String(amount) : '',
    });
  }

  function updateDepositPercent(choice: DepositPercentChoice) {
    onChange(applyDepositPercentChoice(state, choice, services));
  }

  function finishEdit(index: number) {
    if (!paymentDraft || !isPaymentDraftFilled(paymentDraft)) return;
    onChange(
      updatePayment(state, index, {
        date: paymentDraft.date,
        paymentKind: paymentDraft.paymentKind,
        amount: paymentDraft.amount,
        customerSignature: paymentDraft.customerSignature,
        receiver: paymentDraft.receiver,
      }),
    );
    setPaymentDraft(null);
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function cancelEdit() {
    setPaymentDraft(null);
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function removeRow(index: number) {
    onChange(updatePayment(state, index, {
      date: '',
      amount: '',
      customerSignature: '',
      receiver: '',
      paymentKind: '',
    }));
    if (editingIndex === index) cancelEdit();
  }

  const draft = paymentDraft;
  const isRefundDraft = draft?.paymentKind === 'refund';

  return (
    <div className="booking-doc-row-list">
      {filledIndices.map((index) => {
        if (editingIndex === index) return null;
        return (
          <div key={index} className="booking-doc-row-card">
            <div className="booking-doc-row-card-body">
              <span className="booking-doc-row-card-no">{index + 1}</span>
              <div className="booking-doc-row-card-text">
                <strong>{formatPaymentSummary(state.payments[index], documentTotal, deposit)}</strong>
              </div>
            </div>
            <div className="booking-doc-row-card-actions">
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => openEdit(index)}
              >
                編輯
              </button>
              <button
                type="button"
                className="admin-button reject"
                onClick={() => removeRow(index)}
              >
                刪除
              </button>
            </div>
          </div>
        );
      })}

      {editingIndex !== null && draft ? (
        <div className="booking-doc-row-editor">
          <div className="booking-doc-row-editor-head">
            <strong>{draftIndex === editingIndex ? '新增付款' : `編輯付款 ${editingIndex + 1}`}</strong>
          </div>
          <div className="admin-grid-2">
            <label className="admin-field admin-field--full">
              <span>應收總額</span>
              <input
                className="booking-doc-readonly-field"
                readOnly
                tabIndex={-1}
                value={documentTotal > 0 ? String(documentTotal) : ''}
                placeholder="請先填寫服務明細"
              />
            </label>
            {!isRefundDraft ? (
              <>
                <label className="admin-field">
                  <span>預付訂金</span>
                  <select
                    value={state.depositPercent || (state.deposit ? 'custom' : '')}
                    onChange={(e) => updateDepositPercent(e.target.value as DepositPercentChoice)}
                  >
                    <option value="">選擇預付比例</option>
                    {DEPOSIT_PERCENT_OPTIONS.map((percent) => (
                      <option key={percent} value={String(percent)}>
                        {percent}%（
                        {documentTotal > 0
                          ? calcDepositFromPercent(documentTotal, percent).toLocaleString('zh-Hant-TW')
                          : '依總額計算'}
                        ）
                      </option>
                    ))}
                    <option value="custom">自訂金額</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>訂金金額</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={state.deposit}
                    readOnly={state.depositPercent !== 'custom' && Boolean(state.depositPercent)}
                    className={
                      state.depositPercent !== 'custom' && state.depositPercent
                        ? 'booking-doc-readonly-field'
                        : undefined
                    }
                    placeholder={documentTotal > 0 ? '0' : '請先填寫服務明細'}
                    onChange={(e) =>
                      onChange({
                        ...state,
                        depositPercent: 'custom',
                        deposit: e.target.value,
                      })
                    }
                  />
                </label>
              </>
            ) : null}
            <label className="admin-field">
              <span>付款類型</span>
              <select
                value={draft.paymentKind || ''}
                onChange={(e) => updateDraftKind(e.target.value as DocumentPaymentKind)}
              >
                <option value="">請選擇</option>
                <option value="deposit">訂金（預付）</option>
                <option value="full">全額</option>
                <option value="balance">尾款（剩餘）</option>
                <option value="refund">退款</option>
              </select>
            </label>
            <label className="admin-field">
              <span>{isRefundDraft ? '退款金額' : '實收金額'}</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                className={isRefundDraft ? undefined : 'booking-doc-readonly-field'}
                readOnly={!isRefundDraft}
                tabIndex={isRefundDraft ? 0 : -1}
                value={draft.amount}
                placeholder={isRefundDraft ? '請輸入退款金額' : '依付款類型自動帶入'}
                onChange={(e) =>
                  setPaymentDraft((prev) => (prev ? { ...prev, amount: e.target.value } : prev))
                }
              />
            </label>
            {!isRefundDraft ? (
              <label className="admin-field">
                <span>參考：全額 / 尾款</span>
                <input
                  className="booking-doc-readonly-field"
                  readOnly
                  tabIndex={-1}
                  value={
                    documentTotal > 0
                      ? `全額 ${documentTotal}｜尾款 ${balanceDue}`
                      : ''
                  }
                />
              </label>
            ) : null}
            <label className="admin-field">
              <span>付款日期</span>
              <input
                type="date"
                value={toPaymentDateInputValue(draft.date)}
                onChange={(e) =>
                  setPaymentDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                }
              />
            </label>
            <label className="admin-field">
              <span>客戶簽名</span>
              <input
                value={draft.customerSignature}
                onChange={(e) =>
                  setPaymentDraft((prev) =>
                    prev ? { ...prev, customerSignature: e.target.value } : prev,
                  )
                }
              />
            </label>
            <label className="admin-field">
              <span>收款人</span>
              {handlerOptions?.length ? (
                <select
                  value={draft.receiver}
                  onChange={(e) =>
                    setPaymentDraft((prev) => (prev ? { ...prev, receiver: e.target.value } : prev))
                  }
                >
                  <option value="">請選擇</option>
                  {draft.receiver &&
                  !handlerOptions.some((option) => option.value === draft.receiver) ? (
                    <option value={draft.receiver}>{draft.receiver}</option>
                  ) : null}
                  {handlerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={draft.receiver}
                  onChange={(e) =>
                    setPaymentDraft((prev) => (prev ? { ...prev, receiver: e.target.value } : prev))
                  }
                />
              )}
            </label>
          </div>
          <div className="booking-doc-row-editor-actions">
            <button
              type="button"
              className="admin-button"
              disabled={!isPaymentDraftFilled(draft)}
              onClick={() => finishEdit(editingIndex)}
            >
              完成
            </button>
            <button
              type="button"
              className="admin-button secondary"
              onClick={cancelEdit}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {editingIndex === null && canAdd ? (
        <button type="button" className="booking-doc-add-row" onClick={startAdd}>
          <span className="booking-doc-add-row-icon">+</span>
          <span>新增付款紀錄</span>
        </button>
      ) : null}
    </div>
  );
}
