import { NextResponse } from 'next/server';
import { canRemoveBooking } from '@/lib/admin/bookings';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
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
      .select('id, customer_name, booking_date, booking_time, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!booking) throw new Error('找不到這筆預約');
    if (!canRemoveBooking(booking.status)) {
      throw new Error('僅「已取消」或「已拒絕」可移除');
    }

    const { error: removeError } = await supabase.from('bookings').delete().eq('id', id);
    if (removeError) throw new Error(removeError.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '移除預約',
      summary: `${booking.booking_date} ${booking.booking_time}｜${booking.customer_name || '（未填姓名）'}`,
      detail: `預約 ID：${booking.id}｜原狀態 ${booking.status}`,
    });

    return NextResponse.json({ ok: true, message: '已移除預約' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '移除失敗' },
      { status: 400 },
    );
  }
}
