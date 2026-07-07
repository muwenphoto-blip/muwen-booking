import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import { serviceOptionsFor } from '@/lib/admin/booking-documents';
import type { ServiceItem } from '@/lib/booking/types';
import { buildDocumentCustomerRules } from '@/lib/admin/document-form-validation';
import { runValidation, type ValidationRule } from '@/lib/form-validation';
import { normalizeCasePrefix } from '@/lib/booking/case-number';

function staffHasCasePrefix(name: string, staffCasePrefixes?: Record<string, string>): boolean {
  if (!staffCasePrefixes) return true;
  const prefix = normalizeCasePrefix(staffCasePrefixes[name] || '');
  return /^[A-Z]{2}$/.test(prefix);
}

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

export function validateWalkInFormFields(params: {
  date: string;
  staff: string;
  selectedTime: string;
  headcount: string;
  gender: string;
  document: BookingDocumentState;
  services: ServiceItem[];
  staffCasePrefixes?: Record<string, string>;
}): Record<string, string> {
  const doc = params.document;

  const rules: ValidationRule[] = [
    { fieldId: 'walk-in-date', label: '預約日期', value: params.date, required: true },
    { fieldId: 'walk-in-staff', label: '服務人員', value: params.staff, required: true },
    { fieldId: 'walk-in-headcount', label: '人數', value: params.headcount, required: true },
    { fieldId: 'walk-in-gender', label: '性別', value: params.gender, required: true },
    { fieldId: 'walk-in-slot', label: '可預約時段', value: params.selectedTime, required: true },
    { fieldId: 'doc-service', label: '服務項目', value: doc.service, required: true },
    ...buildDocumentCustomerRules(doc),
  ];

  const errors = runValidation(rules);

  if (params.staff && !staffHasCasePrefix(params.staff, params.staffCasePrefixes)) {
    errors['walk-in-staff'] =
      `攝影師「${params.staff}」尚未設定案號前綴，請至團隊管理編輯並儲存 2 碼英文前綴`;
  }

  const options = serviceOptionsFor(doc.service, params.services);
  if (options.length > 0 && !String(doc.serviceOption || '').trim()) {
    errors['doc-service-option'] = '請選擇方案／功能';
  }

  const email = String(doc.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors['doc-email'] = '請填寫正確的電子信箱';
  }

  const hasItem = hasFilledItemRow(doc.itemRows);
  if (!hasItem) {
    errors['doc-item-rows'] = '請至少填寫一筆服務明細';
  }

  return errors;
}

export function isWalkInFormComplete(params: {
  date: string;
  staff: string;
  selectedTime: string;
  headcount: string;
  gender: string;
  document: BookingDocumentState;
  services: ServiceItem[];
  staffCasePrefixes?: Record<string, string>;
}): boolean {
  return Object.keys(validateWalkInFormFields(params)).length === 0;
}

export type TeamHandlerOption = { value: string; label: string };

export function buildTeamHandlerOptions(data: {
  members?: {
    name: string;
    account: string;
    roleLabel: string;
    hasAccount: boolean;
    staffActive: boolean;
    accountActive: boolean;
  }[];
  storeAccounts?: { account: string; active: boolean }[];
}): TeamHandlerOption[] {
  const seen = new Set<string>();
  const options: TeamHandlerOption[] = [];

  for (const member of data.members ?? []) {
    const active = member.hasAccount ? member.accountActive : member.staffActive;
    if (!active) continue;

    const name = member.name?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      options.push({
        value: name,
        label: name,
      });
    }
  }

  for (const account of data.storeAccounts ?? []) {
    if (!account.active) continue;
    const value = account.account?.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      options.push({ value, label: value });
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}
