import { NextRequest, NextResponse } from 'next/server';
import {
  BOOKING_STATUS_CANCELLED,
  buildBookingLogLabel,
  canCancelBooking,
  isBookingLocked,
} from '@/lib/admin/bookings';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { loadBookingConfig } from '@/lib/booking/config';
import { sendBookingCancelledEmails } from '@/lib/mail/booking-emails';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select(
        'id, booking_date, booking_time, staff_name, service, headcount, customer_name, gender, phone, email, note, status',
      )
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!booking) throw new Error('找不到這筆預約');
    if (isBookingLocked(booking.status)) {
      throw new Error('此預約已結案或已結束，無法再修改');
    }
    if (!canCancelBooking(booking.status)) {
      throw new Error('待確認的預約請使用拒絕');
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: BOOKING_STATUS_CANCELLED })
      .eq('id', id);
    if (updateError) throw new Error(updateError.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '取消預約',
      summary: buildBookingLogLabel(booking),
      detail: `預約 ID：${booking.id}`,
    });

    const config = await loadBookingConfig();
    const mailResult = await sendBookingCancelledEmails(
      config.shopName,
      config.shopEmail,
      {
        date: booking.booking_date,
        time: booking.booking_time,
        staff: booking.staff_name,
        service: booking.service,
        headcount: booking.headcount,
        name: booking.customer_name,
        gender: booking.gender || '',
        phone: booking.phone,
        email: booking.email || '',
        note: booking.note || '',
      },
    );

    let message = '已取消，並已寄信通知客人';
    if (!mailResult.customer && !mailResult.shop) {
      message = '已取消。（Email 尚未設定或寄信失敗）';
    }

    return NextResponse.json({
      ok: true,
      message,
      status: BOOKING_STATUS_CANCELLED,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '取消失敗' },
      { status: 400 },
    );
  }
}
