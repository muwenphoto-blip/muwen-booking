import { getPhoneCountryRule, type PhoneCountryRule } from '@/lib/booking/phone-countries';

function buildPhoneLengthError(rule: PhoneCountryRule): string {
  if (rule.min === rule.max) {
    return `請填寫正確的${rule.name}電話（${rule.min} 碼）`;
  }
  return `請填寫正確的${rule.name}電話（${rule.min}-${rule.max} 碼）`;
}

function validateNationalPhone(national: string, rule: PhoneCountryRule) {
  if (!/^\d+$/.test(national)) {
    throw new Error('電話只能輸入數字');
  }
  if (national.length < rule.min || national.length > rule.max) {
    throw new Error(buildPhoneLengthError(rule));
  }
  if (rule.prefix && !national.startsWith(rule.prefix)) {
    throw new Error(`請填寫正確的${rule.name}電話`);
  }
}

export function normalizePhone(rawPhone: string, countryCode: string): string {
  const rule = getPhoneCountryRule(countryCode);
  let raw = String(rawPhone || '').replace(/[\s\-().]/g, '');
  if (!raw) throw new Error('請填寫電話');

  const codeDigits = rule.code.replace('+', '');
  if (raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '');
    if (!digits.startsWith(codeDigits)) {
      throw new Error('國碼與所選國家不符');
    }
    const national = digits.slice(codeDigits.length);
    validateNationalPhone(national, rule);
    return `+${digits}`;
  }

  if (raw.startsWith(codeDigits) && raw.length > codeDigits.length + 2) {
    raw = raw.slice(codeDigits.length);
  }
  if (rule.stripZero && raw.startsWith('0')) {
    raw = raw.slice(1);
  }
  validateNationalPhone(raw, rule);
  return rule.code + raw;
}

export function formatPhoneDisplay(phone: string, countryCode: string): string {
  const normalized = normalizePhone(phone, countryCode);
  return normalized;
}
