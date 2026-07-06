import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminPhotoAccess } from '@/lib/delivery/authorize-photo-access';
import { loadDeliveryPhotoFile } from '@/lib/delivery/load-photo-file';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string; photoId: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId, photoId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');

    const allowed = await authorizeAdminPhotoAccess(request, {
      bookingId,
      photoId,
      deliveryId: delivery.id,
    });
    if (!allowed) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: photo, error } = await supabase
      .from('delivery_photos')
      .select('storage_path')
      .eq('id', photoId)
      .eq('delivery_id', delivery.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!photo) throw new Error('找不到照片');

    const file = await loadDeliveryPhotoFile(photo.storage_path);
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法取得預覽' },
      { status: 400 },
    );
  }
}
