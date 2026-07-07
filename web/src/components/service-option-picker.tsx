'use client';

type Option = { value: string; label: string };

type ServiceOptionPickerProps = {
  value: string;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
};

function splitOptionLabel(opt: Option): { primary: string; secondary: string } {
  const value = String(opt.value || '').trim();
  const label = String(opt.label || '').trim();
  if (!label || label === value) return { primary: value, secondary: '' };
  if (label.startsWith(value)) {
    return { primary: value, secondary: label.slice(value.length).trim() };
  }
  return { primary: label, secondary: '' };
}

export function ServiceOptionPicker({
  value,
  options,
  placeholder = '請選擇',
  disabled = false,
  onChange,
  onBlur,
}: ServiceOptionPickerProps) {
  if (!options.length) {
    return <p className="admin-muted booking-doc-option-picker-empty">此服務無子方案</p>;
  }

  const selected = options.find((opt) => opt.value === value);
  const legacy = value && !selected ? { value, label: value } : null;

  return (
    <div
      className={['booking-doc-option-picker', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-disabled={disabled || undefined}
    >
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        disabled={disabled}
        className={['booking-doc-option-picker__item', !value ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={() => onChange('')}
        onBlur={onBlur}
      >
        <span className="booking-doc-option-picker__primary">{placeholder}</span>
      </button>

      {legacy ? (
        <button
          type="button"
          role="radio"
          aria-checked
          disabled={disabled}
          className="booking-doc-option-picker__item is-selected"
          onClick={() => onChange(legacy.value)}
          onBlur={onBlur}
        >
          <span className="booking-doc-option-picker__primary">{legacy.value}</span>
        </button>
      ) : null}

      {options.map((opt) => {
        const { primary, secondary } = splitOptionLabel(opt);
        const isSelected = value === opt.value;
        return (
          <button
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            className={['booking-doc-option-picker__item', isSelected ? 'is-selected' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(opt.value)}
            onBlur={onBlur}
          >
            <span className="booking-doc-option-picker__primary">{primary}</span>
            {secondary ? (
              <span className="booking-doc-option-picker__secondary">{secondary}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
