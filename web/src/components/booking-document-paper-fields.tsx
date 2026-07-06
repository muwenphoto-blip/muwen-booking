'use client';

import type { DateParts } from '@/lib/admin/booking-documents';
import { formatDateParts } from '@/components/booking-document-shared';

export function PaperField({
  value,
  editable,
  onChange,
  className,
}: {
  value: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  className?: string;
}) {
  if (editable && onChange) {
    return (
      <input
        type="text"
        className={`booking-doc-paper-field${className ? ` ${className}` : ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  const text = value === '' ? '\u00A0' : value;
  return <span className="booking-doc-pv">{text}</span>;
}

export function PaperDateField({
  value,
  editable,
  onChange,
}: {
  value: DateParts;
  editable?: boolean;
  onChange?: (next: DateParts) => void;
}) {
  if (editable && onChange) {
    return (
      <span className="booking-doc-paper-date">
        <input
          type="text"
          inputMode="numeric"
          className="booking-doc-paper-field booking-doc-paper-field--date"
          value={value.year}
          placeholder="年"
          onChange={(event) => onChange({ ...value, year: event.target.value })}
        />
        <span className="booking-doc-paper-date-unit">年</span>
        <input
          type="text"
          inputMode="numeric"
          className="booking-doc-paper-field booking-doc-paper-field--date"
          value={value.month}
          placeholder="月"
          onChange={(event) => onChange({ ...value, month: event.target.value })}
        />
        <span className="booking-doc-paper-date-unit">月</span>
        <input
          type="text"
          inputMode="numeric"
          className="booking-doc-paper-field booking-doc-paper-field--date"
          value={value.day}
          placeholder="日"
          onChange={(event) => onChange({ ...value, day: event.target.value })}
        />
        <span className="booking-doc-paper-date-unit">日</span>
      </span>
    );
  }
  return <span className="booking-doc-pv">{formatDateParts(value)}</span>;
}

export function PaperCheckField({
  label,
  checked,
  editable,
  onChange,
}: {
  label: string;
  checked: boolean;
  editable?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  if (editable && onChange) {
    return (
      <label className="booking-doc-paper-check">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (!checked) return null;
  return <span className="booking-doc-pv">{label}</span>;
}
