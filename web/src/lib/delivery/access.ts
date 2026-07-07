import { FINAL_RETENTION_DAYS } from '@/lib/delivery/constants';
import type { DeliveryPhase, DeliveryRecord } from '@/lib/delivery/types';

export function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function isDeliveryExpired(delivery: Pick<DeliveryRecord, 'final_expires_at' | 'phase'>): boolean {
  if (!delivery.final_expires_at) return false;
  return new Date(delivery.final_expires_at).getTime() <= Date.now();
}

export function resolveDeliveryPhase(
  delivery: Pick<DeliveryRecord, 'final_expires_at' | 'phase' | 'finals_started_at'>,
): DeliveryPhase {
  if (isDeliveryExpired(delivery)) return 'expired';
  if (delivery.finals_started_at) return 'delivering';
  return delivery.phase === 'expired' ? 'expired' : delivery.phase;
}

export function isDeliveryCompleted(
  delivery: Pick<DeliveryRecord, 'completed_at'>,
): boolean {
  return Boolean(delivery.completed_at);
}

export function isSelectionOpen(
  delivery: Pick<
    DeliveryRecord,
    | 'selection_locked_at'
    | 'selection_reopened'
    | 'phase'
    | 'final_expires_at'
    | 'finals_started_at'
    | 'completed_at'
  >,
): boolean {
  if (isDeliveryCompleted(delivery)) return false;
  if (resolveDeliveryPhase(delivery) === 'expired') return false;
  if (delivery.selection_locked_at && !delivery.selection_reopened) return false;
  return true;
}

export function isSelectionLocked(
  delivery: Pick<DeliveryRecord, 'selection_locked_at' | 'selection_reopened'>,
): boolean {
  return Boolean(delivery.selection_locked_at && !delivery.selection_reopened);
}

/** 客人選單：選片階段顯示選片入口 */
export function guestShowSelectionOption(
  delivery: Pick<
    DeliveryRecord,
    | 'selection_locked_at'
    | 'selection_reopened'
    | 'phase'
    | 'final_expires_at'
    | 'finals_started_at'
    | 'completed_at'
  >,
): boolean {
  if (resolveDeliveryPhase(delivery) === 'expired') return false;
  return isSelectionOpen(delivery);
}

/** 客人選單：選片完成後顯示交片入口 */
export function guestShowDeliveryOption(
  delivery: Pick<
    DeliveryRecord,
    | 'selection_locked_at'
    | 'selection_reopened'
    | 'phase'
    | 'final_expires_at'
    | 'finals_started_at'
  >,
): boolean {
  if (resolveDeliveryPhase(delivery) === 'expired') return false;
  return isSelectionLocked(delivery);
}

/** 成品已上傳，可下載 */
export function guestDeliveryReady(
  delivery: Pick<DeliveryRecord, 'final_expires_at' | 'phase' | 'finals_started_at'>,
): boolean {
  return resolveDeliveryPhase(delivery) === 'delivering';
}

export function formatExpiryDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Taipei',
  });
}

export function daysUntilExpiry(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function computeFinalExpiryFromNow(): string {
  return addDaysIso(FINAL_RETENTION_DAYS);
}
