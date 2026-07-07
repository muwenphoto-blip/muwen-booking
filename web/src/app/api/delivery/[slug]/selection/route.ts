import { NextRequest, NextResponse } from 'next/server';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { isSelectionOpen } from '@/lib/delivery/access';
import { validateSelectionNote } from '@/lib/delivery/selection-export';
import { getDeliveryGuestSession, loadDeliveryBySlug } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/supabase/errors';

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const guest = await getDeliveryGuestSession();
    if (!guest || guest.slug !== slug) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const delivery = await loadDeliveryBySlug(slug);
    if (!delivery || delivery.id !== guest.deliveryId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }
    if (!delivery.password_changed) {
      return NextResponse.json({ error: '請先修改密碼' }, { status: 401 });
    }
    if (!isSelectionOpen(delivery)) {
      throw new Error('選片已結束');
    }

    const body = await request.json();
    const action = String(body.action || '').trim();
    const supabase = createAdminSupabaseClient();

    if (action === 'setNote') {
      const photoId = String(body.photoId || '');
      const note = validateSelectionNote(String(body.note || ''));
      const { data: photo, error: photoError } = await supabase
        .from('delivery_photos')
        .select('id, kind')
        .eq('id', photoId)
        .eq('delivery_id', delivery.id)
        .eq('kind', 'preview')
        .maybeSingle();
      if (photoError) throw new Error(photoError.message);
      if (!photo) throw new Error('找不到照片');

      const { error: updateError } = await supabase
        .from('delivery_photos')
        .update({ selection_note: note })
        .eq('id', photoId);
      if (updateError) {
        if (isMissingColumnError(updateError.message, 'selection_note')) {
          throw new Error('選片備註功能尚未啟用，請至 Supabase 執行 photo-delivery-v2.sql');
        }
        throw new Error(updateError.message);
      }

      return NextResponse.json({ ok: true, note });
    }

    if (action === 'toggle') {
      const photoId = String(body.photoId || '');
      const { data: photo, error: photoError } = await supabase
        .from('delivery_photos')
        .select('id, selection, kind')
        .eq('id', photoId)
        .eq('delivery_id', delivery.id)
        .eq('kind', 'preview')
        .maybeSingle();
      if (photoError) throw new Error(photoError.message);
      if (!photo) throw new Error('找不到照片');

      const next = photo.selection === 'reject' ? 'keep' : 'reject';
      const { error: updateError } = await supabase
        .from('delivery_photos')
        .update({ selection: next })
        .eq('id', photoId);
      if (updateError) throw new Error(updateError.message);

      return NextResponse.json({ ok: true, selection: next });
    }

    if (action === 'submit') {
      const rejectCount = await supabase
        .from('delivery_photos')
        .select('id', { count: 'exact', head: true })
        .eq('delivery_id', delivery.id)
        .eq('kind', 'preview')
        .eq('selection', 'reject');

      const { error: lockError } = await supabase
        .from('photo_deliveries')
        .update({
          selection_locked_at: new Date().toISOString(),
          selection_reopened: false,
        })
        .eq('id', delivery.id);
      if (lockError) throw new Error(lockError.message);

      return NextResponse.json({
        ok: true,
        message: '選片已送出，謝謝您！',
        rejectCount: rejectCount.count ?? 0,
      });
    }

    throw new Error('無效的操作');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 400 },
    );
  }
}
