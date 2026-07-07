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

function isLineItemFilled(row: DocumentLineItem): boolean {
  return Boolean(row.serviceContent || row.quantity || row.unitPrice || row.amount || row.remarks);
}

function isPaymentFilled(row: DocumentPaymentRow): boolean {
  return Boolean(row.date || row.amount || row.customerSignature || row.receiver);
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
  if (row.packageChoice) parts.push(row.packageChoice);
  if (row.quantity) parts.push(`數量 ${row.quantity}`);
  return parts.join(' · ') || '（尚未設定）';
}

function formatLineSummary(row: DocumentLineItem): string {
  const parts: string[] = [];
  if (row.serviceContent) parts.push(row.serviceContent);
  if (row.quantity) parts.push(`× ${row.quantity}`);
  if (row.amount) parts.push(`$${row.amount}`);
  else if (row.unitPrice) parts.push(`單價 $${row.unitPrice}`);
  return parts.join(' ') || '（尚未設定）';
}

function formatPaymentSummary(row: DocumentPaymentRow): string {
  const parts: string[] = [];
  if (row.date) parts.push(row.date);
  if (row.amount) parts.push(`$${row.amount}`);
  if (row.receiver) parts.push(`收款 ${row.receiver}`);
  return parts.join(' · ') || '（尚未設定）';
}

type ItemRowListProps = BookingDocumentSharedProps;

export function ItemRowList({ state, services, onChange }: ItemRowListProps) {
  const filledIndices = useMemo(
    () => state.itemRows.map((row, i) => (isItemRowFilled(row) ? i : -1)).filter((i) => i >= 0),
    [state.itemRows],
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

  const canAdd = findFirstEmptyIndex(state.itemRows, isItemRowFilled) >= 0;

  function startAdd() {
    const index = findFirstEmptyIndex(state.itemRows, isItemRowFilled);
    if (index >= state.itemRows.length) return;
    setDraftIndex(index);
    setEditingIndex(index);
  }

  function finishEdit(index: number) {
    const row = state.itemRows[index];
    if (!isItemRowFilled(row)) return;
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
        const row = state.itemRows[index];
        const meta: string[] = [];
        if (row.price) meta.push(`價格 ${row.price}`);
        if (row.discount) meta.push(`折扣 ${row.discount}`);
        const lineTotal = getItemRowTotal(row);
        if (lineTotal > 0) meta.push(`小計 ${lineTotal}`);

        return (
          <div key={index} className="booking-doc-row-card">
            <div className="booking-doc-row-card-body">
              <span className="booking-doc-row-card-no">{index + 1}</span>
              <div className="booking-doc-row-card-text">
                <strong>{formatItemSummary(row, services)}</strong>
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
  state,
  isNew,
  onChange,
  onDone,
  onCancel,
}: {
  index: number;
  row: DocumentItemRow;
  services: ServiceItem[];
  state: ItemRowListProps['state'];
  isNew: boolean;
  onChange: ItemRowListProps['onChange'];
  onDone: () => void;
  onCancel: () => void;
}) {
  const canDone = isItemRowFilled(row);
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
                onChange(syncServiceChange(state, serviceName, services));
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
        <label className="admin-field">
          <span>方案</span>
          <select
            value={row.packageChoice}
            onChange={(e) => {
              const next = updateItemRow(state, index, { packageChoice: e.target.value });
              if (index === 0) {
                onChange(syncServiceOptionChange(next, e.target.value));
              } else {
                onChange(next);
              }
            }}
          >
            <option value="">{serviceOptionPlaceholder(packageOptions.length)}</option>
            {packageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
          <span>折扣</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={row.discount}
            onChange={(e) =>
              onChange(updateItemRowWithCalc(state, index, { discount: e.target.value }))
            }
          />
        </label>
        <label className="admin-field">
          <span>數量</span>
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

type PaymentRowListProps = BookingDocumentSharedProps;

export function PaymentRowList({ state, onChange }: PaymentRowListProps) {
  const filledIndices = useMemo(
    () => state.payments.map((row, i) => (isPaymentFilled(row) ? i : -1)).filter((i) => i >= 0),
    [state.payments],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftIndex, setDraftIndex] = useState<number | null>(null);

  const canAdd = findFirstEmptyIndex(state.payments, isPaymentFilled) >= 0;

  function startAdd() {
    const index = findFirstEmptyIndex(state.payments, isPaymentFilled);
    if (index >= state.payments.length) return;
    setDraftIndex(index);
    setEditingIndex(index);
  }

  function finishEdit(index: number) {
    if (!isPaymentFilled(state.payments[index])) return;
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function cancelEdit(index: number) {
    if (draftIndex === index && !filledIndices.includes(index)) {
      onChange(updatePayment(state, index, {
        date: '',
        amount: '',
        customerSignature: '',
        receiver: '',
      }));
    }
    setEditingIndex(null);
    setDraftIndex(null);
  }

  function removeRow(index: number) {
    onChange(updatePayment(state, index, {
      date: '',
      amount: '',
      customerSignature: '',
      receiver: '',
    }));
    if (editingIndex === index) setEditingIndex(null);
  }

  return (
    <div className="booking-doc-row-list">
      {filledIndices.map((index) => {
        if (editingIndex === index) return null;
        return (
          <div key={index} className="booking-doc-row-card">
            <div className="booking-doc-row-card-body">
              <span className="booking-doc-row-card-no">{index + 1}</span>
              <div className="booking-doc-row-card-text">
                <strong>{formatPaymentSummary(state.payments[index])}</strong>
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
            <strong>{draftIndex === editingIndex ? '新增付款' : `編輯付款 ${editingIndex + 1}`}</strong>
          </div>
          <div className="admin-grid-2">
            <label className="admin-field">
              <span>付款日期</span>
              <input
                value={state.payments[editingIndex].date}
                onChange={(e) =>
                  onChange(updatePayment(state, editingIndex, { date: e.target.value }))
                }
              />
            </label>
            <label className="admin-field">
              <span>付款金額</span>
              <input
                value={state.payments[editingIndex].amount}
                onChange={(e) =>
                  onChange(updatePayment(state, editingIndex, { amount: e.target.value }))
                }
              />
            </label>
            <label className="admin-field">
              <span>客戶簽名</span>
              <input
                value={state.payments[editingIndex].customerSignature}
                onChange={(e) =>
                  onChange(updatePayment(state, editingIndex, {
                    customerSignature: e.target.value,
                  }))
                }
              />
            </label>
            <label className="admin-field">
              <span>收款人</span>
              <input
                value={state.payments[editingIndex].receiver}
                onChange={(e) =>
                  onChange(updatePayment(state, editingIndex, { receiver: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="booking-doc-row-editor-actions">
            <button
              type="button"
              className="admin-button"
              disabled={!isPaymentFilled(state.payments[editingIndex])}
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
          <span>新增付款紀錄</span>
        </button>
      ) : null}
    </div>
  );
}
