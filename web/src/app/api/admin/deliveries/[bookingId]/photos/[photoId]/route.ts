import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string; photoId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    if (!isManagerRole(session.role)) {
      return NextResponse.json({ error: '僅主控或副主控可刪除' }, { status: 403 });
    }

    const { bookingId, photoId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');

    const supabase = createAdminSupabaseClient();
    const { data: photo, error: photoError } = await supabase
      .from('delivery_photos')
      .select('id, storage_path, delivery_id')
      .eq('id', photoId)
      .eq('delivery_id', delivery.id)
      .maybeSingle();
    if (photoError) throw new Error(photoError.message);
    if (!photo) throw new Error('找不到照片');

    await supabase.storage.from(DELIVERY_STORAGE_BUCKET).remove([photo.storage_path]);
    const { error: deleteError } = await supabase.from('delivery_photos').delete().eq('id', photoId);
    if (deleteError) throw new Error(deleteError.message);

    const { count } = await supabase
      .from('delivery_photos')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_id', delivery.id)
      .eq('kind', 'final');

    if ((count ?? 0) === 0 && delivery.finals_started_at) {
      await supabase
        .from('photo_deliveries')
        .update({
          finals_started_at: null,
          final_expires_at: null,
          phase: 'selecting',
        })
        .eq('id', delivery.id);
    }

    return NextResponse.json({ ok: true, message: '已刪除' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
