'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DateParts } from '@/lib/admin/booking-documents';
import { formatDatePartsToIso, parseDateParts } from '@/lib/admin/booking-documents';
import type { BookingSlot } from '@/lib/booking/types';
import { generateSlots } from '@/lib/booking/time';
import { FormField } from '@/components/form-field';

export type ScheduleConfig = {
  openTime: string;
  closeTime: string;
  slotMinutes: number;
};

type ScheduleDateTimeFieldsProps = {
  dateFieldId?: string;
  timeFieldId?: string;
  dateLabel: string;
  timeLabel: string;
  dateParts: DateParts;
  time: string;
  scheduleConfig?: ScheduleConfig;
  optional?: boolean;
  onChange: (next: { dateParts: DateParts; time: string }) => void;
};

export function ScheduleDateTimeFields({
  dateFieldId,
  timeFieldId,
  dateLabel,
  timeLabel,
  dateParts,
  time,
  scheduleConfig,
  optional = true,
  onChange,
}: ScheduleDateTimeFieldsProps) {
  const isoDate = formatDatePartsToIso(dateParts);

  const timeOptions = useMemo(() => {
    if (!scheduleConfig) {
      return time ? [time] : [];
    }
    const slots = generateSlots(
      scheduleConfig.openTime || '10:00',
      scheduleConfig.closeTime || '18:00',
      scheduleConfig.slotMinutes || 30,
    );
    if (time && !slots.includes(time)) return [...slots, time].sort();
    return slots;
  }, [scheduleConfig, time]);

  return (
    <>
      <FormField fieldId={dateFieldId || 'schedule-date'} label={dateLabel} optional={optional}>
        <input
          type="date"
          value={isoDate}
          onChange={(e) =>
            onChange({
              dateParts: parseDateParts(e.target.value),
              time,
            })
          }
        />
      </FormField>
      <FormField
        fieldId={timeFieldId || 'schedule-time'}
        label={timeLabel}
        optional={optional}
        hint={timeOptions.length ? undefined : '請先設定營業時間'}
      >
        <select
          value={time}
          disabled={!timeOptions.length}
          onChange={(e) =>
            onChange({
              dateParts,
              time: e.target.value,
            })
          }
        >
          <option value="">請選擇</option>
          {timeOptions.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </FormField>
    </>
  );
}

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
