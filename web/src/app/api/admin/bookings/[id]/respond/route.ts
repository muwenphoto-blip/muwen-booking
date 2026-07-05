import { NextRequest, NextResponse } from 'next/server';
import {
  BOOKING_STATUS_ACCEPTED,
  BOOKING_STATUS_PENDING,
  BOOKING_STATUS_REJECTED,
  buildBookingLogLabel,
  canRespondToBooking,
} from '@/lib/admin/bookings';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { loadBookingConfig } from '@/lib/booking/config';
import { sendBookingDecisionEmails } from '@/lib/mail/booking-emails';
import { assertActivePhotographerName, getStaffNotifyEmailByName } from '@/lib/mail/staff-notify';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const decision = String(body.decision || '').trim();
    if (decision !== 'accept' && decision !== 'reject') {
      throw new Error('無效的操作');
    }

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
    if (booking.status !== BOOKING_STATUS_PENDING) {
      throw new Error('此預約已處理');
    }
    if (!canRespondToBooking(session, booking.staff_name)) {
      throw new Error('您沒有權限處理此預約');
    }

    let finalStaff = booking.staff_name;
    let assignedOnAccept = false;

    if (decision === 'accept' && booking.staff_name === '不指定') {
      if (!isManagerRole(session.role)) {
        throw new Error('「不指定」預約請由主控或副主控指派攝影師後接受');
      }
      finalStaff = await assertActivePhotographerName(String(body.assignStaff || ''));
      assignedOnAccept = true;
    }

    const nextStatus = decision === 'accept' ? BOOKING_STATUS_ACCEPTED : BOOKING_STATUS_REJECTED;
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: nextStatus,
        staff_name: finalStaff,
      })
      .eq('id', id);

    if (updateError) throw new Error(updateError.message);

    const action = decision === 'accept' ? '接受預約' : '拒絕預約';
    const summary = buildBookingLogLabel(booking);
    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action,
      summary,
      detail: assignedOnAccept
        ? `預約 ID：${booking.id}｜指派給 ${finalStaff}`
        : `預約 ID：${booking.id}`,
    });

    const config = await loadBookingConfig();
    const staffNotifyEmail = await getStaffNotifyEmailByName(finalStaff);
    const emailPayload = {
      date: booking.booking_date,
      time: booking.booking_time,
      staff: finalStaff,
      service: booking.service,
      headcount: booking.headcount,
      name: booking.customer_name,
      gender: booking.gender || '',
      phone: booking.phone,
      email: booking.email || '',
      note: booking.note || '',
    };

    const mailResult = await sendBookingDecisionEmails(
      config.shopName,
      config.shopEmail,
      emailPayload,
      decision,
      staffNotifyEmail,
      { assignedOnAccept },
    );

    let message =
      decision === 'accept'
        ? assignedOnAccept
          ? `已接受並指派給「${finalStaff}」，通知信已寄出。`
          : '已接受預約，通知信已寄出。'
        : '已拒絕預約，時段已釋出，通知信已寄出。';
    if (!mailResult.customer && !mailResult.shop) {
      message =
        decision === 'accept'
          ? assignedOnAccept
            ? `已接受並指派給「${finalStaff}」。（Email 尚未設定或寄信失敗）`
            : '已接受預約。（Email 尚未設定或寄信失敗）'
          : '已拒絕預約，時段已釋出。（Email 尚未設定或寄信失敗）';
    } else if (decision === 'accept' && finalStaff !== '不指定' && !staffNotifyEmail) {
      message += '（該攝影師尚未填通知信箱，僅寄給客人與店裡）';
    } else if (decision === 'accept' && finalStaff !== '不指定' && !mailResult.staff && staffNotifyEmail) {
      message += '（攝影師通知信未能寄出）';
    }

    return NextResponse.json({
      ok: true,
      message,
      status: nextStatus,
      staff_name: finalStaff,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 400 },
    );
  }
}
