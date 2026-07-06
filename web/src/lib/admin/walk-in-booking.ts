import { buildBookingSlots } from '@/lib/booking/availability';
import type { BookingConfig } from '@/lib/booking/types';
import { normalizePhone } from '@/lib/booking/phone';
import { getPhoneCountryRule } from '@/lib/booking/phone-countries';
import { addDaysToDateKey, todayDateKey } from '@/lib/booking/time';
import { BOOKING_STATUS_CONFIRMED } from '@/lib/admin/bookings';
import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import {
  formatBookingNoteFromDocument,
  formatBookingServiceFromDocument,
} from '@/lib/admin/booking-document-store';

export type WalkInBookingPayload = {
  date: string;
  time: string;
  staff: string;
  service: string;
  headcount: string;
  name: string;
  gender: string;
  phone: string;
  phoneCountry?: string;
  email?: string;
  note?: string;
  document?: BookingDocumentState;
};

export type WalkInCreatePayload = {
  date: string;
  time: string;
  staff: string;
  headcount: string;
  gender: string;
  phoneCountry?: string;
  document: BookingDocumentState;
};

export const WALK_IN_NOTE_PREFIX = '[門市預約]';

export function assertWalkInDateWindow(dateStr: string, maxDaysAhead: number, timeZone = 'Asia/Taipei') {
  const today = todayDateKey(timeZone);
  const maxDate = addDaysToDateKey(today, maxDaysAhead);
  if (dateStr < today || dateStr > maxDate) {
    throw new Error('所選日期不在可預約範圍內');
  }
}

function resolveWalkInStaff(staff: string, staffOptions: string[]): string {
  const name = String(staff || '').trim();
  if (!name) throw new Error('請選擇服務人員');
  if (staffOptions.includes(name)) return name;
  throw new Error('請選擇有效的服務人員');
}

export function validateWalkInPayload(
  payload: WalkInBookingPayload,
  config: BookingConfig,
): WalkInBookingPayload {
  if (!payload || typeof payload !== 'object') throw new Error('資料格式錯誤');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) throw new Error('請選擇預約日期');
  assertWalkInDateWindow(String(payload.date), config.maxDaysAhead);
  if (!/^\d{2}:\d{2}$/.test(String(payload.time || ''))) throw new Error('請選擇預約時段');

  const staffNames = config.staff
    .map((item) => item.value)
    .filter((name) => name !== '不指定');
  payload.staff = resolveWalkInStaff(payload.staff, staffNames);

  const serviceName = String(payload.service || '').trim();
  const service = config.services.find((item) => item.name === serviceName.split('／')[0]);
  if (!service) throw new Error('請選擇服務項目');
  payload.service = serviceName;

  if (!config.headcountOptions.some((item) => item.value === String(payload.headcount))) {
    throw new Error('請選擇人數');
  }

  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('請填寫姓名');

  if (!config.genderOptions.some((item) => item.value === payload.gender)) {
    throw new Error('請選擇性別');
  }

  const country = String(payload.phoneCountry || '+886').trim();
  const rule = getPhoneCountryRule(country);
  const fullPhone = normalizePhone(payload.phone, country);
  payload.phoneCountry = rule.code;
  payload.phone = fullPhone.slice(rule.code.length);

  const email = String(payload.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('請填寫正確電子信箱，或留空');
  }

  const note = String(payload.note || '').trim();
  payload.name = name;
  payload.email = email;
  payload.note = note.startsWith(WALK_IN_NOTE_PREFIX)
    ? note
    : note
      ? `${WALK_IN_NOTE_PREFIX} ${note}`
      : WALK_IN_NOTE_PREFIX;

  return payload;
}

export function validateWalkInCreatePayload(
  body: WalkInCreatePayload,
  config: BookingConfig,
): WalkInBookingPayload & { document: BookingDocumentState } {
  if (!body?.document) throw new Error('請填寫登記資料');
  const document = body.document;

  const service = formatBookingServiceFromDocument(document);
  if (!service) throw new Error('請選擇服務項目');

  const name = String(document.customerName || '').trim();
  if (name.length < 2) throw new Error('請填寫姓名');

  const country = String(body.phoneCountry || '+886').trim();
  const rule = getPhoneCountryRule(country);
  const fullPhone = normalizePhone(document.phone, country);

  const email = String(document.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('請填寫正確電子信箱，或留空');
  }

  const noteBase = formatBookingNoteFromDocument(document);
  const note = noteBase.startsWith(WALK_IN_NOTE_PREFIX)
    ? noteBase
    : noteBase
      ? `${WALK_IN_NOTE_PREFIX} ${noteBase}`
      : WALK_IN_NOTE_PREFIX;

  const payload: WalkInBookingPayload = {
    date: body.date,
    time: body.time,
    staff: body.staff,
    service,
    headcount: body.headcount,
    name,
    gender: body.gender,
    phone: fullPhone.slice(rule.code.length),
    phoneCountry: rule.code,
    email,
    note,
  };

  const validated = validateWalkInPayload(payload, config);
  return { ...validated, document };
}

export async function assertWalkInSlotAvailable(
  payload: WalkInBookingPayload,
  config: BookingConfig,
  staffRows: { name: string; availability_schedule: string }[],
  counts: { booking_time: string; booking_count: number }[],
) {
  const bookedCounts: Record<string, number> = {};
  counts.forEach((row) => {
    bookedCounts[row.booking_time] = Number(row.booking_count) || 0;
  });

  const slots = buildBookingSlots({
    dateStr: payload.date,
    staff: payload.staff,
    openTime: config.openTime,
    closeTime: config.closeTime,
    slotMinutes: config.slotMinutes,
    maxPerSlot: config.maxPerSlot,
    openDays: config.openDays,
    bookedCounts,
    staffRows,
  });

  const selected = slots.find((slot) => slot.time === payload.time);
  if (!selected?.available) {
    throw new Error('此時段已額滿或不可預約，請重新選擇');
  }
}

export const WALK_IN_DEFAULT_STATUS = BOOKING_STATUS_CONFIRMED;
