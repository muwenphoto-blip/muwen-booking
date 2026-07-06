import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    if (!isManagerRole(session.role)) {
      return NextResponse.json({ error: '僅主控或副主控可刪除' }, { status: 403 });
    }

    const { bookingId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');

    const supabase = createAdminSupabaseClient();
    const { data: photos, error: photoError } = await supabase
      .from('delivery_photos')
      .select('id, storage_path')
      .eq('delivery_id', delivery.id)
      .eq('kind', 'preview');
    if (photoError) throw new Error(photoError.message);

    const rows = photos ?? [];
    if (!rows.length) {
      return NextResponse.json({ ok: true, message: '沒有預覽圖可刪除', deleted: 0 });
    }

    const paths = rows.map((row) => row.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from(DELIVERY_STORAGE_BUCKET)
        .remove(paths);
      if (storageError) throw new Error(storageError.message);
    }

    const { error: deleteError } = await supabase
      .from('delivery_photos')
      .delete()
      .eq('delivery_id', delivery.id)
      .eq('kind', 'preview');
    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({
      ok: true,
      message: `已刪除 ${rows.length} 張預覽圖`,
      deleted: rows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
