import { NextRequest, NextResponse } from 'next/server';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { resolveDeliveryPhase } from '@/lib/delivery/access';
import { getDeliveryGuestSession, loadDeliveryBySlug } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ slug: string; photoId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug, photoId } = await context.params;
    const guest = await getDeliveryGuestSession();
    if (!guest || guest.slug !== slug) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const delivery = await loadDeliveryBySlug(slug);
    if (!delivery || delivery.id !== guest.deliveryId || !delivery.password_changed) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }
    if (resolveDeliveryPhase(delivery) !== 'delivering') {
      throw new Error('目前尚不可下載');
    }

    const supabase = createAdminSupabaseClient();
    const { data: photo, error } = await supabase
      .from('delivery_photos')
      .select('id, storage_path, file_name, kind')
      .eq('id', photoId)
      .eq('delivery_id', delivery.id)
      .eq('kind', 'final')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!photo) throw new Error('找不到檔案');

    const { data: signed, error: signError } = await supabase.storage
      .from(DELIVERY_STORAGE_BUCKET)
      .createSignedUrl(photo.storage_path, 60 * 10, {
        download: photo.file_name || true,
      });
    if (signError) throw new Error(signError.message);

    return NextResponse.redirect(signed.signedUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '下載失敗' },
      { status: 400 },
    );
  }
}
