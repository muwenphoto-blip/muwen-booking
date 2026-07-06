'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BookingConfig, BookingSlot } from '@/lib/booking/types';
import {
  DEFAULT_PHONE_COUNTRY_ID,
  getPhoneCountryRule,
  PHONE_COUNTRIES,
} from '@/lib/booking/phone-countries';
import { FormField } from '@/components/form-field';
import { clearFieldError, focusFirstInvalid, runValidation, type ValidationRule } from '@/lib/form-validation';
import {
  addDays,
  findNextOpenDate,
  formatDate,
  formatDateWithWeekday,
  generateSlots,
  getDayOfWeek,
} from '@/lib/booking/time';

export function BookingForm() {
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [staff, setStaff] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [serviceCategory, setServiceCategory] = useState('');
  const [serviceOption, setServiceOption] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [gender, setGender] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountryId, setPhoneCountryId] = useState(DEFAULT_PHONE_COUNTRY_ID);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/booking/config')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法載入設定');
        setConfig(data);
        setStaff(data.staff[0]?.value ?? '');
        setHeadcount(data.headcountOptions[0]?.value ?? '');
        setGender(data.genderOptions[0]?.value ?? '');
        setServiceCategory(data.services[0]?.name ?? '');
        const today = new Date();
        const min = addDays(today, data.minDaysAhead);
        const initialDate = findNextOpenDate(min, data.openDays);
        setDate(initialDate);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : '無法載入設定');
      });
  }, []);

  useEffect(() => {
    if (!date || !staff) return;
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
        setMessage(err instanceof Error ? err.message : '無法載入時段');
        setMessageType('error');
      })
      .finally(() => setSlotsLoading(false));
  }, [date, staff]);

  const selectedService = useMemo(
    () => config?.services.find((item) => item.name === serviceCategory),
    [config, serviceCategory],
  );

  const isShopClosed = useMemo(() => {
    if (!config || !date) return false;
    return !config.openDays.includes(getDayOfWeek(date));
  }, [config, date]);

  const availableSlots = useMemo(
    () => slots.filter((slot) => slot.available),
    [slots],
  );

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

  const slotsHint = useMemo(() => {
    if (slotsLoading) return '';
    if (isShopClosed) {
      return '此日為店休（營業日為週二～週六）。請改選其他日期。';
    }
    if (!availableSlots.length) {
      return '此日期無可預約時段。';
    }
    return '點選時段後再填下方資料。';
  }, [slotsLoading, isShopClosed, availableSlots.length]);

  const minDate = useMemo(() => {
    if (!config) return '';
    return formatDate(addDays(new Date(), config.minDaysAhead));
  }, [config]);

  const maxDate = useMemo(() => {
    if (!config) return '';
    return formatDate(addDays(new Date(), config.maxDaysAhead));
  }, [config]);

  const serviceValue = useMemo(() => {
    if (!selectedService) return '';
    if (selectedService.options.length && serviceOption) {
      return `${selectedService.name}／${serviceOption}`;
    }
    return selectedService.name;
  }, [selectedService, serviceOption]);

  const phoneCountryRule = useMemo(
    () => getPhoneCountryRule(phoneCountryId),
    [phoneCountryId],
  );

  function touchField(fieldId: string) {
    setFieldErrors((prev) => clearFieldError(prev, fieldId));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    setMessageType('');

    const rules: ValidationRule[] = [
      { fieldId: 'booking-date', label: '預約日期', value: date, required: true },
      { fieldId: 'booking-staff', label: '服務人員', value: staff, required: true },
      { fieldId: 'booking-slot', label: '預約時段', value: selectedTime, required: true },
      { fieldId: 'booking-service', label: '服務項目', value: serviceCategory, required: true },
      { fieldId: 'booking-headcount', label: '人數', value: headcount, required: true },
      { fieldId: 'booking-gender', label: '性別', value: gender, required: true },
      { fieldId: 'booking-name', label: '姓名', value: name, required: true, minLength: 2 },
      { fieldId: 'booking-phone', label: '電話', value: phone, required: true, minLength: 6 },
      { fieldId: 'booking-email', label: '電子信箱', value: email, required: true },
    ];

    if (selectedService?.options.length) {
      rules.push({
        fieldId: 'booking-service-option',
        label: '方案選項',
        value: serviceOption,
        required: true,
      });
    }

    const errors = runValidation(rules);
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors['booking-email'] = '請填寫正確的電子信箱';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalid(errors);
      setMessage('請完成標示 * 的必填欄位');
      setMessageType('error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/booking/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time: selectedTime,
          staff,
          service: serviceValue,
          headcount,
          name,
          gender,
          phone,
          phoneCountry: phoneCountryRule.code,
          email,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '預約失敗');
      setDone(true);
      setMessage(data.message || '預約已送出');
      setMessageType('success');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '預約失敗');
      setMessageType('error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="booking-card">
        <p className="booking-error">❌ {loadError}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="booking-card">
        <p className="booking-muted">載入中…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="booking-card booking-success">
        <div className="success-icon">✓</div>
        <h2>預約已送出</h2>
        <p>{message}</p>
        <dl className="success-summary">
          <dt>日期</dt>
          <dd>{formatDateWithWeekday(date)}</dd>
          <dt>時段</dt>
          <dd>{selectedTime}</dd>
          <dt>服務</dt>
          <dd>{serviceValue}</dd>
          <dt>姓名</dt>
          <dd>{name}</dd>
        </dl>
        <button type="button" className="booking-submit" onClick={() => window.location.reload()}>
          再預約一筆
        </button>
      </div>
    );
  }

  return (
    <form className="booking-form" onSubmit={onSubmit} noValidate>
      <div className="booking-card">
        <h2>1. 選擇日期與時段</h2>
        <p className="booking-hint">
          標示 <abbr className="booking-field-required" title="必填">*</abbr> 為必填
        </p>
        <div className="booking-grid-2">
          <FormField
            fieldId="booking-date"
            variant="booking"
            label="預約日期 Date"
            required
            hint="請選擇可預約的營業日"
            error={fieldErrors['booking-date']}
          >
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => {
                touchField('booking-date');
                setDate(e.target.value);
              }}
            />
            {date ? <small>{formatDateWithWeekday(date)}</small> : null}
          </FormField>
          <FormField
            fieldId="booking-staff"
            variant="booking"
            label="服務人員 Staff"
            required
            error={fieldErrors['booking-staff']}
          >
            <select
              value={staff}
              onChange={(e) => {
                touchField('booking-staff');
                setStaff(e.target.value);
              }}
            >
              {config.staff.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField
          fieldId="booking-slot"
          variant="booking"
          as="div"
          label="可預約時段 Available times"
          required
          hint={availableSlots.length && !slotsLoading ? slotsHint : slotsHint}
          error={fieldErrors['booking-slot']}
        >
          <div
            className="booking-slots-wrap"
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
                        touchField('booking-slot');
                        setSelectedTime(slot.time);
                      }}
                    >
                      {slot.time}
                    </button>
                  ))
                : null}
            </div>
            {slotsLoading ? (
              <p className="booking-slots-overlay booking-muted">載入時段中…</p>
            ) : !availableSlots.length ? (
              <p className="booking-slots-overlay booking-muted">{slotsHint}</p>
            ) : null}
          </div>
        </FormField>
      </div>

      <div className="booking-card">
        <h2>2. 選擇服務</h2>
        <div className="booking-grid-2">
          <FormField
            fieldId="booking-service"
            variant="booking"
            label="服務項目 Service"
            required
            error={fieldErrors['booking-service']}
          >
            <select
              value={serviceCategory}
              onChange={(e) => {
                touchField('booking-service');
                touchField('booking-service-option');
                setServiceCategory(e.target.value);
                setServiceOption('');
              }}
            >
              {config.services.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.label}
                </option>
              ))}
            </select>
          </FormField>
          {selectedService?.options.length ? (
            <FormField
              fieldId="booking-service-option"
              variant="booking"
              label="方案選項 Plan"
              required
              error={fieldErrors['booking-service-option']}
            >
              <select
                value={serviceOption}
                onChange={(e) => {
                  touchField('booking-service-option');
                  setServiceOption(e.target.value);
                }}
              >
                <option value="">請選擇</option>
                {selectedService.options.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </div>
        <p className="booking-hint">金額以現場／私訊確認為準；妝造及禮服另外計價。</p>
      </div>

      <div className="booking-card">
        <h2>3. 填寫資料</h2>
        <div className="booking-grid-2">
          <FormField
            fieldId="booking-headcount"
            variant="booking"
            label="人數 Headcount"
            required
            error={fieldErrors['booking-headcount']}
          >
            <select
              value={headcount}
              onChange={(e) => {
                touchField('booking-headcount');
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
            fieldId="booking-gender"
            variant="booking"
            label="性別 Gender"
            required
            error={fieldErrors['booking-gender']}
          >
            <select
              value={gender}
              onChange={(e) => {
                touchField('booking-gender');
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
          fieldId="booking-name"
          variant="booking"
          label="姓名 Name"
          required
          error={fieldErrors['booking-name']}
        >
          <input
            type="text"
            maxLength={40}
            placeholder="請填寫姓名"
            value={name}
            onChange={(e) => {
              touchField('booking-name');
              setName(e.target.value);
            }}
          />
        </FormField>
        <FormField
          fieldId="booking-phone"
          variant="booking"
          label="電話 Phone"
          required
          hint={phoneCountryRule.code === '+886' ? '台灣手機 9 開頭 9 碼（不需加 0）' : '請輸入該國有效電話號碼（僅數字）'}
          error={fieldErrors['booking-phone']}
        >
          <div className="booking-phone-row">
            <select
              value={phoneCountryId}
              onChange={(e) => setPhoneCountryId(e.target.value)}
              aria-label="國碼"
            >
              {PHONE_COUNTRIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              placeholder={phoneCountryRule.code === '+886' ? '912345678' : '電話號碼'}
              value={phone}
              onChange={(e) => {
                touchField('booking-phone');
                setPhone(e.target.value);
              }}
            />
          </div>
        </FormField>
        <FormField
          fieldId="booking-email"
          variant="booking"
          label="電子信箱 Email"
          required
          error={fieldErrors['booking-email']}
        >
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              touchField('booking-email');
              setEmail(e.target.value);
            }}
          />
        </FormField>
        <FormField
          fieldId="booking-note"
          variant="booking"
          label="備註 Notes"
          optional
          hint="例如：護照＋身分證、兒童證件照…"
        >
          <textarea
            placeholder="選填"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </div>

      <button type="submit" className="booking-submit" disabled={submitting}>
        {submitting ? '送出中…' : '確認預約'}
      </button>

      {message ? (
        <p className={messageType === 'success' ? 'booking-success-text' : 'booking-error'}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
