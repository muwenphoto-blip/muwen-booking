import { NextRequest, NextResponse } from 'next/server';
import {
  daysUntilExpiry,
  formatExpiryDate,
  guestDeliveryReady,
  isSelectionOpen,
  resolveDeliveryPhase,
} from '@/lib/delivery/access';
import { getDeliveryGuestSession, loadDeliveryBySlug, syncDeliveryExpiry } from '@/lib/delivery/store';
import { signPhotoAccessToken } from '@/lib/delivery/photo-access-token';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/supabase/errors';

type RouteContext = { params: Promise<{ slug: string }> };
type GuestPhotoMode = 'selection' | 'delivery';

async function requireGuest(slug: string) {
  const guest = await getDeliveryGuestSession();
  if (!guest || guest.slug !== slug) {
    throw new Error('請先登入');
  }
  const loaded = await loadDeliveryBySlug(slug);
  if (!loaded) {
    throw new Error('請先登入');
  }
  const delivery = await syncDeliveryExpiry(loaded);
  if (delivery.id !== guest.deliveryId) {
    throw new Error('請先登入');
  }
  if (!delivery.password_changed) {
    throw new Error('請先修改密碼');
  }
  if (delivery.phase === 'expired') {
    throw new Error('交片已到期');
  }
  return delivery;
}

function parsePhotoMode(request: NextRequest): GuestPhotoMode {
  const mode = request.nextUrl.searchParams.get('mode');
  return mode === 'delivery' ? 'delivery' : 'selection';
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const delivery = await requireGuest(slug);
    const mode = parsePhotoMode(request);
    const phase = resolveDeliveryPhase(delivery);
    const supabase = createAdminSupabaseClient();

    if (mode === 'delivery' && !guestDeliveryReady(delivery)) {
      return NextResponse.json({
        phase,
        mode,
        selectionOpen: false,
        deliveryReady: false,
        waitingForFinals: true,
        photos: [],
      });
    }

    let photos;
    let error;
    ({ data: photos, error } = await supabase
      .from('delivery_photos')
      .select('id, kind, file_name, selection, selection_note, sort_order, storage_path')
      .eq('delivery_id', delivery.id)
      .eq('kind', mode === 'delivery' ? 'final' : 'preview')
      .order('sort_order', { ascending: true }));
    if (error && isMissingColumnError(error.message, 'selection_note')) {
      ({ data: photos, error } = await supabase
        .from('delivery_photos')
        .select('id, kind, file_name, selection, sort_order, storage_path')
        .eq('delivery_id', delivery.id)
        .eq('kind', mode === 'delivery' ? 'final' : 'preview')
        .order('sort_order', { ascending: true }));
    }
    if (error) throw new Error(error.message);

    const items = await Promise.all(
      (photos ?? []).map(async (photo) => {
        const isPdf = photo.file_name.toLowerCase().endsWith('.pdf');
        let url: string | null = null;
        if (!isPdf) {
          const access = await signPhotoAccessToken({
            scope: 'guest',
            slug,
            deliveryId: delivery.id,
            photoId: photo.id,
          });
          url = `/api/delivery/${slug}/photos/${photo.id}/image?access=${encodeURIComponent(access)}`;
        }
        return {
          id: photo.id,
          kind: photo.kind,
          file_name: photo.file_name,
          selection: photo.selection,
          selection_note: 'selection_note' in photo ? String(photo.selection_note || '') : '',
          url,
        };
      }),
    );

    return NextResponse.json({
      phase,
      mode,
      selectionOpen: mode === 'selection' && isSelectionOpen(delivery),
      deliveryReady: guestDeliveryReady(delivery),
      selectionLockedAt: delivery.selection_locked_at,
      finalExpiresAt: delivery.final_expires_at,
      finalExpiresLabel: formatExpiryDate(delivery.final_expires_at),
      daysRemaining: daysUntilExpiry(delivery.final_expires_at),
      showExpiryNotice: mode === 'delivery' && phase === 'delivering',
      photos: items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法載入照片';
    const status = message === '請先登入' || message === '請先修改密碼' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
