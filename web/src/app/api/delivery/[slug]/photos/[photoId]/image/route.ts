import { NextRequest, NextResponse } from 'next/server';
import { resolveDeliveryPhase } from '@/lib/delivery/access';
import { loadDeliveryPhotoFile } from '@/lib/delivery/load-photo-file';
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
    if (delivery.phase === 'expired') {
      throw new Error('交片已到期');
    }

    const phase = resolveDeliveryPhase(delivery);
    const supabase = createAdminSupabaseClient();
    const { data: photo, error } = await supabase
      .from('delivery_photos')
      .select('storage_path, kind')
      .eq('id', photoId)
      .eq('delivery_id', delivery.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!photo) throw new Error('找不到照片');

    if (phase === 'delivering' && photo.kind !== 'final') {
      throw new Error('找不到檔案');
    }
    if (phase !== 'delivering' && photo.kind !== 'preview') {
      throw new Error('找不到照片');
    }

    const file = await loadDeliveryPhotoFile(photo.storage_path);
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, max-age=900',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法載入照片';
    const status = message === '請先登入' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
