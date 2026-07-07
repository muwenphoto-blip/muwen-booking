import { NextRequest, NextResponse } from 'next/server';
import {
  assertScheduleView,
  canApproveStaffSchedule,
  canEditStaffSchedule,
  filterStaffOptionsForScheduleView,
  loadScheduleRoleSets,
  mustSubmitForApproval,
  pendingApproverLabel,
  staffRequiresMasterApproval,
} from '@/lib/admin/schedule-access';
import { getAdminSession } from '@/lib/admin/get-session';
import {
  normalizeDatesPayload,
  normalizeDayOffDates,
  normalizeOffSlotsPayload,
  normalizeWeeklyPayload,
} from '@/lib/admin/availability-payload';
import {
  buildMonthScheduleView,
  copyCalendarWeek,
  formatStaffAvailabilityLabel,
  mergeMonthCalendar,
  monthHasScheduleOverrides,
  parseStaffSchedule,
  serializeStaffSchedule,
  weekdayLabels,
} from '@/lib/booking/availability';
import { loadBookingConfig } from '@/lib/booking/config';
import {
  currentMonthKey,
  formatMonthLabel,
  generateSlots,
  parseMonthKey,
} from '@/lib/booking/time';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type StaffScheduleRow = {
  id: string;
  name: string;
  active: boolean;
  availability_schedule: string;
  availability_schedule_draft?: string;
  schedule_pending?: boolean;
};

function isMissingColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes('schedule_pending') || msg.includes('availability_schedule_draft');
}

