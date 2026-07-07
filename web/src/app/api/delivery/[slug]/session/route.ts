import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDeliverySessionCookieName } from '@/lib/delivery/session';
import {
  daysUntilExpiry,
  formatExpiryDate,
  guestDeliveryReady,
  guestShowDeliveryOption,
  guestShowSelectionOption,
  isDeliveryCompleted,
  isSelectionOpen,
  resolveDeliveryPhase,
} from '@/lib/delivery/access';
import { getDeliveryGuestSession, loadDeliveryBySlug, syncDeliveryExpiry } from '@/lib/delivery/store';

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const guest = await getDeliveryGuestSession();
    if (!guest || guest.slug !== slug) {
      return NextResponse.json({ loggedIn: false });
    }

    let delivery = await loadDeliveryBySlug(slug);
    if (!delivery || delivery.id !== guest.deliveryId) {
      return NextResponse.json({ loggedIn: false });
    }
    delivery = await syncDeliveryExpiry(delivery);

    const phase = resolveDeliveryPhase(delivery);

    return NextResponse.json({
      loggedIn: true,
      mustChangePassword: !delivery.password_changed,
      phase,
      selectionOpen: isSelectionOpen(delivery),
      showSelectionOption: guestShowSelectionOption(delivery),
      showDeliveryOption: guestShowDeliveryOption(delivery),
      deliveryReady: guestDeliveryReady(delivery),
      selectionLockedAt: delivery.selection_locked_at,
      finalExpiresAt: delivery.final_expires_at,
      finalExpiresLabel: formatExpiryDate(delivery.final_expires_at),
      daysRemaining: daysUntilExpiry(delivery.final_expires_at),
      completedAt: delivery.completed_at,
      deliveryCompleted: isDeliveryCompleted(delivery),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入狀態' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  cookieStore.set(getDeliverySessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
