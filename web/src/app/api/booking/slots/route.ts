import { NextRequest, NextResponse } from 'next/server';
import { loadBookingSlots } from '@/lib/booking/slots';

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date')?.trim() ?? '';
    const staff = request.nextUrl.searchParams.get('staff')?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日期格式錯誤' }, { status: 400 });
    }

    const slots = await loadBookingSlots(date, staff);

    return NextResponse.json(
      { slots },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入時段' },
      { status: 500 },
    );
  }
}
