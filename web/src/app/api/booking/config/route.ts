import { NextResponse } from 'next/server';
import { loadBookingConfig } from '@/lib/booking/config';

export async function GET() {
  try {
    const config = await loadBookingConfig();
    return NextResponse.json(
      {
        shopName: config.shopName,
        staff: config.staff,
        services: config.services,
        headcountOptions: config.headcountOptions,
        genderOptions: config.genderOptions,
        openDays: config.openDays,
        minDaysAhead: config.minDaysAhead,
        maxDaysAhead: config.maxDaysAhead,
        slotMinutes: config.slotMinutes,
        openTime: config.openTime,
        closeTime: config.closeTime,
        maxPerSlot: config.maxPerSlot,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入設定' },
      { status: 500 },
    );
  }
}
