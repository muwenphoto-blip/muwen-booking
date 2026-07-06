import type { NextRequest } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { getDeliveryGuestSession } from '@/lib/delivery/store';
import { verifyPhotoAccessToken } from '@/lib/delivery/photo-access-token';

export async function authorizeAdminPhotoAccess(
  request: NextRequest,
  options: { bookingId: string; photoId: string; deliveryId: string },
): Promise<boolean> {
  const access = request.nextUrl.searchParams.get('access');
  if (access) {
    const claims = await verifyPhotoAccessToken(access);
    return Boolean(
      claims &&
        claims.scope === 'admin' &&
        claims.bookingId === options.bookingId &&
        claims.photoId === options.photoId &&
        claims.deliveryId === options.deliveryId,
    );
  }

  const session = await getAdminSession();
  return Boolean(session);
}

export async function authorizeGuestPhotoAccess(
  request: NextRequest,
  options: { slug: string; photoId: string; deliveryId: string },
): Promise<boolean> {
  const access = request.nextUrl.searchParams.get('access');
  if (access) {
    const claims = await verifyPhotoAccessToken(access);
    return Boolean(
      claims &&
        claims.scope === 'guest' &&
        claims.slug === options.slug &&
        claims.photoId === options.photoId &&
        claims.deliveryId === options.deliveryId,
    );
  }

  const guest = await getDeliveryGuestSession();
  return Boolean(guest && guest.slug === options.slug && guest.deliveryId === options.deliveryId);
}
