export function parseIsoDate(value: string): { year: string; month: string; day: string } {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { year: '', month: '', day: '' };
  }
  const [year, month, day] = value.split('-');
  return {
    year,
    month: String(parseInt(month, 10)),
    day: String(parseInt(day, 10)),
  };
}

export function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function buildIsoDate(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (!y || !m || !d) return '';
  if (d > daysInMonth(y, m)) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function yearRange(min: number, max: number): number[] {
  const years: number[] = [];
  for (let y = max; y >= min; y--) {
    years.push(y);
  }
  return years;
}

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

export function dayOptions(year: string, month: string): number[] {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const count = y && m ? daysInMonth(y, m) : 31;
  return Array.from({ length: count }, (_, index) => index + 1);
}
