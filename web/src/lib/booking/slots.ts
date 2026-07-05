import { buildBookingSlots } from '@/lib/booking/availability';
import { loadBookingConfig } from '@/lib/booking/config';
import { createSupabaseClient } from '@/lib/supabase/client';
import type { BookingSlot } from './types';

export async function loadBookingSlots(date: string, staff: string): Promise<BookingSlot[]> {
  const config = await loadBookingConfig();
  const supabase = createSupabaseClient();

  const [{ data: staffRows, error: staffError }, { data: counts, error: countsError }] =
    await Promise.all([
      supabase.from('staff_public').select('name, availability_schedule'),
      supabase.rpc('get_booking_slot_counts', { p_date: date }),
    ]);

  if (staffError) throw new Error(staffError.message);
  if (countsError) throw new Error(countsError.message);

  const bookedCounts: Record<string, number> = {};
  (counts ?? []).forEach((row: { booking_time: string; booking_count: number }) => {
    bookedCounts[row.booking_time] = Number(row.booking_count) || 0;
  });

  return buildBookingSlots({
    dateStr: date,
    staff,
    openTime: config.openTime,
    closeTime: config.closeTime,
    slotMinutes: config.slotMinutes,
    maxPerSlot: config.maxPerSlot,
    openDays: config.openDays,
    bookedCounts,
    staffRows: staffRows ?? [],
  });
}
