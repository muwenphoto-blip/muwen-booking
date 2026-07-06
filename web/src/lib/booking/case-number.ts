const CASE_PREFIX_PATTERN = /^[A-Z]{2}$/;
const CASE_NUMBER_PATTERN = /^[A-Z]{2}\d{1,5}$/;

export function normalizeCasePrefix(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
}

export function validateCasePrefix(raw: string): string {
  const prefix = normalizeCasePrefix(raw);
  if (!CASE_PREFIX_PATTERN.test(prefix)) {
    throw new Error('案號前綴須為 2 個英文字母（例如 XE、DJ）');
  }
  return prefix;
}

export function isValidBookingCaseNumber(value: string): boolean {
  return CASE_NUMBER_PATTERN.test(String(value || '').trim().toUpperCase());
}

export function buildSelectionZipFilename(options: {
  caseNumber: string;
  customerName: string;
  service: string;
  fallbackId: string;
}): string {
  const caseNo = sanitizeFilenamePart(options.caseNumber, 'CASE');
  const name = sanitizeFilenamePart(options.customerName, '客戶');
  const service = sanitizeFilenamePart(options.service.split('／')[0], '拍攝');
  const base = `${caseNo}_${name}_${service}`;
  if (base.replace(/_/g, '').length >= 3) return `${base}.zip`;
  return `選片_${options.fallbackId.slice(0, 8)}.zip`;
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}
