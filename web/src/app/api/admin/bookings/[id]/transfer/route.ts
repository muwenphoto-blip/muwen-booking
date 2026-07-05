import { NextRequest, NextResponse } from 'next/server';
import {
  buildBookingLogLabel,
  canTransferBooking,
  isBookingLocked,
} from '@/lib/admin/bookings';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { loadBookingConfig } from '@/lib/booking/config';
import { sendBookingTransferEmail } from '@/lib/mail/booking-emails';
import { assertActivePhotographerName, getStaffNotifyEmailByName } from '@/lib/mail/staff-notify';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const { id } = await context.params;
    const newStaff = await assertActivePhotographerName(String((await request.json()).newStaff || ''));

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
    if (!canTransferBooking(booking.status, booking.staff_name)) {
      throw new Error('此預約無法轉單');
    }

    const oldStaff = String(booking.staff_name || '').trim();
    if (oldStaff === newStaff) {
      throw new Error(`已是「${newStaff}」，無需轉單`);
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ staff_name: newStaff })
      .eq('id', id);
    if (updateError) throw new Error(updateError.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '轉單',
      summary: `${buildBookingLogLabel(booking)}：${oldStaff} → ${newStaff}`,
      detail: `預約 ID：${booking.id}`,
    });

    const config = await loadBookingConfig();
    const staffNotifyEmail = await getStaffNotifyEmailByName(newStaff);
    const mailResult = await sendBookingTransferEmail(
      config.shopName,
      {
        date: booking.booking_date,
        time: booking.booking_time,
        staff: newStaff,
        service: booking.service,
        headcount: booking.headcount,
        name: booking.customer_name,
        gender: booking.gender || '',
        phone: booking.phone,
        email: booking.email || '',
        note: booking.note || '',
      },
      oldStaff,
      staffNotifyEmail,
    );

    let message = `已轉單給「${newStaff}」`;
    if (staffNotifyEmail && !mailResult.staff) {
      message += '（攝影師通知信未能寄出）';
    } else if (!staffNotifyEmail) {
      message += '（新攝影師尚未填通知信箱）';
    }

    return NextResponse.json({
      ok: true,
      message,
      staff_name: newStaff,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '轉單失敗' },
      { status: 400 },
    );
  }
}
