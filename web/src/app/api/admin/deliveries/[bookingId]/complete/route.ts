import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { syncTransactionsFromDocument } from '@/lib/admin/finance';
import { loadBookingDocumentState } from '@/lib/admin/booking-document-store';
import { loadBookingConfig } from '@/lib/booking/config';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/supabase/errors';

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    if (!isManagerRole(session.role)) {
      return NextResponse.json({ error: '僅主控或副主控可標記交片完成' }, { status: 403 });
    }

    const { bookingId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');
    if (!delivery.finals_started_at) {
      throw new Error('請先上傳成品後再標記交片完成');
    }
    if (delivery.completed_at) {
      return NextResponse.json({ ok: true, message: '交片已標記完成' });
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from('photo_deliveries')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', delivery.id);
    if (error) {
      if (isMissingColumnError(error.message, 'completed_at')) {
        throw new Error('請至 Supabase 執行 supabase/photo-delivery-v2.sql 以啟用交片完成功能');
      }
      throw new Error(error.message);
    }

    try {
      const config = await loadBookingConfig();
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, case_number, customer_name, phone, email, note, service, staff_name, booking_date, booking_time, document_data')
        .eq('id', bookingId)
        .maybeSingle();
      if (booking?.document_data) {
        const document = loadBookingDocumentState(booking, config.services, '');
        await syncTransactionsFromDocument(
          bookingId,
          booking.case_number || '',
          document,
          session.account,
          config.services,
        );
      }
    } catch {
      // transactions table may not exist yet
    }

    return NextResponse.json({
      ok: true,
      message: '已標記交片完成，選片結果 ZIP 已關閉',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 400 },
    );
  }
}
