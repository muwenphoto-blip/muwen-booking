'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DateParts } from '@/lib/admin/booking-documents';
import { formatDatePartsToIso, parseDateParts } from '@/lib/admin/booking-documents';
import type { BookingSlot } from '@/lib/booking/types';
import { generateSlots } from '@/lib/booking/time';
import { FormField } from '@/components/form-field';

type ScheduleConfig = {
  openTime: string;
  closeTime: string;
  slotMinutes: number;
};

type ShootingScheduleFieldsProps = {
  shootingDate: DateParts;
  shootingTime: string;
  staff: string;
  minDate?: string;
  maxDate?: string;
  scheduleConfig?: ScheduleConfig;
  dateFieldId?: string;
  timeFieldId?: string;
  dateError?: string;
  timeError?: string;
  dateHint?: string;
  timeHint?: string;
  onDateTouch?: () => void;
  onTimeTouch?: () => void;
  onChange: (next: { shootingDate: DateParts; shootingTime: string }) => void;
};

export function ShootingScheduleFields({
  shootingDate,
  shootingTime,
  staff,
  minDate,
  maxDate,
  scheduleConfig,
  dateFieldId = 'doc-shooting-date',
  timeFieldId = 'doc-shooting-time',
  dateError,
  timeError,
  dateHint,
  timeHint,
  onDateTouch,
  onTimeTouch,
  onChange,
}: ShootingScheduleFieldsProps) {
  const isoDate = formatDatePartsToIso(shootingDate);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  const fallbackTimes = useMemo(() => {
    if (!scheduleConfig) return [];
    return generateSlots(
      scheduleConfig.openTime || '10:00',
      scheduleConfig.closeTime || '18:00',
      scheduleConfig.slotMinutes || 30,
    );
  }, [scheduleConfig]);

  useEffect(() => {
    if (!isoDate || !staff) {
      setSlots([]);
      setSlotsError('');
      return;
    }

    setSlotsLoading(true);
    setSlotsError('');
    fetch(`/api/booking/slots?date=${encodeURIComponent(isoDate)}&staff=${encodeURIComponent(staff)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法載入時段');
        setSlots(data.slots ?? []);
      })
      .catch((err) => {
        setSlots([]);
        setSlotsError(err instanceof Error ? err.message : '無法載入時段');
      })
      .finally(() => setSlotsLoading(false));
  }, [isoDate, staff]);

  const availableTimes = useMemo(() => {
    const fromApi = slots.filter((slot) => slot.available).map((slot) => slot.time);
    if (fromApi.length) return fromApi;
    return fallbackTimes;
  }, [slots, fallbackTimes]);

  const timeOptions = useMemo(() => {
    const set = new Set(availableTimes);
    if (shootingTime) set.add(shootingTime);
    return Array.from(set).sort();
  }, [availableTimes, shootingTime]);

  const resolvedTimeHint =
    timeHint ||
    (slotsLoading
      ? '載入時段中…'
      : slotsError
        ? '無法載入可預約時段，請改選日期或服務人員'
        : !isoDate || !staff
          ? '請先選擇拍攝日期與服務人員'
          : timeOptions.length
            ? '請選擇拍攝時間'
            : '此日期無可預約時段');

  return (
    <>
      <FormField
        fieldId={dateFieldId}
        label="拍攝日期"
        required
        hint={dateHint || '預約即為拍攝日期'}
        error={dateError}
      >
        <input
          type="date"
          value={isoDate}
          min={minDate}
          max={maxDate}
          onChange={(e) => {
            onDateTouch?.();
            onChange({
              shootingDate: parseDateParts(e.target.value),
              shootingTime: '',
            });
          }}
        />
      </FormField>
      <FormField
        fieldId={timeFieldId}
        label="拍攝時間"
        required
        hint={resolvedTimeHint}
        error={timeError}
      >
        <select
          value={shootingTime}
          disabled={!isoDate || !staff || slotsLoading || !timeOptions.length}
          onChange={(e) => {
            onTimeTouch?.();
            onChange({ shootingDate, shootingTime: e.target.value });
          }}
        >
          <option value="">請選擇</option>
          {timeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </FormField>
    </>
  );
}
