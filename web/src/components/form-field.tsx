'use client';

import type { ReactNode } from 'react';

type FormFieldProps = {
  fieldId: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  variant?: 'admin' | 'booking';
  as?: 'label' | 'div';
  children: ReactNode;
};

export function FormField({
  fieldId,
  label,
  required = false,
  optional = false,
  hint,
  error,
  className,
  variant = 'admin',
  as = 'label',
  children,
}: FormFieldProps) {
  const Tag = as;
  const baseClass = variant === 'booking' ? 'booking-field' : 'admin-field';

  return (
    <Tag
      id={fieldId}
      className={[
        baseClass,
        error ? `${baseClass}--invalid` : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={`${baseClass}-label`}>
        {label}
        {required ? (
          <abbr className={`${baseClass}-required`} title="必填">
            *
          </abbr>
        ) : null}
        {optional ? <span className={`${baseClass}-optional`}>（選填）</span> : null}
      </span>
      {hint ? <small className={`${baseClass}-hint`}>{hint}</small> : null}
      {children}
      {error ? (
        <small className={`${baseClass}-error`} role="alert">
          {error}
        </small>
      ) : null}
    </Tag>
  );
}
