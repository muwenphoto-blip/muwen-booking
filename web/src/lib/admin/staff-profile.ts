export type StaffProfile = {
  staffId: string;
  legalName: string;
  phone: string;
  email: string;
  birthDate: string;
  idNumber: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  hiredOn: string;
  employmentType: string;
  notes: string;
};

export const EMPLOYMENT_TYPE_OPTIONS = ['正職', '兼職', '外包', '實習', '其他'] as const;

export function emptyStaffProfile(staffId: string): StaffProfile {
  return {
    staffId,
    legalName: '',
    phone: '',
    email: '',
    birthDate: '',
    idNumber: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    hiredOn: '',
    employmentType: '',
    notes: '',
  };
}

function normalizeDateInput(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('日期格式請使用 YYYY-MM-DD');
  }
  return text;
}

export function parseStaffProfileInput(staffId: string, body: Record<string, unknown>): StaffProfile {
  const email = String(body.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('私人信箱格式不正確');
  }

  const employmentType = String(body.employmentType ?? '').trim();
  if (employmentType && !EMPLOYMENT_TYPE_OPTIONS.includes(employmentType as (typeof EMPLOYMENT_TYPE_OPTIONS)[number])) {
    throw new Error('請選擇有效的僱用類型');
  }

  return {
    staffId,
    legalName: String(body.legalName ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
    email,
    birthDate: normalizeDateInput(body.birthDate),
    idNumber: String(body.idNumber ?? '').trim(),
    address: String(body.address ?? '').trim(),
    emergencyContact: String(body.emergencyContact ?? '').trim(),
    emergencyPhone: String(body.emergencyPhone ?? '').trim(),
    hiredOn: normalizeDateInput(body.hiredOn),
    employmentType,
    notes: String(body.notes ?? '').trim(),
  };
}

export function staffProfileHasData(profile: StaffProfile): boolean {
  return Boolean(
    profile.legalName ||
      profile.phone ||
      profile.email ||
      profile.birthDate ||
      profile.idNumber ||
      profile.address ||
      profile.emergencyContact ||
      profile.emergencyPhone ||
      profile.hiredOn ||
      profile.employmentType ||
      profile.notes,
  );
}

type StaffProfileRow = {
  staff_id: string;
  legal_name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  id_number: string;
  address: string;
  emergency_contact: string;
  emergency_phone: string;
  hired_on: string | null;
  employment_type: string;
  notes: string;
};

export function mapStaffProfileRow(row: StaffProfileRow): StaffProfile {
  return {
    staffId: row.staff_id,
    legalName: row.legal_name || '',
    phone: row.phone || '',
    email: row.email || '',
    birthDate: row.birth_date || '',
    idNumber: row.id_number || '',
    address: row.address || '',
    emergencyContact: row.emergency_contact || '',
    emergencyPhone: row.emergency_phone || '',
    hiredOn: row.hired_on || '',
    employmentType: row.employment_type || '',
    notes: row.notes || '',
  };
}

export function staffProfileToDb(profile: StaffProfile) {
  return {
    staff_id: profile.staffId,
    legal_name: profile.legalName,
    phone: profile.phone,
    email: profile.email,
    birth_date: profile.birthDate || null,
    id_number: profile.idNumber,
    address: profile.address,
    emergency_contact: profile.emergencyContact,
    emergency_phone: profile.emergencyPhone,
    hired_on: profile.hiredOn || null,
    employment_type: profile.employmentType,
    notes: profile.notes,
  };
}
