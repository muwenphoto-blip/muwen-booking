'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookingDocumentUnifiedEdit, BookingDocumentFeeFooter } from '@/components/booking-document-edit-views';
import { applyDocumentFinancialSync } from '@/components/booking-document-shared';
import { syncDocumentCatalogPricing } from '@/lib/admin/booking-documents';
import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import type { ServiceItem } from '@/lib/booking/types';
import { clearFieldError } from '@/lib/form-validation';
import { isDocumentFormComplete, validateDocumentFieldOnBlur, validateDocumentFormFields } from '@/lib/admin/document-form-validation';
import {
  buildTeamHandlerOptions,
  type TeamHandlerOption,
} from '@/lib/admin/walk-in-form-validation';

type BookingDocumentsModalProps = {
  bookingId: string;
  caseNumber: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function BookingDocumentsModal({
  bookingId,
  caseNumber,
  open,
  onClose,
  onSaved,
}: BookingDocumentsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | null>(null);
  const [state, setState] = useState<BookingDocumentState | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [shopName, setShopName] = useState('沐紋映像');
  const [shopFullName, setShopFullName] = useState('沐紋映像攝影工作室');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [setupHint, setSetupHint] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [handlerOptions, setHandlerOptions] = useState<TeamHandlerOption[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [scheduleConfig, setScheduleConfig] = useState<{
    openTime: string;
    closeTime: string;
    slotMinutes: number;
    minDate?: string;
    maxDate?: string;
  } | null>(null);
  const [bookingStaffName, setBookingStaffName] = useState('');

  useEffect(() => {
    if (!open || !bookingId) return;

    setLoading(true);
    setError('');
    setSaveMessage('');
    setDirty(false);
    setFieldErrors({});
    fetch(`/api/admin/bookings/${bookingId}/documents`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法載入文件');
        setState(
          applyDocumentFinancialSync(
            syncDocumentCatalogPricing(data.initial, data.services ?? []),
            data.services ?? [],
          ),
        );
        setServices(data.services ?? []);
        setShopName(data.shopName || '沐紋映像');
        setShopFullName(data.shopFullName || '沐紋映像攝影工作室');
        setShopAddress(data.shopAddress || '');
        setShopPhone(data.shopPhone || '');
        setSetupHint(data.documentSetupHint || '');
        setScheduleConfig(data.scheduleConfig ?? null);
        setBookingStaffName(String(data.booking?.staffName || ''));
        setDirty(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '無法載入文件');
        setState(null);
      })
      .finally(() => setLoading(false));
  }, [open, bookingId]);

  useEffect(() => {
    if (!open) return;

    fetch('/api/admin/team')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) return;
        setHandlerOptions(buildTeamHandlerOptions(data));
      })
      .catch(() => setHandlerOptions([]));
  }, [open]);

  function handleChange(next: BookingDocumentState) {
    const synced = applyDocumentFinancialSync(
      syncDocumentCatalogPricing(next, services),
      services,
    );
    setState(synced);
    setDirty(true);
    setSaveMessage('');
  }

  function touchField(fieldId: string) {
    setFieldErrors((prev) => clearFieldError(prev, fieldId));
  }

  function blurField(fieldId: string) {
    if (!state) return;
    const message = validateDocumentFieldOnBlur(fieldId, { document: state, services });
    setFieldErrors((prev) => {
      if (message) return { ...prev, [fieldId]: message };
      return clearFieldError(prev, fieldId);
    });
  }

  function requestClose() {
    if (dirty && !window.confirm('尚有未儲存的變更，確定要關閉？')) return;
    onClose();
  }

  async function handleSave() {
    if (!state || !bookingId) return;

    const errors = validateDocumentFormFields(state, services);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(Object.values(errors)[0]);
      return;
    }

    setBusy('save');
    setError('');
    setSaveMessage('');
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setDirty(false);
      setSaveMessage(data.message || '已儲存');
      onSaved?.();
      if (data.documentSetupHint !== undefined) {
        setSetupHint(data.documentSetupHint || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setBusy(null);
    }
  }

  const formComplete = useMemo(() => {
    if (!state || !services.length) return false;
    return isDocumentFormComplete(state, services);
  }, [state, services]);

  if (!open) return null;

  const sharedProps = state
    ? {
        state,
        services,
        shopName,
        shopFullName,
        shopAddress,
        shopPhone,
        onChange: handleChange,
        fieldErrors,
        onFieldTouch: touchField,
        onFieldBlur: blurField,
        handlerOptions,
        scheduleConfig: scheduleConfig ?? undefined,
        bookingStaff: bookingStaffName,
      }
    : null;

  const actionButtons = (
    <button
      type="button"
      className="admin-button"
      disabled={!state || busy !== null || !dirty}
      onClick={handleSave}
    >
      {busy === 'save' ? '儲存中…' : '儲存'}
    </button>
  );

  return (
    <div className="admin-modal-backdrop booking-doc-backdrop" onClick={requestClose}>
      <div
        className="admin-modal admin-modal--documents"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-documents-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="booking-doc-modal-head">
          <div className="booking-doc-modal-title-wrap">
            <p className="booking-doc-modal-eyebrow">沐紋映像 · 預約文件</p>
            <div className="booking-doc-modal-title-row">
              <h3 id="booking-documents-title">文件編輯</h3>
              {caseNumber ? <span className="booking-doc-case-badge">{caseNumber}</span> : null}
              {dirty ? <span className="booking-doc-dirty-badge">未儲存</span> : null}
            </div>
            <p className="booking-doc-modal-sub">填寫後請按儲存</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={requestClose} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="booking-doc-toolbar booking-doc-toolbar--desktop">
          <p className="booking-doc-toolbar-hint">
            {saveMessage || (dirty ? '有未儲存的變更' : '編輯區為後台表單，不會顯示成紙本版面')}
          </p>
          <div className="booking-doc-actions">{actionButtons}</div>
        </div>

        {error ? <p className="admin-error booking-doc-error">{error}</p> : null}
        {setupHint ? <p className="admin-warning booking-doc-setup-hint">{setupHint}</p> : null}
        {saveMessage ? <p className="admin-success booking-doc-save-hint booking-doc-save-hint--desktop">{saveMessage}</p> : null}

        {loading ? (
          <div className="booking-doc-loading" aria-hidden="true">
            <div className="booking-doc-loading-blocks" />
            <p className="admin-muted">載入文件資料…</p>
          </div>
        ) : sharedProps ? (
          <div className="booking-doc-edit-body">
            <div className="booking-doc-edit-scroll">
              {saveMessage ? (
                <p className="admin-success booking-doc-save-hint booking-doc-save-hint--mobile">{saveMessage}</p>
              ) : null}
              <BookingDocumentUnifiedEdit {...sharedProps} />
            </div>
            <BookingDocumentFeeFooter {...sharedProps} />
            {formComplete ? (
              <div className="booking-doc-mobile-actions">
                <div className="booking-doc-actions">{actionButtons}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="admin-muted booking-doc-empty">無法顯示文件內容。</p>
        )}
      </div>
    </div>
  );
}
