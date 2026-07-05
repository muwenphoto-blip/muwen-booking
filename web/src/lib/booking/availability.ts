import {
  formatShortDateLabel,
  generateSlots,
  getDayOfWeek,
  listDatesInMonth,
  parseMonthKey,
  parseTime,
} from './time';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type StaffSchedule =
  | { mode: 'all'; calendar: Record<string, string[]>; dayOff: Record<string, true>; offSlots: Record<string, string[]> }
  | { mode: 'legacy'; slots: string[]; calendar: Record<string, string[]>; dayOff: Record<string, true>; offSlots: Record<string, string[]> }
  | { mode: 'weekly'; weekly: Record<number, string[]>; calendar: Record<string, string[]>; dayOff: Record<string, true>; offSlots: Record<string, string[]> };

export type ResolvedStaffDaySchedule = {
  date: string;
  label: string;
  shopOpen: boolean;
  active: boolean;
  dayOff: boolean;
  offSlots: string[];
  slots: string[];
  hasOverride: boolean;
  usesDefault: boolean;
};

const DAY_OFF_MARKERS = new Set(['!', 'off', '排休']);

function normalizeTime(value: string): string {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function parseTimeList(raw: string, allSlots: string[]): string[] {
  const times: string[] = [];
  String(raw || '')
    .split(/[,，、\s]+/)
    .forEach((slot) => {
      const time = normalizeTime(slot);
      if (time && allSlots.includes(time) && !times.includes(time)) {
        times.push(time);
      }
    });
  times.sort((a, b) => parseTime(a) - parseTime(b));
  return times;
}

export function emptyStaffSchedule(): StaffSchedule {
  return { mode: 'all', calendar: {}, dayOff: {}, offSlots: {} };
}

function isDayOffMarker(raw: string): boolean {
  const text = String(raw || '').trim();
  return DAY_OFF_MARKERS.has(text.toLowerCase()) || text === '排休';
}

function parseOffSlotsSegment(raw: string, allSlots: string[]): Record<string, string[]> {
  const offSlots: Record<string, string[]> = {};
  String(raw || '')
    .split(';')
    .forEach((part) => {
      const eq = part.indexOf('=');
      if (eq < 0) return;
      const key = part.slice(0, eq).trim();
      if (!DATE_KEY.test(key)) return;
      offSlots[key] = parseTimeList(part.slice(eq + 1), allSlots);
    });
  return offSlots;
}

function mergeOffSlots(
  base: Record<string, string[]>,
  extra: Record<string, string[]>,
): Record<string, string[]> {
  return { ...base, ...extra };
}

export function parseStaffSchedule(cell: string, allSlots: string[]): StaffSchedule {
  const text = String(cell || '').trim();
  const calendar: Record<string, string[]> = {};
  const dayOff: Record<string, true> = {};
  let offSlots: Record<string, string[]> = {};
  if (!text || text === '*') return { mode: 'all', calendar, dayOff, offSlots };

  const weekly: Record<number, string[]> = {};
  let hasWeekly = false;
  let hasCalendar = false;
  const segments = text.includes('||') ? text.split('||') : [text];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('off:')) {
      offSlots = mergeOffSlots(offSlots, parseOffSlotsSegment(trimmed.slice(4), allSlots));
      continue;
    }

    if (trimmed.includes('=')) {
      trimmed.split(';').forEach((part) => {
        const eq = part.indexOf('=');
        if (eq < 0) return;
        const key = part.slice(0, eq).trim();
        const rawValue = part.slice(eq + 1).trim();
        if (DATE_KEY.test(key)) {
          if (isDayOffMarker(rawValue)) {
            calendar[key] = [];
            dayOff[key] = true;
          } else {
            calendar[key] = parseTimeList(rawValue, allSlots);
          }
          hasCalendar = true;
          return;
        }
        const day = parseInt(key, 10);
        if (!Number.isNaN(day) && day >= 0 && day <= 6) {
          const times = parseTimeList(rawValue, allSlots);
          if (times.length) weekly[day] = times;
          hasWeekly = true;
        }
      });
      continue;
    }

    const picked = parseTimeList(trimmed, allSlots);
    if (picked.length && picked.length < allSlots.length) {
      return { mode: 'legacy', slots: picked, calendar, dayOff, offSlots };
    }
  }

  if (hasWeekly) {
    return { mode: 'weekly', weekly, calendar, dayOff, offSlots };
  }
  if (hasCalendar) {
    return { mode: 'all', calendar, dayOff, offSlots };
  }
  return { mode: 'all', calendar, dayOff, offSlots };
}

