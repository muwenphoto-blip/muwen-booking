import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import {
  buildInitialDocumentState,
  emptyDateParts,
  parseBookingService,
  parseDateParts,
} from '@/lib/admin/booking-documents';
import type { ServiceItem } from '@/lib/booking/types';

type BookingRowForDocument = {
  case_number?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  phone_country?: string | null;
  email?: string | null;
  note?: string | null;
  service?: string | null;
  staff_name?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  document_data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasDateParts(parts: { year: string; month: string; day: string } | undefined): boolean {
  return Boolean(parts?.year && parts?.month && parts?.day);
}

function formatBookingPhone(booking: BookingRowForDocument): string {
  const phone = String(booking.phone || '').trim();
  const country = String(booking.phone_country || '').trim();
  if (!phone) return '';
  if (phone.startsWith('+') || phone.includes(' ')) return phone;
  if (country) return `${country} ${phone}`.trim();
  return phone;
}

function normalizeDocumentState(
  raw: Record<string, unknown>,
  services: ServiceItem[],
): BookingDocumentState {
  const state = { ...(raw as unknown as BookingDocumentState) };
  if (!Array.isArray(state.itemRows) || !state.itemRows.length) {
    state.itemRows = buildInitialDocumentState({
      caseNumber: '',
      customerName: '',
      phone: '',
      email: '',
      note: '',
      service: '',
      staffName: '',
      bookingDate: '',
      services,
    }).itemRows;
  }
  if (!Array.isArray(state.lineItems) || !state.lineItems.length) {
    state.lineItems = buildInitialDocumentState({
      caseNumber: '',
      customerName: '',
      phone: '',
      email: '',
      note: '',
      service: '',
      staffName: '',
      bookingDate: '',
      services,
    }).lineItems;
  }
  if (!Array.isArray(state.payments)) {
    state.payments = buildInitialDocumentState({
      caseNumber: '',
      customerName: '',
      phone: '',
      email: '',
      note: '',
      service: '',
      staffName: '',
      bookingDate: '',
      services,
    }).payments;
  }
  state.appointmentDate = state.appointmentDate || emptyDateParts();
  state.shootingDate = state.shootingDate || emptyDateParts();
  state.selectionDate = state.selectionDate || emptyDateParts();
  state.deliveryDate = state.deliveryDate || emptyDateParts();
  return state;
}

function mergeBookingIntoDocument(
  state: BookingDocumentState,
  booking: BookingRowForDocument,
  services: ServiceItem[],
  handlerName = '',
): BookingDocumentState {
  const parsed = parseBookingService(booking.service || state.service, services);
  const appointmentDate = hasDateParts(state.appointmentDate)
    ? state.appointmentDate
    : parseDateParts(booking.booking_date);
  const staffName = booking.staff_name && booking.staff_name !== '不指定' ? booking.staff_name : '';
  const appointmentContent =
    state.appointmentContent ||
    (parsed.option ? `${parsed.service}｜${parsed.option}` : parsed.service);
  const timeSuffix = booking.booking_time ? `｜${booking.booking_time}` : '';

  return {
    ...state,
    caseNumber: booking.case_number || state.caseNumber || '',
    customerName: state.customerName || booking.customer_name || '',
    phone: state.phone || formatBookingPhone(booking),
    email: state.email || booking.email || '',
    notes: state.notes || booking.note || '',
    service: state.service || parsed.service,
    serviceOption: state.serviceOption || parsed.option,
    photographer: state.photographer || staffName,
    handler: state.handler || handlerName || staffName,
    appointmentDate,
    shootingDate: hasDateParts(state.shootingDate) ? state.shootingDate : { ...appointmentDate },
    appointmentContent: appointmentContent
      ? timeSuffix && !appointmentContent.includes(booking.booking_time || '｜')
        ? `${appointmentContent}${timeSuffix}`
        : appointmentContent
      : booking.booking_time || '',
  };
}

export function loadBookingDocumentState(
  booking: BookingRowForDocument,
  services: ServiceItem[],
  handlerName = '',
): BookingDocumentState {
  if (isRecord(booking.document_data)) {
    const stored = normalizeDocumentState(booking.document_data, services);
    return mergeBookingIntoDocument(stored, booking, services, handlerName);
  }

  return buildInitialDocumentState({
    caseNumber: booking.case_number || '',
    customerName: booking.customer_name || '',
    phone: formatBookingPhone(booking),
    email: booking.email || '',
    note: booking.note || '',
    service: booking.service || '',
    staffName: booking.staff_name || '',
    bookingDate: booking.booking_date || '',
    services,
    handlerName,
  });
}

export function serializeBookingDocumentState(state: BookingDocumentState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

export function applyBookingSlotToDocument(
  state: BookingDocumentState,
  input: {
    date: string;
    time: string;
    staff: string;
  },
): BookingDocumentState {
  const appointmentDate = parseDateParts(input.date);
  const appointmentContent =
    state.appointmentContent ||
    (state.serviceOption ? `${state.service}｜${state.serviceOption}` : state.service);
  return {
    ...state,
    appointmentDate,
    photographer: input.staff,
    appointmentContent: appointmentContent
      ? `${appointmentContent}｜${input.time}`
      : input.time,
  };
}

export function buildEmptyWalkInDocument(services: ServiceItem[]): BookingDocumentState {
  return buildInitialDocumentState({
    caseNumber: '',
    customerName: '',
    phone: '',
    email: '',
    note: '',
    service: services[0]?.name || '',
    staffName: '',
    bookingDate: '',
    services,
  });
}

export function formatBookingServiceFromDocument(state: BookingDocumentState): string {
  const service = String(state.service || '').trim();
  const option = String(state.serviceOption || '').trim();
  if (!service) return '';
  if (option) return `${service}／${option}`;
  return service;
}

export function formatBookingNoteFromDocument(state: BookingDocumentState): string {
  const parts = [state.notes, state.remarks].map((text) => String(text || '').trim()).filter(Boolean);
  return parts.join('｜');
}
