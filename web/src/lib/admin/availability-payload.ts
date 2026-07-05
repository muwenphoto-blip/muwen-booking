type WeeklyPayload = Record<string, string[]>;
type DatesPayload = Record<string, string[]>;

function normalizeTimeToken(value: string): string {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function sortTimes(times: string[]): string[] {
  return [...times].sort((a, b) => {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });
}

function normalizeSlotList(raw: string[], allSlots: string[]): string[] {
  const times = [...new Set(raw.map(normalizeTimeToken).filter((time) => time && allSlots.includes(time)))];
  return sortTimes(times);
}

export function normalizeWeeklyPayload(payload: WeeklyPayload, allSlots: string[]) {
  const weekly: Record<number, string[]> = {};
  Object.keys(payload || {}).forEach((dayKey) => {
    const day = parseInt(dayKey, 10);
    if (Number.isNaN(day) || day < 0 || day > 6) return;
    const times = normalizeSlotList(payload[dayKey] || [], allSlots);
    if (times.length) weekly[day] = times;
  });
  return weekly;
}

export function normalizeDatesPayload(payload: DatesPayload, allSlots: string[]) {
  const dates: Record<string, string[]> = {};
  Object.keys(payload || {}).forEach((dateKey) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    dates[dateKey] = normalizeSlotList(payload[dateKey] || [], allSlots);
  });
  return dates;
}

export function normalizeOffSlotsPayload(
  payload: Record<string, string[]>,
  allSlots: string[],
): Record<string, string[]> {
  const offSlotsDates: Record<string, string[]> = {};
  Object.keys(payload || {}).forEach((dateKey) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const times = normalizeSlotList(payload[dateKey] || [], allSlots);
    if (times.length) offSlotsDates[dateKey] = times;
  });
  return offSlotsDates;
}

export function normalizeDayOffDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const dates: string[] = [];
  value.forEach((item) => {
    const dateKey = String(item || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) dates.push(dateKey);
  });
  return dates;
}
