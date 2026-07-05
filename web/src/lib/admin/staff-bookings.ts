import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate } from '@/lib/booking/time';
import { isBookingActive, BOOKING_STATUS_PENDING } from '@/lib/admin/bookings';

type AdminSupabase = SupabaseClient;

function countBlockingRows(
  rows: Array<{ status: string; booking_date: string }>,
  today: string,
): number {
  let count = 0;
  for (const row of rows) {
    if (!isBookingActive(row.status)) continue;
    if (row.status === BOOKING_STATUS_PENDING) {
      count++;
      continue;
    }
    if (row.booking_date >= today) {
      count++;
    }
  }
  return count;
}

export async function countBlockingBookingsByStaffNames(
  supabase: AdminSupabase,
  staffNames: string[],
): Promise<Map<string, number>> {
  const names = staffNames.map((name) => String(name || '').trim()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, 0);
  if (!names.length) return counts;

  const today = formatDate(new Date());
  const { data, error } = await supabase
    .from('bookings')
    .select('staff_name, status, booking_date')
    .in('staff_name', names);
  if (error) throw new Error(error.message);

  const grouped = new Map<string, Array<{ status: string; booking_date: string }>>();
  for (const row of data ?? []) {
    const name = String(row.staff_name || '').trim();
    if (!name || !counts.has(name)) continue;
    const bucket = grouped.get(name) ?? [];
    bucket.push({ status: row.status, booking_date: row.booking_date });
    grouped.set(name, bucket);
  }

  for (const [name, rows] of grouped) {
    counts.set(name, countBlockingRows(rows, today));
  }
  return counts;
}

export async function countStaffBlockingBookings(
  supabase: AdminSupabase,
  staffName: string,
): Promise<number> {
  const counts = await countBlockingBookingsByStaffNames(supabase, [staffName]);
  return counts.get(String(staffName || '').trim()) ?? 0;
}

export async function assertStaffBookingsClear(
  supabase: AdminSupabase,
  staffName: string,
  actionLabel: string,
) {
  const count = await countStaffBlockingBookings(supabase, staffName);
  if (count > 0) {
    throw new Error(
      `「${staffName}」尚有 ${count} 筆進行中預約（待確認或未來已確認），請先至預約列表轉派或取消後再${actionLabel}`,
    );
  }
}
