import { cookies } from 'next/headers';
import {
  getDeliverySessionCookieName,
  verifyDeliverySessionToken,
  type DeliveryGuestSession,
} from '@/lib/delivery/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { DeliveryLinkMode, DeliveryRecord } from '@/lib/delivery/types';
import { isDeliveryExpired, isSelectionOpen, resolveDeliveryPhase } from '@/lib/delivery/access';
import { appendNoteToFilename } from '@/lib/delivery/selection-export';

export async function getDeliveryGuestSession(): Promise<DeliveryGuestSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getDeliverySessionCookieName())?.value;
  if (!token) return null;
  return verifyDeliverySessionToken(token);
}

export async function loadDeliveryBySlug(slug: string): Promise<DeliveryRecord | null> {
  const supabase = createAdminSupabaseClient();
  const { data: bySelection, error: selectionError } = await supabase
    .from('photo_deliveries')
    .select('*')
    .eq('url_slug', slug)
    .maybeSingle();
  if (selectionError) throw new Error(selectionError.message);
  if (bySelection) return bySelection as DeliveryRecord;

  const { data: byDownload, error: downloadError } = await supabase
    .from('photo_deliveries')
    .select('*')
    .eq('download_slug', slug)
    .maybeSingle();
  if (downloadError) throw new Error(downloadError.message);
  return (byDownload as DeliveryRecord | null) ?? null;
}

export function getDeliveryLinkMode(
  delivery: Pick<DeliveryRecord, 'url_slug' | 'download_slug'>,
  slug: string,
): DeliveryLinkMode | null {
  if (delivery.url_slug === slug) return 'selection';
  if (delivery.download_slug === slug) return 'download';
  return null;
}

export async function ensureDeliveryDownloadSlug(delivery: DeliveryRecord): Promise<DeliveryRecord> {
  if (delivery.download_slug) return delivery;
  const supabase = createAdminSupabaseClient();
  const { generateDeliverySlug } = await import('@/lib/delivery/slug');
  const downloadSlug = generateDeliverySlug();
  const { data, error } = await supabase
    .from('photo_deliveries')
    .update({ download_slug: downloadSlug })
    .eq('id', delivery.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as DeliveryRecord;
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

export function buildDeliverySelectionUrl(slug: string, requestUrl?: string): string {
  return buildDeliveryAbsoluteUrl(slug, requestUrl);
}

export function buildDeliveryDownloadUrl(downloadSlug: string, requestUrl?: string): string {
  return buildDeliveryAbsoluteUrl(downloadSlug, requestUrl);
}

export async function loadPreviewNoteMap(deliveryId: string): Promise<Map<string, string>> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('delivery_photos')
    .select('file_name, selection_note')
    .eq('delivery_id', deliveryId)
    .eq('kind', 'preview');
  if (error) throw new Error(error.message);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const note = String(row.selection_note || '').trim();
    if (!note) continue;
    map.set(row.file_name, note);
    const dot = row.file_name.lastIndexOf('.');
    if (dot > 0) {
      map.set(row.file_name.slice(0, dot), note);
    }
  }
  return map;
}

export function resolveFinalDownloadFilename(
  fileName: string,
  noteMap: Map<string, string>,
): string {
  const note =
    noteMap.get(fileName) ||
    (() => {
      const dot = fileName.lastIndexOf('.');
      return dot > 0 ? noteMap.get(fileName.slice(0, dot)) : undefined;
    })();
  return note ? appendNoteToFilename(fileName, note) : fileName;
}

export function buildDeliveryAbsoluteUrl(slug: string, requestUrl?: string): string {
  const path = buildDeliveryPublicPath(slug);
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
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
      'booking_id, url_slug, download_slug, selection_locked_at, selection_reopened, phase, finals_started_at, final_expires_at, completed_at',
    )
    .in('booking_id', bookingIds);
  if (error) throw new Error(error.message);

  const result = new Map<string, DeliveryListMeta>();
  for (const row of deliveries ?? []) {
    const delivery = row as Pick<
      DeliveryRecord,
      | 'url_slug'
      | 'download_slug'
      | 'selection_locked_at'
      | 'selection_reopened'
      | 'phase'
      | 'finals_started_at'
      | 'final_expires_at'
      | 'completed_at'
    >;
    const canSelect =
      isSelectionOpen(delivery) &&
      resolveDeliveryPhase(delivery) === 'selecting' &&
      !delivery.completed_at;
    result.set(row.booking_id, { slug: row.url_slug, canSelect });
  }
  return result;
}
