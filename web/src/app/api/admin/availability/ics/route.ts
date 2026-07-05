import { NextRequest, NextResponse } from 'next/server';
import { assertScheduleView, loadScheduleRoleSets } from '@/lib/admin/schedule-access';
import { buildStaffScheduleIcs } from '@/lib/admin/schedule-ics';
import { getAdminSession } from '@/lib/admin/get-session';
import {
  buildMonthScheduleView,
  parseStaffSchedule,
} from '@/lib/booking/availability';
import { loadBookingConfig } from '@/lib/booking/config';
import { currentMonthKey, formatMonthLabel, generateSlots, parseMonthKey } from '@/lib/booking/time';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const staffName = String(request.nextUrl.searchParams.get('staff') || session.photographerName || '').trim();
    const monthKey = String(request.nextUrl.searchParams.get('month') || currentMonthKey()).trim();
    if (!staffName) throw new Error('請指定攝影師');

    const supabase = createAdminSupabaseClient();
    const { masterStaffNames, coMasterStaffNames } = await loadScheduleRoleSets(supabase);
    assertScheduleView(session, staffName, masterStaffNames, coMasterStaffNames);

    const parsedMonth = parseMonthKey(monthKey);
    if (!parsedMonth) throw new Error('月份格式不正確');

    const config = await loadBookingConfig();
    const allSlots = generateSlots(config.openTime, config.closeTime, config.slotMinutes);
    const { data: staffRow, error } = await supabase
      .from('staff')
      .select('name, active, availability_schedule')
      .eq('name', staffName)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!staffRow?.active) throw new Error(`找不到攝影師「${staffName}」`);

    const schedule = parseStaffSchedule(String(staffRow.availability_schedule || ''), allSlots);
    const days = buildMonthScheduleView(schedule, monthKey, allSlots, config.openDays);
    const monthLabel = formatMonthLabel(parsedMonth.year, parsedMonth.month);
    const ics = buildStaffScheduleIcs({
      staffName,
      monthLabel,
      days,
      slotMinutes: config.slotMinutes,
    });

    const filename = `排班-${staffName}-${monthKey}.ics`;
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法匯出行事曆' },
      { status: 400 },
    );
  }
}
