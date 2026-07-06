import { NextRequest, NextResponse } from 'next/server';
import { resolveDeliveryPhase } from '@/lib/delivery/access';
import { authorizeGuestPhotoAccess } from '@/lib/delivery/authorize-photo-access';
import { loadDeliveryPhotoFile, loadPreviewPhotoForDisplay } from '@/lib/delivery/load-photo-file';
import { loadDeliveryBySlug } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ slug: string; photoId: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug, photoId } = await context.params;
    const delivery = await loadDeliveryBySlug(slug);
    if (!delivery) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const access = request.nextUrl.searchParams.get('access');
    const allowed = await authorizeGuestPhotoAccess(request, {
      slug,
      photoId,
      deliveryId: delivery.id,
    });
    if (!allowed) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }
    if (!access && !delivery.password_changed) {
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

    const file =
      photo.kind === 'preview'
        ? await loadPreviewPhotoForDisplay(photo.storage_path)
        : await loadDeliveryPhotoFile(photo.storage_path);
    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    };
    if (photo.kind === 'preview') {
      headers['Content-Disposition'] = 'inline';
      headers['X-Content-Type-Options'] = 'nosniff';
    }
    return new NextResponse(new Uint8Array(file.body), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法載入照片';
    const status = message === '請先登入' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
