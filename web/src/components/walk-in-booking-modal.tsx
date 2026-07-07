'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BookingConfig, BookingSlot } from '@/lib/booking/types';
import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import { SHOP_ADDRESS, SHOP_FULL_NAME, SHOP_PHONE, syncDocumentCatalogPricing } from '@/lib/admin/booking-documents';
import type { ServiceItem } from '@/lib/booking/types';
import {
  applyBookingSlotToDocument,
  buildEmptyWalkInDocument,
} from '@/lib/admin/booking-document-store';
import { applyDocumentFinancialSync } from '@/components/booking-document-shared';
import { BookingDocumentUnifiedEdit, BookingDocumentFeeFooter } from '@/components/booking-document-edit-views';
import { FormField } from '@/components/form-field';
import { clearFieldError, focusFirstInvalid } from '@/lib/form-validation';
import { validateDocumentFieldOnBlur } from '@/lib/admin/document-form-validation';
import { validateWalkInFormFields, buildTeamHandlerOptions, isWalkInFormComplete, type TeamHandlerOption } from '@/lib/admin/walk-in-form-validation';
import {
  addDays,
  findNextOpenDate,
  formatDate,
  formatDateWithWeekday,
  generateSlots,
  getDayOfWeek,
} from '@/lib/booking/time';

function syncWalkInDocument(state: BookingDocumentState, services: ServiceItem[]) {
  return applyDocumentFinancialSync(syncDocumentCatalogPricing(state, services), services);
}

type WalkInBookingModalProps = {
  open: boolean;
  canAssignStaff: boolean;
  photographerName: string;
  staffCasePrefixes?: Record<string, string>;
  onClose: () => void;
  onSuccess: (booking: CreatedBooking) => void;
};

type CreatedBooking = {
  id: string;
  case_number: string;
  customer_name: string;
  booking_date: string;
  booking_time: string;
};

