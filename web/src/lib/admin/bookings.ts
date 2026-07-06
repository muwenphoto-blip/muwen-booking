import type { AdminSession } from '@/lib/admin/session';
import { isManagerRole } from '@/lib/admin/session';

export const BOOKING_STATUS_PENDING = '待確認';
export const BOOKING_STATUS_ACCEPTED = '已接受';
export const BOOKING_STATUS_REJECTED = '已拒絕';
export const BOOKING_STATUS_CANCELLED = '已取消';
export const BOOKING_STATUS_CONFIRMED = '已確認';
export const BOOKING_STATUS_CLOSED = '已結案';

export function isBookingLocked(status: string): boolean {
  return (
    status === BOOKING_STATUS_CLOSED ||
    status === BOOKING_STATUS_CANCELLED ||
    status === BOOKING_STATUS_REJECTED
  );
}

export function isBookingActive(status: string): boolean {
  return !isBookingLocked(status);
}

export function isBookingConfirmed(status: string): boolean {
  return status === BOOKING_STATUS_ACCEPTED || status === BOOKING_STATUS_CONFIRMED;
}

export function canTransferBooking(status: string, staffName: string): boolean {
  if (isBookingLocked(status)) return false;
  const staff = String(staffName || '').trim();
  return Boolean(staff && staff !== '不指定');
}

export function canCloseBooking(status: string): boolean {
  return isBookingConfirmed(status);
}

export function canCreateDelivery(status: string): boolean {
  return isBookingConfirmed(status) || status === BOOKING_STATUS_CLOSED;
}

export function canCancelBooking(status: string): boolean {
  if (isBookingLocked(status)) return false;
  return status !== BOOKING_STATUS_PENDING;
}

export function canRemoveBooking(status: string): boolean {
  return status === BOOKING_STATUS_CANCELLED || status === BOOKING_STATUS_REJECTED;
}

export function isStaffInactive(staffName: string, activeStaffNames: Set<string>): boolean {
  const staff = String(staffName || '').trim();
  if (!staff || staff === '不指定') return false;
  return !activeStaffNames.has(staff);
}

export function countBookingStats(
  bookings: { booking_date: string; status: string }[],
  today: string,
) {
  let todayCount = 0;
  let confirmedCount = 0;
  let pendingCount = 0;
  for (const row of bookings) {
    if (!isBookingActive(row.status)) continue;
    if (row.booking_date === today) todayCount++;
    if (isBookingConfirmed(row.status)) confirmedCount++;
    if (row.status === BOOKING_STATUS_PENDING) pendingCount++;
  }
  return { todayCount, confirmedCount, pendingCount };
}

export function bookingStatusClass(status: string): string {
  if (status === BOOKING_STATUS_PENDING) return 'admin-status-pending';
  if (status === BOOKING_STATUS_CLOSED) return 'admin-status-closed';
  if (status === BOOKING_STATUS_REJECTED || status === BOOKING_STATUS_CANCELLED) {
    return 'admin-status-inactive';
  }
  return 'admin-status-ok';
}

export function canRespondToBooking(session: AdminSession, staffName: string): boolean {
  if (isManagerRole(session.role)) return true;
  const staff = String(staffName || '').trim();
  if (!staff || staff === '不指定') return false;
  const mine = String(session.photographerName || session.account || '').trim();
  return staff === mine;
}

export function buildBookingLogLabel(booking: {
  booking_date: string;
  booking_time: string;
  customer_name: string;
}): string {
  return `${booking.booking_date} ${booking.booking_time}｜${booking.customer_name}`;
}
