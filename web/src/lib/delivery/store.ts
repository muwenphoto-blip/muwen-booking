import { cookies } from 'next/headers';
import {
  getDeliverySessionCookieName,
  verifyDeliverySessionToken,
  type DeliveryGuestSession,
} from '@/lib/delivery/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { DeliveryRecord } from '@/lib/delivery/types';
import { isDeliveryExpired, isSelectionOpen, resolveDeliveryPhase } from '@/lib/delivery/access';

export async function getDeliveryGuestSession(): Promise<DeliveryGuestSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getDeliverySessionCookieName())?.value;
  if (!token) return null;
  return verifyDeliverySessionToken(token);
}

export async function loadDeliveryBySlug(slug: string): Promise<DeliveryRecord | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('photo_deliveries')
    .select('*')
    .eq('url_slug', slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DeliveryRecord | null) ?? null;
}

export async function loadDeliveryByBookingId(bookingId: string): Promise<DeliveryRecord | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('photo_deliveries')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DeliveryRecord | null) ?? null;
}

export async function loadDeliveryById(id: string): Promise<DeliveryRecord | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('photo_deliveries')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DeliveryRecord | null) ?? null;
}

export async function syncDeliveryExpiry(delivery: DeliveryRecord): Promise<DeliveryRecord> {
  if (!isDeliveryExpired(delivery) || delivery.phase === 'expired') {
    return delivery;
  }
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('photo_deliveries')
    .update({ phase: 'expired' })
    .eq('id', delivery.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as DeliveryRecord;
}

export function buildDeliveryPublicPath(slug: string): string {
  return `/delivery/${slug}`;
}

export function buildDeliveryAbsoluteUrl(slug: string, requestUrl?: string): string {
  const path = buildDeliveryPublicPath(slug);
  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (site) {
    const base = site.startsWith('http') ? site : `https://${site}`;
    return `${base.replace(/\/$/, '')}${path}`;
  }
  if (requestUrl) {
    const origin = new URL(requestUrl).origin;
    return `${origin}${path}`;
  }
  return path;
}

export async function countFinalPhotos(deliveryId: string): Promise<number> {
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from('delivery_photos')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_id', deliveryId)
    .eq('kind', 'final');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function deliveryPhaseLabel(phase: ReturnType<typeof resolveDeliveryPhase>): string {
  if (phase === 'selecting') return '選片中';
  if (phase === 'delivering') return '可下載';
  return '已到期';
}

export function stripDeliverySecrets<T extends { password_hash?: string }>(
  delivery: T,
): Omit<T, 'password_hash'> {
  const { password_hash: _hash, ...safe } = delivery;
  return safe;
}

export async function loadFinalCountsByBookingIds(
  bookingIds: string[],
): Promise<Map<string, number>> {
  if (!bookingIds.length) return new Map();

  const supabase = createAdminSupabaseClient();
  const { data: deliveries, error: deliveryError } = await supabase
    .from('photo_deliveries')
    .select('id, booking_id')
    .in('booking_id', bookingIds);
  if (deliveryError) throw new Error(deliveryError.message);
  if (!deliveries?.length) return new Map();

  const deliveryByBooking = new Map(deliveries.map((row) => [row.booking_id, row.id]));
  const deliveryIds = deliveries.map((row) => row.id);

  const { data: finals, error: finalError } = await supabase
    .from('delivery_photos')
    .select('delivery_id')
    .in('delivery_id', deliveryIds)
    .eq('kind', 'final');
  if (finalError) throw new Error(finalError.message);

  const countByDelivery = new Map<string, number>();
  for (const row of finals ?? []) {
    countByDelivery.set(row.delivery_id, (countByDelivery.get(row.delivery_id) ?? 0) + 1);
  }

  const result = new Map<string, number>();
  for (const [bookingId, deliveryId] of deliveryByBooking) {
    result.set(bookingId, countByDelivery.get(deliveryId) ?? 0);
  }
  return result;
}

export type DeliveryListMeta = {
  slug: string;
  canSelect: boolean;
};

export async function loadDeliveryListMetaByBookingIds(
  bookingIds: string[],
): Promise<Map<string, DeliveryListMeta>> {
  if (!bookingIds.length) return new Map();

  const supabase = createAdminSupabaseClient();
  const { data: deliveries, error } = await supabase
    .from('photo_deliveries')
    .select(
      'booking_id, url_slug, selection_locked_at, selection_reopened, phase, finals_started_at, final_expires_at',
    )
    .in('booking_id', bookingIds);
  if (error) throw new Error(error.message);

  const result = new Map<string, DeliveryListMeta>();
  for (const row of deliveries ?? []) {
    const delivery = row as Pick<
      DeliveryRecord,
      | 'url_slug'
      | 'selection_locked_at'
      | 'selection_reopened'
      | 'phase'
      | 'finals_started_at'
      | 'final_expires_at'
    >;
    const canSelect =
      isSelectionOpen(delivery) && resolveDeliveryPhase(delivery) === 'selecting';
    result.set(row.booking_id, { slug: row.url_slug, canSelect });
  }
  return result;
}
