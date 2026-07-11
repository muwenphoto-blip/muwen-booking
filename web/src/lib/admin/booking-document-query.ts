import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError } from '@/lib/supabase/errors';

const BOOKING_DOCUMENT_BASE_SELECT =
  'id, case_number, booking_date, booking_time, staff_name, service, headcount, customer_name, phone, phone_country, email, note, status';

export type BookingDocumentRow = {
  id: string;
  case_number: string | null;
  booking_date: string | null;
  booking_time: string | null;
  staff_name: string | null;
  service: string | null;
  headcount: string | null;
  customer_name: string | null;
  phone: string | null;
  phone_country: string | null;
  email: string | null;
  note: string | null;
  status: string | null;
  document_data?: unknown;
};

export async function loadBookingDocumentRow(
  supabase: SupabaseClient,
  id: string,
): Promise<{ booking: BookingDocumentRow; documentColumnReady: boolean }> {
  const withDocument = await supabase
    .from('bookings')
    .select(`${BOOKING_DOCUMENT_BASE_SELECT}, document_data`)
    .eq('id', id)
    .maybeSingle();

  if (!withDocument.error && withDocument.data) {
    return {
      booking: withDocument.data as BookingDocumentRow,
      documentColumnReady: true,
    };
  }

  if (
    withDocument.error &&
    isMissingColumnError(withDocument.error.message, 'document_data')
  ) {
    const fallback = await supabase
      .from('bookings')
      .select(BOOKING_DOCUMENT_BASE_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    if (!fallback.data) throw new Error('找不到這筆預約');
    return {
      booking: fallback.data as BookingDocumentRow,
      documentColumnReady: false,
    };
  }

  if (withDocument.error) throw new Error(withDocument.error.message);
  throw new Error('找不到這筆預約');
}

export const DOCUMENT_DATA_SETUP_HINT =
  '請在 Supabase SQL Editor 執行 supabase/booking-document-data.sql，才能儲存與讀取完整案號文件。';
