'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BookingConfig, BookingSlot } from '@/lib/booking/types';
import { PHONE_COUNTRIES } from '@/lib/booking/phone-countries';
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
  const [phoneCountry, setPhoneCountry] = useState('+886');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    setMessageType('');

    if (!selectedTime) {
      setMessage('請先選擇預約時段');
      setMessageType('error');
      return;
    }
    if (selectedService?.options.length && !serviceOption) {
      setMessage('請選擇方案選項');
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
          phoneCountry,
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
    <form className="booking-form" onSubmit={onSubmit}>
      <div className="booking-card">
        <h2>1. 選擇日期與時段</h2>
        <div className="booking-grid-2">
          <label className="booking-field">
            <span>預約日期 Date</span>
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              required
              onChange={(e) => setDate(e.target.value)}
            />
            {date ? <small>{formatDateWithWeekday(date)}</small> : null}
          </label>
          <label className="booking-field">
            <span>服務人員 Staff</span>
            <select value={staff} required onChange={(e) => setStaff(e.target.value)}>
              {config.staff.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="booking-field">
          <span>可預約時段 Available times</span>
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
                      onClick={() => setSelectedTime(slot.time)}
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
          <p className="booking-hint">{availableSlots.length && !slotsLoading ? slotsHint : '\u00a0'}</p>
        </div>
      </div>

      <div className="booking-card">
        <h2>2. 選擇服務</h2>
        <div className="booking-grid-2">
          <label className="booking-field">
            <span>服務項目 Service</span>
            <select
              value={serviceCategory}
              required
              onChange={(e) => {
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
          </label>
          {selectedService?.options.length ? (
            <label className="booking-field">
              <span>方案選項 Plan</span>
              <select
                value={serviceOption}
                required
                onChange={(e) => setServiceOption(e.target.value)}
              >
                <option value="">請選擇</option>
                {selectedService.options.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <p className="booking-hint">金額以現場／私訊確認為準；妝造及禮服另外計價。</p>
      </div>

      <div className="booking-card">
        <h2>3. 填寫資料</h2>
        <div className="booking-grid-2">
          <label className="booking-field">
            <span>人數 Headcount</span>
            <select value={headcount} required onChange={(e) => setHeadcount(e.target.value)}>
              {config.headcountOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="booking-field">
            <span>性別 Gender</span>
            <select value={gender} required onChange={(e) => setGender(e.target.value)}>
              {config.genderOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="booking-field">
          <span>姓名 Name</span>
          <input
            type="text"
            maxLength={40}
            placeholder="請填寫姓名"
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="booking-field">
          <span>電話 Phone</span>
          <div className="booking-phone-row">
            <select
              value={phoneCountry}
              onChange={(e) => setPhoneCountry(e.target.value)}
              aria-label="國碼"
            >
              {PHONE_COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              placeholder={phoneCountry === '+886' ? '912345678' : '電話號碼'}
              value={phone}
              required
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <small className="booking-hint">
            {phoneCountry === '+886'
              ? '台灣手機 9 開頭 9 碼（不需加 0）'
              : '請輸入該國有效電話號碼（僅數字）'}
          </small>
        </label>
        <label className="booking-field">
          <span>電子信箱 Email</span>
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="booking-field">
          <span>備註 Notes（選填）</span>
          <textarea
            placeholder="例如：護照＋身分證、兒童證件照…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
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