export function WalkInBookingModal({
  open,
  canAssignStaff,
  photographerName,
  staffCasePrefixes,
  onClose,
  onSuccess,
}: WalkInBookingModalProps) {
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [staff, setStaff] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [headcount, setHeadcount] = useState('');
  const [gender, setGender] = useState('');
  const [docState, setDocState] = useState<BookingDocumentState | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [handlerOptions, setHandlerOptions] = useState<TeamHandlerOption[]>([]);
  const [defaultHandler, setDefaultHandler] = useState('');

  const staffChoices = useMemo(() => {
    if (!config) return [];
    const photographers = config.staff.filter((item) => item.value !== '不指定');
    if (canAssignStaff) return photographers;
    const mine = photographerName.trim();
    return photographers.filter((item) => item.value === mine);
  }, [config, canAssignStaff, photographerName]);

  useEffect(() => {
    if (!open) return;

    setLoadError('');
    setError('');
    setCreated(null);
    setSubmitting(false);
    setSelectedTime('');
    setSlots([]);
    setFieldErrors({});

    fetch('/api/booking/config')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法載入設定');
        setConfig(data);
        setHeadcount(data.headcountOptions[0]?.value ?? '');
        setGender(data.genderOptions[0]?.value ?? '');

        const photographers = data.staff.filter((item: { value: string }) => item.value !== '不指定');
        const matchedStaff = photographers.find(
          (item: { value: string }) => item.value === photographerName.trim(),
        );
        const defaultStaff = canAssignStaff
          ? photographers[0]?.value ?? ''
          : matchedStaff?.value || photographers[0]?.value || '';
        setStaff(defaultStaff);

        const today = new Date();
        const initialDate = findNextOpenDate(today, data.openDays);
        setDate(initialDate);
        setDocState(syncWalkInDocument(buildEmptyWalkInDocument(data.services ?? []), data.services ?? []));
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : '無法載入設定');
        setConfig(null);
        setDocState(null);
      });

    Promise.all([
      fetch('/api/admin/team').then((res) => res.json()),
      fetch('/api/admin/session').then((res) => res.json()),
    ])
      .then(([teamData, sessionData]) => {
        const options = buildTeamHandlerOptions(teamData);
        setHandlerOptions(options);

        const session = sessionData?.session;
        const operator =
          session?.photographerName?.trim() ||
          session?.account?.trim() ||
          photographerName.trim();
        const matched = options.find((item) => item.value === operator);
        setDefaultHandler(matched?.value || operator || options[0]?.value || '');
      })
      .catch(() => {
        setHandlerOptions([]);
        setDefaultHandler(photographerName.trim());
      });
  }, [open, canAssignStaff, photographerName]);

  useEffect(() => {
    if (!defaultHandler || !docState || docState.handler.trim()) return;
    setDocState((prev) => (prev ? { ...prev, handler: defaultHandler } : prev));
  }, [defaultHandler, docState?.handler]);

  useEffect(() => {
    if (!open || !date || !staff) return;
    setSlotsLoading(true);
    setSelectedTime('');
    fetch(`/api/booking/slots?date=${encodeURIComponent(date)}&staff=${encodeURIComponent(staff)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法載入時段');
        setSlots(data.slots ?? []);
      })
      .catch((err) => {
        setSlots([]);
        setError(err instanceof Error ? err.message : '無法載入時段');
      })
      .finally(() => setSlotsLoading(false));
  }, [open, date, staff]);

  useEffect(() => {
    if (!docState || !date || !staff || !selectedTime) return;
    setDocState((prev) =>
      prev && config
        ? syncWalkInDocument(
            applyBookingSlotToDocument(prev, { date, time: selectedTime, staff }),
            config.services,
          )
        : prev,
    );
  }, [config, date, staff, selectedTime]);

  const isShopClosed = useMemo(() => {
    if (!config || !date) return false;
    return !config.openDays.includes(getDayOfWeek(date));
  }, [config, date]);

  const availableSlots = useMemo(() => slots.filter((slot) => slot.available), [slots]);

  const allSlotTimes = useMemo(() => {
    if (!config) return [];
    return generateSlots(
      config.openTime || '10:00',
      config.closeTime || '18:00',
      config.slotMinutes || 30,
    );
  }, [config]);

  const slotGridRows = useMemo(
    () => Math.max(1, Math.ceil(allSlotTimes.length / 3)),
    [allSlotTimes.length],
  );

  const minDate = useMemo(() => formatDate(new Date()), []);
  const maxDate = useMemo(() => {
    if (!config) return '';
    return formatDate(addDays(new Date(), config.maxDaysAhead));
  }, [config]);

  const slotsHint = useMemo(() => {
    if (slotsLoading) return '';
    if (isShopClosed) return '此日為店休，請改選其他日期。';
    if (!availableSlots.length) return '此日期無可預約時段。';
    return '點選時段後填寫下方登記資料。';
  }, [slotsLoading, isShopClosed, availableSlots.length]);

  const formComplete = useMemo(() => {
    if (!docState || !config) return false;
    return isWalkInFormComplete({
      date,
      staff,
      selectedTime,
      headcount,
      gender,
      document: docState,
      services: config.services,
      staffCasePrefixes,
    });
  }, [docState, config, date, staff, selectedTime, headcount, gender, staffCasePrefixes]);

  function resetForm() {
    setCreated(null);
    setSelectedTime('');
    setError('');
    if (config) {
      setDocState(
        syncWalkInDocument(
          {
            ...buildEmptyWalkInDocument(config.services),
            handler: defaultHandler,
          },
          config.services,
        ),
      );
    }
    setFieldErrors({});
  }

  function touchField(fieldId: string) {
    setFieldErrors((prev) => clearFieldError(prev, fieldId));
  }

  function blurField(fieldId: string) {
    if (!docState || !config) return;
    const message = validateDocumentFieldOnBlur(fieldId, {
      document: docState,
      services: config.services,
    });
    setFieldErrors((prev) => {
      if (message) return { ...prev, [fieldId]: message };
      return clearFieldError(prev, fieldId);
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!docState || !config) {
      setError('資料尚未載入');
      return;
    }

    const errors = validateWalkInFormFields({
      date,
      staff,
      selectedTime,
      headcount,
      gender,
      document: docState,
      services: config.services,
      staffCasePrefixes,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalid(errors);
      return;
    }

    setSubmitting(true);
    try {
      const document = syncWalkInDocument(
        applyBookingSlotToDocument(docState, { date, time: selectedTime, staff }),
        config.services,
      );
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time: selectedTime,
          staff,
          headcount,
          gender,
          document,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '建立預約失敗');
      const booking = data.booking as CreatedBooking;
      setCreated(booking);
      setDocState((prev) =>
        prev ? { ...prev, caseNumber: booking.case_number || prev.caseNumber } : prev,
      );
      onSuccess(booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立預約失敗');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const sharedDocProps =
    docState && config
      ? {
          state: docState,
          services: config.services,
          shopName: config.shopName,
          shopFullName: SHOP_FULL_NAME,
          shopAddress: SHOP_ADDRESS,
          shopPhone: SHOP_PHONE,
          onChange: (next: BookingDocumentState) =>
            setDocState(syncWalkInDocument(next, config.services)),
          fieldErrors,
          onFieldTouch: touchField,
          onFieldBlur: blurField,
          formMode: 'walk-in' as const,
          handlerOptions,
          scheduleConfig: config
            ? {
                openTime: config.openTime,
                closeTime: config.closeTime,
                slotMinutes: config.slotMinutes,
                minDate,
                maxDate,
              }
            : undefined,
          bookingStaff: staff,
        }
      : null;

  return (
    <div className="admin-modal-backdrop booking-doc-backdrop" onClick={onClose}>
      <div
        className="admin-modal admin-modal--walk-in admin-modal--documents"
        role="dialog"
        aria-modal="true"
        aria-labelledby="walk-in-booking-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="booking-doc-modal-head">
          <div className="booking-doc-modal-title-wrap">
            <p className="booking-doc-modal-eyebrow">沐紋映像 · 門市登記</p>
            <h3 id="walk-in-booking-title">門市預約登記</h3>
            <p className="booking-doc-modal-sub">
              一次填寫服務項目與明細，建立後資料會儲存至預約
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        {created ? (
          <div className="booking-doc-toolbar">
            <p className="booking-doc-toolbar-hint">
              案號 {created.case_number || '—'}｜{created.customer_name}
            </p>
            <div className="booking-doc-actions">
              <button type="button" className="admin-button secondary" onClick={onClose}>
                完成
              </button>
              <button type="button" className="admin-button secondary" onClick={resetForm}>
                再登記一筆
              </button>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <p className="admin-error booking-walk-in-body">{loadError}</p>
        ) : !config || !sharedDocProps ? (
          <p className="admin-muted booking-walk-in-body">載入中…</p>
        ) : created ? (
          <div className="booking-walk-in-body booking-walk-in-success">
            <div className="booking-walk-in-success-icon" aria-hidden="true">
              ✓
            </div>
            <h4>門市預約已建立</h4>
            <p className="admin-muted">資料已儲存，可至預約列表的「文件」繼續編輯。</p>
          </div>
        ) : (
          <form className="booking-doc-edit-body booking-walk-in-form" onSubmit={onSubmit} noValidate>
            <div className="booking-doc-edit-scroll">
            {error ? <p className="admin-error booking-doc-error">{error}</p> : null}

            <section className="booking-walk-in-schedule-card">
              <div className="booking-walk-in-schedule-head">
                <h4>① 預約時段</h4>
                <p>先選日期與服務人員，再點選可預約時段；標示 <abbr className="admin-field-required" title="必填">*</abbr> 為必填</p>
              </div>
              <div className="booking-walk-in-schedule-body">
            <div className="booking-walk-in-slot-bar">
              <FormField
                fieldId="walk-in-date"
                label="預約日期"
                required
                hint="僅可選今日起可預約的日期"
                error={fieldErrors['walk-in-date']}
              >
                <input
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => {
                    touchField('walk-in-date');
                    setDate(e.target.value);
                  }}
                />
                {date ? <small className="admin-muted">{formatDateWithWeekday(date)}</small> : null}
              </FormField>
              <FormField
                fieldId="walk-in-staff"
                label="服務人員"
                required
                hint="負責此次拍攝的攝影師"
                error={fieldErrors['walk-in-staff']}
              >
                <select
                  value={staff}
                  disabled={!canAssignStaff && staffChoices.length <= 1}
                  onChange={(e) => {
                    touchField('walk-in-staff');
                    setStaff(e.target.value);
                  }}
                >
                  {staffChoices.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                fieldId="walk-in-headcount"
                label="人數"
                required
                error={fieldErrors['walk-in-headcount']}
              >
                <select
                  value={headcount}
                  onChange={(e) => {
                    touchField('walk-in-headcount');
                    setHeadcount(e.target.value);
                  }}
                >
                  {config.headcountOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                fieldId="walk-in-gender"
                label="性別"
                required
                error={fieldErrors['walk-in-gender']}
              >
                <select
                  value={gender}
                  onChange={(e) => {
                    touchField('walk-in-gender');
                    setGender(e.target.value);
                  }}
                >
                  {config.genderOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField
              fieldId="walk-in-slot"
              as="div"
              className="booking-walk-in-slot-picker"
              label="可預約時段"
              required
              hint={slotsHint}
              error={fieldErrors['walk-in-slot']}
            >
              <div
                className="booking-slots-wrap booking-walk-in-slots"
                style={{ '--slot-rows': slotGridRows || 4 } as React.CSSProperties}
              >
                <div className="booking-slots">
                  {!slotsLoading
                    ? availableSlots.map((slot) => (
                        <button
                          key={slot.time}
                          type="button"
                          className={['slot-btn', selectedTime === slot.time ? 'active' : ''].join(' ')}
                          onClick={() => {
                            touchField('walk-in-slot');
                            setSelectedTime(slot.time);
                          }}
                        >
                          {slot.time}
                        </button>
                      ))
                    : null}
                </div>
                {slotsLoading ? (
                  <p className="booking-slots-overlay admin-muted">載入時段中…</p>
                ) : !availableSlots.length ? (
                  <p className="booking-slots-overlay admin-muted">{slotsHint}</p>
                ) : null}
              </div>
            </FormField>
              </div>
            </section>

            <section className="booking-walk-in-form-divider">
              <h4>② 登記資料</h4>
              <p>除客戶備註外皆需填寫</p>
            </section>

            <BookingDocumentUnifiedEdit {...sharedDocProps} />

            </div>
            <BookingDocumentFeeFooter {...sharedDocProps} />

            {formComplete ? (
              <div className="booking-walk-in-footer">
                <button type="submit" className="admin-button" disabled={submitting}>
                  {submitting ? '建立中…' : '建立門市預約'}
                </button>
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
