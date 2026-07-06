import { NextRequest, NextResponse } from 'next/server';
import { canCreateDelivery } from '@/lib/admin/bookings';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { hashDeliveryDefaultPassword } from '@/lib/delivery/default-password';
import { signPhotoAccessToken } from '@/lib/delivery/photo-access-token';
import { generateDeliverySlug } from '@/lib/delivery/slug';
import {
  buildDeliveryAbsoluteUrl,
  countFinalPhotos,
  loadDeliveryByBookingId,
  stripDeliverySecrets,
} from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const { bookingId } = await context.params;
    const supabase = createAdminSupabaseClient();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, case_number, customer_name, service, booking_date, booking_time, status, staff_name')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking) throw new Error('找不到這筆預約');

    if (!isManagerRole(session.role)) {
      const mine = session.photographerName || session.account;
      if (booking.staff_name !== mine) {
        throw new Error('您沒有權限查看此交片');
      }
    }

    const delivery = await loadDeliveryByBookingId(bookingId);
    let photos: unknown[] = [];
    let finalCount = 0;
    if (delivery) {
      const { data: photoRows, error: photoError } = await supabase
        .from('delivery_photos')
        .select('id, kind, file_name, selection, sort_order, created_at')
        .eq('delivery_id', delivery.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (photoError) throw new Error(photoError.message);
      photos = await Promise.all(
        (photoRows ?? []).map(async (photo) => {
          if (photo.kind !== 'preview') return photo;
          const access = await signPhotoAccessToken({
            scope: 'admin',
            bookingId,
            deliveryId: delivery.id,
            photoId: photo.id,
          });
          return {
            ...photo,
            preview_url: `/api/admin/deliveries/${bookingId}/photos/${photo.id}/preview?access=${encodeURIComponent(access)}`,
          };
        }),
      );
      finalCount = await countFinalPhotos(delivery.id);
    }

    return NextResponse.json({
      booking,
      delivery: delivery ? stripDeliverySecrets(delivery) : null,
      photos,
      finalCount,
      deliveryUrl: delivery ? buildDeliveryAbsoluteUrl(delivery.url_slug, request.url) : null,
      canCreate: canCreateDelivery(booking.status),
      canManage: isManagerRole(session.role),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入交片資料' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    if (!isManagerRole(session.role)) {
      return NextResponse.json({ error: '僅主控或副主控可建立交片' }, { status: 403 });
    }

    const { bookingId } = await context.params;
    const supabase = createAdminSupabaseClient();

    const existing = await loadDeliveryByBookingId(bookingId);
    if (existing) {
      return NextResponse.json({
        ok: true,
        delivery: stripDeliverySecrets(existing),
        deliveryUrl: buildDeliveryAbsoluteUrl(existing.url_slug, request.url),
        message: '交片已存在',
      });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking) throw new Error('找不到這筆預約');
    if (!canCreateDelivery(booking.status)) {
      throw new Error('此預約狀態無法建立交片（須為已接受、已確認或已結案）');
    }

    const passwordHash = await hashDeliveryDefaultPassword();
    const slug = generateDeliverySlug();

    const { data: delivery, error } = await supabase
      .from('photo_deliveries')
      .insert({
        booking_id: bookingId,
        url_slug: slug,
        password_hash: passwordHash,
        password_changed: false,
        phase: 'selecting',
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      delivery: stripDeliverySecrets(delivery),
      deliveryUrl: buildDeliveryAbsoluteUrl(delivery.url_slug, request.url),
      message: '已建立交片案件',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '建立交片失敗' },
      { status: 400 },
    );
  }
}
