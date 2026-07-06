export type ValidationRule = {
  fieldId: string;
  label: string;
  value: string;
  required?: boolean;
  minLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  validate?: (value: string) => string | null;
};

export function runValidation(rules: ValidationRule[]): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const rule of rules) {
    const trimmed = String(rule.value ?? '').trim();

    if (rule.required && !trimmed) {
      errors[rule.fieldId] = `請填寫${rule.label}`;
      continue;
    }

    if (!trimmed) continue;

    if (rule.minLength && trimmed.length < rule.minLength) {
      errors[rule.fieldId] = `${rule.label}至少需 ${rule.minLength} 字`;
      continue;
    }

    if (rule.pattern && !rule.pattern.test(trimmed)) {
      errors[rule.fieldId] = rule.patternMessage || `${rule.label}格式不正確`;
      continue;
    }

    if (rule.validate) {
      const message = rule.validate(trimmed);
      if (message) errors[rule.fieldId] = message;
    }
  }

  return errors;
}

export function focusFirstInvalid(errors: Record<string, string>) {
  const firstId = Object.keys(errors)[0];
  if (!firstId) return;

  const el = document.getElementById(firstId);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const focusable = el.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([readonly]), select:not([disabled]), textarea:not([readonly])',
  );
  focusable?.focus({ preventScroll: true });
}

export function validateFieldOnBlur(rule: ValidationRule): string | null {
  const trimmed = String(rule.value ?? '').trim();

  if (rule.required && !trimmed) {
    return '必填';
  }

  if (!trimmed) return null;

  if (rule.minLength && trimmed.length < rule.minLength) {
    return `${rule.label}至少需 ${rule.minLength} 字`;
  }

  if (rule.pattern && !rule.pattern.test(trimmed)) {
    return rule.patternMessage || `${rule.label}格式不正確`;
  }

  if (rule.validate) {
    return rule.validate(trimmed);
  }

  return null;
}

export function clearFieldError(
  errors: Record<string, string>,
  fieldId: string,
): Record<string, string> {
  if (!errors[fieldId]) return errors;
  const next = { ...errors };
  delete next[fieldId];
  return next;
}
