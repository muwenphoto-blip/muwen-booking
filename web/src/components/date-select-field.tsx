'use client';

import {
  buildIsoDate,
  dayOptions,
  MONTH_OPTIONS,
  parseIsoDate,
  yearRange,
} from '@/lib/booking/date-select';

type DateSelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  minYear: number;
  maxYear: number;
  idPrefix: string;
};

export function DateSelectField({
  value,
  onChange,
  minYear,
  maxYear,
  idPrefix,
}: DateSelectFieldProps) {
  const parts = parseIsoDate(value);
  const years = yearRange(minYear, maxYear);
  const days = dayOptions(parts.year, parts.month);

  function update(part: 'year' | 'month' | 'day', next: string) {
    const nextParts = { ...parts, [part]: next };
    if (part === 'year' || part === 'month') {
      const maxDay = dayOptions(nextParts.year, nextParts.month).length;
      if (nextParts.day && parseInt(nextParts.day, 10) > maxDay) {
        nextParts.day = String(maxDay);
      }
    }
    onChange(buildIsoDate(nextParts.year, nextParts.month, nextParts.day));
  }

  function clearDate() {
    onChange('');
  }

  return (
    <div className="admin-date-select">
      <select
        id={`${idPrefix}-year`}
        className="admin-date-select-part"
        value={parts.year}
        onChange={(e) => update('year', e.target.value)}
        aria-label="年"
      >
        <option value="">年</option>
        {years.map((year) => (
          <option key={year} value={String(year)}>
            {year} 年
          </option>
        ))}
      </select>
      <select
        id={`${idPrefix}-month`}
        className="admin-date-select-part"
        value={parts.month}
        onChange={(e) => update('month', e.target.value)}
        aria-label="月"
      >
        <option value="">月</option>
        {MONTH_OPTIONS.map((month) => (
          <option key={month} value={String(month)}>
            {month} 月
          </option>
        ))}
      </select>
      <select
        id={`${idPrefix}-day`}
        className="admin-date-select-part"
        value={parts.day}
        onChange={(e) => update('day', e.target.value)}
        aria-label="日"
      >
        <option value="">日</option>
        {days.map((day) => (
          <option key={day} value={String(day)}>
            {day} 日
          </option>
        ))}
      </select>
      {value ? (
        <button type="button" className="admin-date-clear" onClick={clearDate}>
          清除
        </button>
      ) : null}
    </div>
  );
}
