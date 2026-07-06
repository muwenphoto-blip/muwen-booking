import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    if (!isManagerRole(session.role)) {
      return NextResponse.json({ error: '僅主控或副主控可重新開啟選片' }, { status: 403 });
    }

    const { bookingId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from('photo_deliveries')
      .update({
        selection_locked_at: null,
        selection_reopened: true,
        phase: 'selecting',
      })
      .eq('id', delivery.id);
    if (error) throw new Error(error.message);

    await supabase
      .from('delivery_photos')
      .update({ selection: 'keep' })
      .eq('delivery_id', delivery.id)
      .eq('kind', 'preview');

    return NextResponse.json({ ok: true, message: '已重新開啟選片' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 400 },
    );
  }
}
