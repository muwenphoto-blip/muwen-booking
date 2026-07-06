import { NextRequest, NextResponse } from 'next/server';
import { resolveDeliveryPhase } from '@/lib/delivery/access';
import { authorizeGuestPhotoAccess } from '@/lib/delivery/authorize-photo-access';
import { loadDeliveryPhotoFile } from '@/lib/delivery/load-photo-file';
import { loadDeliveryBySlug } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ slug: string; photoId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug, photoId } = await context.params;
    const delivery = await loadDeliveryBySlug(slug);
    if (!delivery) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const allowed = await authorizeGuestPhotoAccess(request, {
      slug,
      photoId,
      deliveryId: delivery.id,
    });
    if (!allowed || !delivery.password_changed) {
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
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法載入照片';
    const status = message === '請先登入' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
