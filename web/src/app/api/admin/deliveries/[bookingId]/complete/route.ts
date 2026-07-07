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
    if (error) throw new Error(error.message);

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
