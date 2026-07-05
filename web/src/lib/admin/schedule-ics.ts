import type { ResolvedStaffDaySchedule } from '@/lib/booking/availability';
import { parseTime } from '@/lib/booking/time';

function escapeIcs(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatIcsLocal(dateStr: string, time: string, addMinutes = 0): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = parseTime(time) + addMinutes;
  const dayOffset = Math.floor(total / (24 * 60));
  const minuteOfDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const date = new Date(y, m - 1, d + dayOffset);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}T${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
}

export function buildStaffScheduleIcs(params: {
  staffName: string;
  monthLabel: string;
  days: ResolvedStaffDaySchedule[];
  slotMinutes: number;
}): string {
  const { staffName, monthLabel, days, slotMinutes } = params;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Muwen Booking//Schedule//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(`沐紋映像｜${staffName} ${monthLabel}排班`)}`,
  ];

  days.forEach((day) => {
    if (!day.shopOpen) return;

    if (day.dayOff) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:muwen-off-${day.date}-${staffName}@muwen`,
        `DTSTART;VALUE=DATE:${day.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${day.date.replace(/-/g, '')}`,
        `SUMMARY:${escapeIcs(`【排休】${staffName}`)}`,
        `DESCRIPTION:${escapeIcs(`${day.label} 整日排休`)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
      return;
    }

    day.offSlots.forEach((time) => {
      const start = formatIcsLocal(day.date, time, 0);
      const end = formatIcsLocal(day.date, time, slotMinutes);
      lines.push(
        'BEGIN:VEVENT',
        `UID:muwen-offslot-${day.date}-${time}-${staffName}@muwen`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcs(`【時段排休】${staffName}`)}`,
        `DESCRIPTION:${escapeIcs(`${day.label} ${time} 排休`)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    });

    day.slots.forEach((time) => {
      const start = formatIcsLocal(day.date, time, 0);
      const end = formatIcsLocal(day.date, time, slotMinutes);
      lines.push(
        'BEGIN:VEVENT',
        `UID:muwen-slot-${day.date}-${time}-${staffName}@muwen`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcs(`可接案｜${staffName}`)}`,
        `DESCRIPTION:${escapeIcs(`${day.label} ${time} 可接預約`)}`,
        'END:VEVENT',
      );
    });
  });

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
