import { NextResponse } from 'next/server';
import {
  canCancelBooking,
  canCloseBooking,
  canRespondToBooking,
  canTransferBooking,
  isStaffInactive,
} from '@/lib/admin/bookings';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { listActivePhotographerNames } from '@/lib/mail/staff-notify';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    let query = supabase
      .from('bookings')
      .select(
        'id, created_at, booking_date, booking_time, staff_name, service, customer_name, phone, email, status',
      )
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (!isManagerRole(session.role)) {
      const mine = session.photographerName || session.account;
      query = query.eq('staff_name', mine);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const manager = isManagerRole(session.role);
    const staffOptions = manager ? await listActivePhotographerNames() : [];
    const activeSet = new Set(staffOptions);

    const bookings = (data ?? []).map((row) => {
      const canRespond = row.status === '待確認' && canRespondToBooking(session, row.staff_name);
      const staffInactive = isStaffInactive(row.staff_name, activeSet);
      return {
        ...row,
        canRespond,
        needsStaffAssign: canRespond && manager && row.staff_name === '不指定',
        staffInactive,
        canTransfer: manager && canTransferBooking(row.status, row.staff_name),
        canClose: manager && canCloseBooking(row.status),
        canCancel: manager && canCancelBooking(row.status),
      };
    });

    return NextResponse.json({ bookings, staffOptions, isManager: manager });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入預約' },
      { status: 400 },
    );
  }
}
