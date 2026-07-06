import { NextRequest, NextResponse } from 'next/server';
import {
  daysUntilExpiry,
  formatExpiryDate,
  isSelectionOpen,
  resolveDeliveryPhase,
} from '@/lib/delivery/access';
import { getDeliveryGuestSession, loadDeliveryBySlug, syncDeliveryExpiry } from '@/lib/delivery/store';
import { loadDeliveryPhotoDataUrl } from '@/lib/delivery/load-photo-file';
import { signPhotoAccessToken } from '@/lib/delivery/photo-access-token';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ slug: string }> };

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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const delivery = await requireGuest(slug);
    const phase = resolveDeliveryPhase(delivery);
    const supabase = createAdminSupabaseClient();

    let query = supabase
      .from('delivery_photos')
      .select('id, kind, file_name, selection, sort_order, storage_path')
      .eq('delivery_id', delivery.id)
      .order('sort_order', { ascending: true });

    if (phase === 'delivering') {
      query = query.eq('kind', 'final');
    } else {
      query = query.eq('kind', 'preview');
    }

    const { data: photos, error } = await query;
    if (error) throw new Error(error.message);

    const items = await Promise.all(
      (photos ?? []).map(async (photo) => {
        const isPdf = photo.file_name.toLowerCase().endsWith('.pdf');
        let url: string | null = null;
        if (photo.kind === 'preview' && !isPdf) {
          try {
            url = await loadDeliveryPhotoDataUrl(photo.storage_path);
          } catch {
            url = null;
          }
        } else if (!isPdf) {
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
          url,
        };
      }),
    );

    return NextResponse.json({
      phase,
      selectionOpen: isSelectionOpen(delivery),
      selectionLockedAt: delivery.selection_locked_at,
      finalExpiresAt: delivery.final_expires_at,
      finalExpiresLabel: formatExpiryDate(delivery.final_expires_at),
      daysRemaining: daysUntilExpiry(delivery.final_expires_at),
      showExpiryNotice: phase === 'delivering',
      photos: items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法載入照片';
    const status = message === '請先登入' || message === '請先修改密碼' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
