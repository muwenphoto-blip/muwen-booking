export function parseTime(time: string): number {
  const text = String(time || '').trim();
  const [h, m] = text.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateSlots(openTime: string, closeTime: string, slotMinutes: number): string[] {
  const startText = String(openTime || '10:00').trim() || '10:00';
  const endText = String(closeTime || '18:00').trim() || '18:00';
  const step = Number.isFinite(slotMinutes) && slotMinutes > 0 ? slotMinutes : 30;
  const slots: string[] = [];
  const start = parseTime(startText);
  const end = parseTime(endText);
  for (let m = start; m < end; m += step) {
    slots.push(formatMinutes(m));
  }
  return slots;
}

export function getDayOfWeek(dateStr: string, timeZone = 'Asia/Taipei'): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
    new Date(`${dateStr}T12:00:00+08:00`),
  );
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

export function addDaysToDateKey(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return formatDate(date);
}

export function assertBookingDateInWindow(
  dateStr: string,
  minDaysAhead: number,
  maxDaysAhead: number,
  timeZone = 'Asia/Taipei',
) {
  const today = todayDateKey(timeZone);
  const minDate = addDaysToDateKey(today, minDaysAhead);
  const maxDate = addDaysToDateKey(today, maxDaysAhead);
  if (dateStr < minDate || dateStr > maxDate) {
    throw new Error('所選日期不在可預約範圍內');
  }
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthKey(timeZone = 'Asia/Taipei'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

export function todayDateKey(timeZone = 'Asia/Taipei'): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(new Date());
}

export function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): { year: number; month: number } | null {
  const match = String(key || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function listDatesInMonth(year: number, month: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(year, month - 1, 1);
  while (cursor.getMonth() === month - 1) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function monthKeyFromDate(dateStr: string): string {
  return String(dateStr || '').slice(0, 7);
}

export function formatShortDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}（${WEEKDAY[getDayOfWeek(dateStr)]}）`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDateWithWeekday(dateStr: string): string {
  return `${dateStr}（週${WEEKDAY[getDayOfWeek(dateStr)]}）`;
}

export function findNextOpenDate(start: Date, openDays: number[]): string {
  const openSet = new Set(openDays);
  for (let i = 0; i < 366; i++) {
    const d = addDays(start, i);
    if (openSet.has(d.getDay())) {
      return formatDate(d);
    }
  }
  return formatDate(start);
}