export function serializeStaffAvailabilityWeekly(weekly: Record<number, string[]>): string {
  const parts: string[] = [];
  Object.keys(weekly)
    .map((key) => parseInt(key, 10))
    .filter((day) => !Number.isNaN(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .forEach((day) => {
      const slots = weekly[day];
      if (!slots?.length) return;
      const normalized = [...new Set(slots.map((time) => normalizeTime(time)).filter(Boolean))].sort(
        (a, b) => parseTime(a) - parseTime(b),
      );
      if (normalized.length) parts.push(`${day}=${normalized.join(',')}`);
    });
  return parts.join(';');
}

function serializeCalendar(
  calendar: Record<string, string[]>,
  dayOff: Record<string, true>,
): string {
  const dates = new Set([...Object.keys(calendar), ...Object.keys(dayOff)]);
  return [...dates]
    .sort()
    .map((date) => {
      if (dayOff[date]) return `${date}=!`;
      return `${date}=${(calendar[date] || []).join(',')}`;
    })
    .join(';');
}

function serializeOffSlots(offSlots: Record<string, string[]>): string {
  const parts = Object.keys(offSlots)
    .sort()
    .map((date) => {
      const times = [...new Set((offSlots[date] || []).map((time) => normalizeTime(time)).filter(Boolean))].sort(
        (a, b) => parseTime(a) - parseTime(b),
      );
      if (!times.length) return '';
      return `${date}=${times.join(',')}`;
    })
    .filter(Boolean);
  if (!parts.length) return '';
  return `off:${parts.join(';')}`;
}

export function serializeStaffSchedule(schedule: StaffSchedule): string {
  const parts: string[] = [];

  if (schedule.mode === 'weekly') {
    const weeklyPart = serializeStaffAvailabilityWeekly(schedule.weekly);
    if (weeklyPart) parts.push(weeklyPart);
  } else if (schedule.mode === 'legacy') {
    parts.push(schedule.slots.join(','));
  }

  const calendarPart = serializeCalendar(schedule.calendar, schedule.dayOff);
  if (calendarPart) parts.push(calendarPart);

  const offPart = serializeOffSlots(schedule.offSlots);
  if (offPart) parts.push(offPart);

  return parts.join('||');
}

export function resolveStaffDaySchedule(
  schedule: StaffSchedule,
  dateStr: string,
  allSlots: string[],
  openDays: number[],
): ResolvedStaffDaySchedule {
  const shopOpen = openDays.includes(getDayOfWeek(dateStr));
  if (!shopOpen) {
    return {
      date: dateStr,
      label: formatShortDateLabel(dateStr),
      shopOpen: false,
      active: false,
      dayOff: false,
      offSlots: [],
      slots: [],
      hasOverride: false,
      usesDefault: true,
    };
  }

  if (schedule.dayOff[dateStr]) {
    return {
      date: dateStr,
      label: formatShortDateLabel(dateStr),
      shopOpen: true,
      active: false,
      dayOff: true,
      offSlots: [],
      slots: [],
      hasOverride: true,
      usesDefault: false,
    };
  }

  const blocked = [...(schedule.offSlots[dateStr] || [])];
  const filterBlocked = (times: string[]) =>
    blocked.length ? times.filter((time) => !blocked.includes(time)) : times;

  if (Object.prototype.hasOwnProperty.call(schedule.calendar, dateStr)) {
    const slots = filterBlocked(schedule.calendar[dateStr] || []);
    return {
      date: dateStr,
      label: formatShortDateLabel(dateStr),
      shopOpen: true,
      active: slots.length > 0,
      dayOff: false,
      offSlots: blocked,
      slots: [...slots],
      hasOverride: true,
      usesDefault: false,
    };
  }

  if (blocked.length) {
    let baseSlots = [...allSlots];
    if (schedule.mode === 'legacy') baseSlots = [...schedule.slots];
    else if (schedule.mode === 'weekly') baseSlots = [...(schedule.weekly[getDayOfWeek(dateStr)] || [])];
    const slots = filterBlocked(baseSlots);
    return {
      date: dateStr,
      label: formatShortDateLabel(dateStr),
      shopOpen: true,
      active: slots.length > 0,
      dayOff: false,
      offSlots: blocked,
      slots,
      hasOverride: true,
      usesDefault: false,
    };
  }

  if (schedule.mode === 'all') {
    return {
      date: dateStr,
      label: formatShortDateLabel(dateStr),
      shopOpen: true,
      active: true,
      dayOff: false,
      offSlots: [],
      slots: [...allSlots],
      hasOverride: false,
      usesDefault: true,
    };
  }

  if (schedule.mode === 'legacy') {
    const slots = [...schedule.slots];
    return {
      date: dateStr,
      label: formatShortDateLabel(dateStr),
      shopOpen: true,
      active: slots.length > 0,
      dayOff: false,
      offSlots: [],
      slots,
      hasOverride: false,
      usesDefault: true,
    };
  }

  const slots = [...(schedule.weekly[getDayOfWeek(dateStr)] || [])];
  return {
    date: dateStr,
    label: formatShortDateLabel(dateStr),
    shopOpen: true,
    active: slots.length > 0,
    dayOff: false,
    offSlots: [],
    slots,
    hasOverride: false,
    usesDefault: true,
  };
}

export function buildMonthScheduleView(
  schedule: StaffSchedule,
  monthKey: string,
  allSlots: string[],
  openDays: number[],
): ResolvedStaffDaySchedule[] {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return [];
  return listDatesInMonth(parsed.year, parsed.month).map((date) =>
    resolveStaffDaySchedule(schedule, date, allSlots, openDays),
  );
}

export function monthUsesCalendarOverrides(schedule: StaffSchedule, monthKey: string): boolean {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return false;
  return listDatesInMonth(parsed.year, parsed.month).some((date) =>
    Object.prototype.hasOwnProperty.call(schedule.calendar, date),
  );
}

export function mergeMonthCalendar(
  schedule: StaffSchedule,
  monthKey: string,
  mode: 'all' | 'calendar',
  dates: Record<string, string[]>,
  dayOffDates: string[] = [],
  offSlotsDates: Record<string, string[]> = {},
): StaffSchedule {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return schedule;

  const nextCalendar = { ...schedule.calendar };
  const nextDayOff = { ...schedule.dayOff };
  const nextOffSlots = { ...schedule.offSlots };
  const monthDates = listDatesInMonth(parsed.year, parsed.month);
  const offSet = new Set(dayOffDates);

  if (mode === 'all') {
    monthDates.forEach((date) => {
      delete nextCalendar[date];
      delete nextDayOff[date];
      delete nextOffSlots[date];
    });
    return { ...schedule, calendar: nextCalendar, dayOff: nextDayOff, offSlots: nextOffSlots };
  }

  monthDates.forEach((date) => {
    if (offSet.has(date)) {
      nextCalendar[date] = [];
      nextDayOff[date] = true;
      delete nextOffSlots[date];
      return;
    }
    delete nextDayOff[date];
    if (Object.prototype.hasOwnProperty.call(offSlotsDates, date)) {
      const offTimes = offSlotsDates[date] || [];
      if (offTimes.length) nextOffSlots[date] = [...offTimes];
      else delete nextOffSlots[date];
    } else {
      delete nextOffSlots[date];
    }
    if (Object.prototype.hasOwnProperty.call(dates, date)) {
      nextCalendar[date] = [...dates[date]];
    }
  });

  return { ...schedule, calendar: nextCalendar, dayOff: nextDayOff, offSlots: nextOffSlots };
}

export function copyCalendarWeek(
  schedule: StaffSchedule,
  targetDates: string[],
  sourceDates: string[],
): StaffSchedule {
  const nextCalendar = { ...schedule.calendar };
  const nextDayOff = { ...schedule.dayOff };
  const nextOffSlots = { ...schedule.offSlots };
  targetDates.forEach((targetDate, index) => {
    const sourceDate = sourceDates[index];
    if (!sourceDate) return;
    if (schedule.dayOff[sourceDate]) {
      nextCalendar[targetDate] = [];
      nextDayOff[targetDate] = true;
      delete nextOffSlots[targetDate];
      return;
    }
    delete nextDayOff[targetDate];
    if (schedule.offSlots[sourceDate]?.length) {
      nextOffSlots[targetDate] = [...schedule.offSlots[sourceDate]];
    } else {
      delete nextOffSlots[targetDate];
    }
    if (Object.prototype.hasOwnProperty.call(schedule.calendar, sourceDate)) {
      nextCalendar[targetDate] = [...(schedule.calendar[sourceDate] || [])];
      return;
    }
    delete nextCalendar[targetDate];
  });
  return { ...schedule, calendar: nextCalendar, dayOff: nextDayOff, offSlots: nextOffSlots };
}

export function weeklyScheduleForPanel(
  schedule: StaffSchedule,
  openDays: number[],
): Record<number, string[]> | null {
  if (schedule.mode === 'all') return null;
  if (schedule.mode === 'weekly') return schedule.weekly;
  const weekly: Record<number, string[]> = {};
  openDays.forEach((day) => {
    weekly[day] = [...schedule.slots];
  });
  return weekly;
}

export function formatStaffAvailabilityLabel(schedule: StaffSchedule, allSlots: string[]): string {
  const calendarCount = Object.keys(schedule.calendar).length;
  if (calendarCount) {
    return `已設定 ${calendarCount} 天日期排班`;
  }
  if (!schedule || schedule.mode === 'all') return '全部時段';
  if (schedule.mode === 'legacy') {
    if (schedule.slots.length >= allSlots.length) return '全部時段';
    return schedule.slots.join('、');
  }
  const parts: string[] = [];
  Object.keys(schedule.weekly)
    .map((key) => parseInt(key, 10))
    .filter((day) => !Number.isNaN(day))
    .sort((a, b) => a - b)
    .forEach((day) => {
      const slots = schedule.weekly[day] || [];
      if (!slots.length) return;
      const slotText =
        slots.length <= 3 ? slots.join('、') : `${slots[0]} 等 ${slots.length} 段`;
      parts.push(`週${WEEKDAY_LABELS[day]} ${slotText}`);
    });
  return parts.length ? parts.join('；') : '全部時段';
}

export function weekdayLabels() {
  return WEEKDAY_LABELS;
}

export function staffAcceptsSlot(
  schedule: StaffSchedule,
  dateStr: string,
  time: string,
): boolean {
  time = normalizeTime(time);
  if (schedule.dayOff[dateStr]) return false;
  if ((schedule.offSlots[dateStr] || []).includes(time)) return false;
  if (Object.prototype.hasOwnProperty.call(schedule.calendar, dateStr)) {
    const slots = schedule.calendar[dateStr] || [];
    if (!slots.length) return false;
    return slots.includes(time);
  }
  if (!schedule || schedule.mode === 'all') return true;
  if (schedule.mode === 'legacy') return schedule.slots.includes(time);
  const day = getDayOfWeek(dateStr);
  const daySlots = schedule.weekly[day];
  if (!daySlots?.length) return false;
  return daySlots.includes(time);
}

export function buildBookingSlots(params: {
  dateStr: string;
  staff: string;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  maxPerSlot: number;
  openDays: number[];
  bookedCounts: Record<string, number>;
  staffRows: { name: string; availability_schedule: string }[];
}) {
  const {
    dateStr,
    staff,
    openTime,
    closeTime,
    slotMinutes,
    maxPerSlot,
    openDays,
    bookedCounts,
    staffRows,
  } = params;

  if (!openDays.includes(getDayOfWeek(dateStr))) return [];

  const allSlots = generateSlots(openTime, closeTime, slotMinutes);
  const schedules = new Map(
    staffRows.map((row) => [
      row.name,
      parseStaffSchedule(row.availability_schedule, allSlots),
    ]),
  );
  const photographers = staffRows.map((row) => row.name);
  const fallback = emptyStaffSchedule();

  const hasAnyStaffForSlot = (time: string) => {
    if (!photographers.length) return true;
    return photographers.some((name) =>
      staffAcceptsSlot(schedules.get(name) ?? fallback, dateStr, time),
    );
  };

  return allSlots.map((time) => {
    const booked = bookedCounts[time] ?? 0;
    const globallyAvailable = booked < maxPerSlot;
    let accepts = true;
    if (staff && staff !== '不指定') {
      accepts = staffAcceptsSlot(schedules.get(staff) ?? fallback, dateStr, time);
    } else {
      accepts = hasAnyStaffForSlot(time);
    }
    return {
      time,
      available: globallyAvailable && accepts,
      offHours: !accepts,
    };
  });
}
