import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { loadDeliveryPhotoFile } from '@/lib/delivery/load-photo-file';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string; photoId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const { bookingId, photoId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');

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
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, max-age=900',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法取得預覽' },
      { status: 400 },
    );
  }
}