async function loadStaffRow(supabase: ReturnType<typeof createAdminSupabaseClient>, staffName: string) {
  const extended = await supabase
    .from('staff')
    .select(
      'id, name, active, availability_schedule, availability_schedule_draft, schedule_pending',
    )
    .eq('name', staffName)
    .maybeSingle();

  if (!extended.error) return extended.data as StaffScheduleRow | null;
  if (!isMissingColumnError(extended.error.message)) throw new Error(extended.error.message);

  const basic = await supabase
    .from('staff')
    .select('id, name, active, availability_schedule')
    .eq('name', staffName)
    .maybeSingle();
  if (basic.error) throw new Error(basic.error.message);
  if (!basic.data) return null;
  return {
    ...basic.data,
    availability_schedule_draft: '',
    schedule_pending: false,
  } as StaffScheduleRow;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const config = await loadBookingConfig();
    const allSlots = generateSlots(config.openTime, config.closeTime, config.slotMinutes);
    const supabase = createAdminSupabaseClient();
    const { data: staffRowsData, error } = await supabase
      .from('staff')
      .select('name, active')
      .eq('active', true)
      .order('name');
    if (error) throw new Error(error.message);

    const allStaffNames = (staffRowsData ?? []).map((row) => row.name);
    if (!allStaffNames.length) {
      throw new Error('請先在團隊管理新增攝影師');
    }

    const { masterStaffNames, coMasterStaffNames } = await loadScheduleRoleSets(supabase);
    const staffOptions = filterStaffOptionsForScheduleView(
      allStaffNames,
      session,
      masterStaffNames,
      coMasterStaffNames,
    );
    if (!staffOptions.length) {
      throw new Error('您沒有可查看的排班表');
    }

    const requested = String(request.nextUrl.searchParams.get('staff') || '').trim();
    const ownName = String(session.photographerName || '').trim();
    let staffName =
      requested ||
      (ownName && staffOptions.includes(ownName) ? ownName : '') ||
      staffOptions[0];
    if (!staffOptions.includes(staffName)) {
      staffName = staffOptions[0];
    }
    assertScheduleView(session, staffName, masterStaffNames, coMasterStaffNames);

    const monthKey = String(request.nextUrl.searchParams.get('month') || currentMonthKey()).trim();
    const parsedMonth = parseMonthKey(monthKey);
    if (!parsedMonth) throw new Error('月份格式不正確');

    const staffRow = await loadStaffRow(supabase, staffName);
    if (!staffRow?.active) throw new Error(`找不到攝影師「${staffName}」`);

    const requiresMasterApproval = staffRequiresMasterApproval(staffName, coMasterStaffNames);

    const published = parseStaffSchedule(String(staffRow.availability_schedule || ''), allSlots);
    const draft = parseStaffSchedule(String(staffRow.availability_schedule_draft || ''), allSlots);
    const schedulePending = Boolean(staffRow.schedule_pending);
    const editSchedule =
      schedulePending && staffRow.availability_schedule_draft
        ? draft
        : published;
    const monthDays = buildMonthScheduleView(editSchedule, monthKey, allSlots, config.openDays);
    const publishedMonthDays = buildMonthScheduleView(
      published,
      monthKey,
      allSlots,
      config.openDays,
    );
    const usesCalendar = monthHasScheduleOverrides(editSchedule, monthKey);

    return NextResponse.json({
      staffName,
      staffOptions,
      allSlots,
      openDays: config.openDays,
      weekdayLabels: weekdayLabels(),
      month: monthKey,
      monthLabel: formatMonthLabel(parsedMonth.year, parsedMonth.month),
      monthDays,
      publishedMonthDays,
      usesCalendar,
      isAllSlots: !monthHasScheduleOverrides(editSchedule, monthKey),
      schedulePending,
      canApprove:
        canApproveStaffSchedule(session, staffName, masterStaffNames, coMasterStaffNames) &&
        schedulePending,
      canEdit: canEditStaffSchedule(session, staffName, masterStaffNames, coMasterStaffNames),
      mustSubmitForApproval: mustSubmitForApproval(session, staffName),
      requiresMasterApproval,
      pendingApproverLabel: pendingApproverLabel(requiresMasterApproval),
      isOwnSchedule: session.photographerName === staffName,
      openTime: config.openTime,
      closeTime: config.closeTime,
      timeRangeLabel: `${config.openTime}–${config.closeTime}`,
      slotMinutes: config.slotMinutes,
      availabilityLabel: formatStaffAvailabilityLabel(published, allSlots),
      draftLabel: schedulePending ? formatStaffAvailabilityLabel(draft, allSlots) : '',
      viewerRole: session.role,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入排班表' },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const body = await request.json();
    const staffName = String(body.staffName || '').trim();
    const mode = String(body.mode || 'calendar');
    const monthKey = String(body.month || currentMonthKey()).trim();
    if (!staffName) throw new Error('請指定要排班的攝影師');
    if (!parseMonthKey(monthKey)) throw new Error('月份格式不正確');

    const supabase = createAdminSupabaseClient();
    const { masterStaffNames, coMasterStaffNames } = await loadScheduleRoleSets(supabase);
    assertScheduleView(session, staffName, masterStaffNames, coMasterStaffNames);
    if (!canEditStaffSchedule(session, staffName, masterStaffNames, coMasterStaffNames)) {
      throw new Error('您沒有權限修改此排班表');
    }

    const config = await loadBookingConfig();
    const allSlots = generateSlots(config.openTime, config.closeTime, config.slotMinutes);
    const staffRow = await loadStaffRow(supabase, staffName);
    if (!staffRow?.active) throw new Error(`找不到攝影師「${staffName}」`);

    const requiresMasterApproval = staffRequiresMasterApproval(staffName, coMasterStaffNames);
    const approverLabel = pendingApproverLabel(requiresMasterApproval);

    const published = parseStaffSchedule(String(staffRow.availability_schedule || ''), allSlots);
    const draftBase = staffRow.availability_schedule_draft
      ? parseStaffSchedule(String(staffRow.availability_schedule_draft), allSlots)
      : published;
    const baseSchedule = mustSubmitForApproval(session, staffName) ? draftBase : published;

    let nextSchedule = baseSchedule;
    let label = '全部時段';
    const dayOffDates =
      session.role === '主' ? [] : normalizeDayOffDates(body.dayOffDates);
    const offSlotsDates =
      session.role === '主'
        ? {}
        : normalizeOffSlotsPayload((body.offSlotsDates as Record<string, string[]>) || {}, allSlots);

    if (mode === 'all') {
      nextSchedule = mergeMonthCalendar(baseSchedule, monthKey, 'all', {}, [], {});
      label = `${formatMonthLabel(parseMonthKey(monthKey)!.year, parseMonthKey(monthKey)!.month)}改為預設全部時段`;
    } else if (mode === 'weekly') {
      const weekly = normalizeWeeklyPayload(
        (body.weekly as Record<string, string[]>) || {},
        allSlots,
      );
      if (!Object.keys(weekly).length) {
        throw new Error('請至少選擇一個星期與時段');
      }
      nextSchedule = {
        mode: 'weekly',
        weekly,
        calendar: baseSchedule.calendar,
        dayOff: baseSchedule.dayOff,
        offSlots: baseSchedule.offSlots,
      };
      label = formatStaffAvailabilityLabel(nextSchedule, allSlots);
    } else if (mode === 'copy-week') {
      const targetDates = (body.targetDates as string[]) ?? [];
      const sourceDates = (body.sourceDates as string[]) ?? [];
      nextSchedule = copyCalendarWeek(baseSchedule, targetDates, sourceDates);
      label = '已複製上一週排班';
    } else {
      const dates = normalizeDatesPayload(
        (body.dates as Record<string, string[]>) || {},
        allSlots,
      );
      const monthDays = buildMonthScheduleView(baseSchedule, monthKey, allSlots, config.openDays);
      const hasAnyActive = monthDays.some((day) => {
        if (!day.shopOpen) return false;
        if (dayOffDates.includes(day.date)) return true;
        if ((offSlotsDates[day.date] || []).length > 0) return true;
        const slots = Object.prototype.hasOwnProperty.call(dates, day.date)
          ? dates[day.date]
          : day.slots;
        return slots.length > 0;
      });
      if (!hasAnyActive) {
        throw new Error('請至少選擇一個日期與時段，或標記排休');
      }

      const mergedDates: Record<string, string[]> = {};
      monthDays.forEach((day) => {
        if (!day.shopOpen || dayOffDates.includes(day.date)) return;
        mergedDates[day.date] = Object.prototype.hasOwnProperty.call(dates, day.date)
          ? dates[day.date]
          : day.slots;
      });

      nextSchedule = mergeMonthCalendar(
        baseSchedule,
        monthKey,
        'calendar',
        mergedDates,
        dayOffDates,
        offSlotsDates,
      );
      label = `${formatMonthLabel(parseMonthKey(monthKey)!.year, parseMonthKey(monthKey)!.month)}已更新`;
    }

    const serialized = serializeStaffSchedule(nextSchedule);
    const submitForApproval =
      Boolean(body.submitForApproval) || mustSubmitForApproval(session, staffName);

    if (submitForApproval) {
      const updatePayload: Record<string, unknown> = {
        availability_schedule_draft: serialized,
        schedule_pending: true,
      };
      const { error: updateError } = await supabase
        .from('staff')
        .update(updatePayload)
        .eq('id', staffRow.id);
      if (updateError) {
        if (isMissingColumnError(updateError.message)) {
          throw new Error('請先在 Supabase 執行 supabase/staff-schedule-workflow.sql');
        }
        throw new Error(updateError.message);
      }

      await supabase.from('admin_logs').insert({
        admin_account: session.account,
        admin_role: session.role,
        action: '送審排班',
        summary: staffName,
        detail: label,
      });

      return NextResponse.json({
        ok: true,
        message: `已送審「${staffName}」排班，待${approverLabel}核定`,
        schedulePending: true,
        draftLabel: formatStaffAvailabilityLabel(nextSchedule, allSlots),
      });
    }

    const { error: updateError } = await supabase
      .from('staff')
      .update({
        availability_schedule: serialized,
        availability_schedule_draft: '',
        schedule_pending: false,
      })
      .eq('id', staffRow.id);
    if (updateError) {
      if (isMissingColumnError(updateError.message)) {
        const fallback = await supabase
          .from('staff')
          .update({ availability_schedule: serialized })
          .eq('id', staffRow.id);
        if (fallback.error) throw new Error(fallback.error.message);
      } else {
        throw new Error(updateError.message);
      }
    }

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '設定排班',
      summary: staffName,
      detail: label,
    });

    return NextResponse.json({
      ok: true,
      message: `已核定「${staffName}」排班：${label}`,
      availabilityLabel: formatStaffAvailabilityLabel(nextSchedule, allSlots),
      usesCalendar: monthHasScheduleOverrides(nextSchedule, monthKey),
      isAllSlots: !monthHasScheduleOverrides(nextSchedule, monthKey),
      schedulePending: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '儲存失敗' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const body = await request.json();
    const staffName = String(body.staffName || '').trim();
    const action = String(body.action || 'approve');
    if (!staffName) throw new Error('請指定攝影師');

    const supabase = createAdminSupabaseClient();
    const { masterStaffNames, coMasterStaffNames } = await loadScheduleRoleSets(supabase);
    const requiresMasterApproval = staffRequiresMasterApproval(staffName, coMasterStaffNames);

    if (!canApproveStaffSchedule(session, staffName, masterStaffNames, coMasterStaffNames)) {
      if (session.role === '副主' && session.photographerName === staffName) {
        throw new Error('副主控的排班僅能由主控核定');
      }
      if (masterStaffNames.has(staffName)) {
        throw new Error('主控排班僅能由主控本人核定');
      }
      if (requiresMasterApproval) {
        throw new Error('此排班僅能由主控核定');
      }
      throw new Error('您沒有權限核定此排班');
    }

    const staffRow = await loadStaffRow(supabase, staffName);
    if (!staffRow?.active) throw new Error(`找不到攝影師「${staffName}」`);
    if (!staffRow.schedule_pending || !staffRow.availability_schedule_draft) {
      throw new Error('目前沒有待核定的排班');
    }

    if (action === 'reject') {
      const { error } = await supabase
        .from('staff')
        .update({ availability_schedule_draft: '', schedule_pending: false })
        .eq('id', staffRow.id);
      if (error) throw new Error(error.message);
      await supabase.from('admin_logs').insert({
        admin_account: session.account,
        admin_role: session.role,
        action: '退回排班',
        summary: staffName,
        detail: '已退回送審排班',
      });
      return NextResponse.json({ ok: true, message: `已退回「${staffName}」的送審排班` });
    }

    const { error } = await supabase
      .from('staff')
      .update({
        availability_schedule: staffRow.availability_schedule_draft,
        availability_schedule_draft: '',
        schedule_pending: false,
      })
      .eq('id', staffRow.id);
    if (error) throw new Error(error.message);

    const config = await loadBookingConfig();
    const allSlots = generateSlots(config.openTime, config.closeTime, config.slotMinutes);
    const published = parseStaffSchedule(staffRow.availability_schedule_draft, allSlots);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '核定排班',
      summary: staffName,
      detail: formatStaffAvailabilityLabel(published, allSlots),
    });

    return NextResponse.json({
      ok: true,
      message: `已核定「${staffName}」排班，客人預約將套用新版本`,
      availabilityLabel: formatStaffAvailabilityLabel(published, allSlots),
      schedulePending: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '核定失敗' },
      { status: 400 },
    );
  }
}
