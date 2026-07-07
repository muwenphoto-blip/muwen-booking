import { NextRequest, NextResponse } from 'next/server';
import { resolveDeliveryPhase } from '@/lib/delivery/access';
import { loadDeliveryPhotoFile } from '@/lib/delivery/load-photo-file';
import {
  getDeliveryGuestSession,
  loadDeliveryBySlug,
  loadPreviewNoteMap,
  resolveFinalDownloadFilename,
} from '@/lib/delivery/store';
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
    const noteMap = await loadPreviewNoteMap(delivery.id);
    const { data: photo, error } = await supabase
      .from('delivery_photos')
      .select('id, storage_path, file_name, kind')
      .eq('id', photoId)
      .eq('delivery_id', delivery.id)
      .eq('kind', 'final')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!photo) throw new Error('找不到檔案');

    const file = await loadDeliveryPhotoFile(photo.storage_path);
    const downloadName = resolveFinalDownloadFilename(photo.file_name || 'download', noteMap);
    const filename = encodeURIComponent(downloadName);
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '下載失敗' },
      { status: 400 },
    );
  }
}
