import { NextRequest, NextResponse } from 'next/server';
import {
  BOOKING_STATUS_CLOSED,
  buildBookingLogLabel,
  canCloseBooking,
  isBookingLocked,
} from '@/lib/admin/bookings';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
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
      .select('id, booking_date, booking_time, customer_name, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!booking) throw new Error('找不到這筆預約');
    if (isBookingLocked(booking.status)) {
      throw new Error('此預約已結案或已結束，無法再修改');
    }
    if (!canCloseBooking(booking.status)) {
      throw new Error('僅已接受的預約可以結案');
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: BOOKING_STATUS_CLOSED })
      .eq('id', id);
    if (updateError) throw new Error(updateError.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '結案',
      summary: buildBookingLogLabel(booking),
      detail: `預約 ID：${booking.id}`,
    });

    return NextResponse.json({
      ok: true,
      message: '已結案，此筆預約將無法再修改。',
      status: BOOKING_STATUS_CLOSED,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '結案失敗' },
      { status: 400 },
    );
  }
}
