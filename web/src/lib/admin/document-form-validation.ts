import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import { serviceOptionsFor } from '@/lib/admin/booking-documents';
import type { ServiceItem } from '@/lib/booking/types';
import { runValidation, validateFieldOnBlur, type ValidationRule } from '@/lib/form-validation';

function hasFilledItemRow(rows: BookingDocumentState['itemRows']): boolean {
  return rows.some((row) =>
    Boolean(
      row.serviceContent ||
        row.packageChoice ||
        row.price ||
        row.discount ||
        row.itemTotal ||
        row.quantity,
    ),
  );
}

export function buildDocumentCustomerRules(state: BookingDocumentState): ValidationRule[] {
  return [
    {
      fieldId: 'doc-customer-name',
      label: '姓名',
      value: state.customerName,
      required: true,
      minLength: 2,
    },
    {
      fieldId: 'doc-phone',
      label: '電話',
      value: state.phone,
      required: true,
      minLength: 6,
    },
    { fieldId: 'doc-email', label: 'Email', value: state.email, required: true },
    { fieldId: 'doc-line-id', label: 'Line ID', value: state.lineId, required: false },
    { fieldId: 'doc-address', label: '地址', value: state.address, required: true },
    {
      fieldId: 'doc-emergency-name',
      label: '緊急聯絡人姓名',
      value: state.emergencyContactName,
      required: false,
    },
    {
      fieldId: 'doc-emergency-phone',
      label: '緊急聯絡人電話',
      value: state.emergencyContactPhone,
      required: false,
    },
    { fieldId: 'doc-handler', label: '經手人', value: state.handler, required: true },
  ];
}

export function buildDocumentFieldRule(
  fieldId: string,
  state: BookingDocumentState,
  services: ServiceItem[],
): ValidationRule | null {
  const customerRule = buildDocumentCustomerRules(state).find((rule) => rule.fieldId === fieldId);
  if (customerRule) return customerRule;

  if (fieldId === 'doc-service') {
    return { fieldId, label: '服務項目', value: state.service, required: true };
  }

  if (fieldId === 'doc-service-option') {
    const options = serviceOptionsFor(state.service, services);
    if (options.length === 0) return null;
    return { fieldId, label: '服務方案', value: state.serviceOption, required: true };
  }

  return null;
}

export function validateDocumentFieldOnBlur(
  fieldId: string,
  params: { document: BookingDocumentState; services: ServiceItem[] },
): string | null {
  const rule = buildDocumentFieldRule(fieldId, params.document, params.services);
  if (!rule) return null;

  const message = validateFieldOnBlur(rule);
  if (message) return message;

  if (fieldId === 'doc-email') {
    const email = String(params.document.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return '請填寫正確的電子信箱';
    }
  }

  return null;
}

export function validateDocumentCustomerFields(
  state: BookingDocumentState,
  services: ServiceItem[],
): Record<string, string> {
  const errors = runValidation(buildDocumentCustomerRules(state));

  if (!String(state.service || '').trim()) {
    errors['doc-service'] = '請填寫服務項目';
  }

  const options = serviceOptionsFor(state.service, services);
  if (options.length > 0 && !String(state.serviceOption || '').trim()) {
    errors['doc-service-option'] = '請選擇方案／功能';
  }

  const email = String(state.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors['doc-email'] = '請填寫正確的電子信箱';
  }

  return errors;
}

export function validateDocumentFormFields(
  state: BookingDocumentState,
  services: ServiceItem[],
): Record<string, string> {
  const errors = validateDocumentCustomerFields(state, services);

  if (!hasFilledItemRow(state.itemRows)) {
    errors['doc-item-rows'] = '請至少填寫一筆服務明細';
  }

  return errors;
}

export function isDocumentFormComplete(
  state: BookingDocumentState,
  services: ServiceItem[],
): boolean {
  return Object.keys(validateDocumentFormFields(state, services)).length === 0;
}
