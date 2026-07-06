import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
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

    const { data: signed, error: signError } = await supabase.storage
      .from(DELIVERY_STORAGE_BUCKET)
      .createSignedUrl(photo.storage_path, 60 * 30);
    if (signError) throw new Error(signError.message);

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法取得預覽' },
      { status: 400 },
    );
  }
}
