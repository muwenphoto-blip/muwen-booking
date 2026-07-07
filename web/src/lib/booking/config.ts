import { createSupabaseClient } from '@/lib/supabase/client';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { normalizeCasePrefix } from './case-number';
import type { BookingConfig, GenderOption, ServiceItem, SelectOption } from './types';

function parseOpenDays(raw: string): number[] {
  return String(raw || '')
    .split(/[,，\s]+/)
    .map((v) => parseInt(v, 10))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
}

function parseHeadcountOptions(raw: string): string[] {
  const list = String(raw || '')
    .split(/[,，\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length ? list : ['1', '2', '3', '4'];
}

function parseGenderOptions(raw: string): GenderOption[] {
  const fallback = [
    { value: '男', label: '男 Male' },
    { value: '女', label: '女 Female' },
    { value: '其他', label: '其他 Other' },
  ];
  const text = String(raw || '').trim();
  if (!text) return fallback;

  const chunks = text.includes('\n')
    ? text.split(/\r?\n/)
    : text.split(',');

  const list = chunks
    .map((chunk) => {
      const part = chunk.trim();
      if (!part) return null;
      const pipe = part.indexOf('|');
      if (pipe < 0) {
        return { value: part, label: part };
      }
      const value = part.slice(0, pipe).trim();
      const en = part.slice(pipe + 1).trim();
      if (!value) return null;
      return { value, label: en ? `${value} ${en}` : value };
    })
    .filter((item): item is GenderOption => item !== null);

  return list.length ? list : fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function formatStaffLabel(name: string): string {
  return name === '不指定' ? '不指定 Any staff' : name;
}

function formatHeadcountLabel(n: string): string {
  return `${n} 人 ${n} person${n === '1' ? '' : 's'}`;
}

function staffHasCasePrefix(raw: string): boolean {
  return /^[A-Z]{2}$/.test(normalizeCasePrefix(raw));
}

function buildStaffList(names: string[]): SelectOption[] {
  if (names.length >= 2) {
    return [{ value: '不指定', label: formatStaffLabel('不指定') }].concat(
      names.map((name) => ({ value: name, label: formatStaffLabel(name) })),
    );
  }
  if (names.length === 1) {
    return [{ value: names[0], label: formatStaffLabel(names[0]) }];
  }
  return [{ value: '不指定', label: formatStaffLabel('不指定') }];
}

function dedupeServices(
  rows: {
    id?: string;
    name: string;
    name_en: string;
    options_json: unknown;
    sort_order: number;
    base_price?: number | null;
  }[],
): ServiceItem[] {
  const seen = new Set<string>();
  const items: ServiceItem[] = [];
  rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((row) => {
      if (seen.has(row.name)) return;
      seen.add(row.name);
      const options = Array.isArray(row.options_json)
        ? row.options_json.map((opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            const label = String(opt?.label ?? '');
            const en = String(opt?.labelEn ?? '');
            const price = Number(opt?.price);
            return {
              value: label,
              label: en ? `${label} ${en}` : label,
              ...(Number.isFinite(price) && price > 0 ? { price } : {}),
            };
          })
        : [];
      const basePrice = Number(row.base_price);
      items.push({
        ...(row.id ? { id: row.id } : {}),
        name: row.name,
        label: row.name_en ? `${row.name} ${row.name_en}` : row.name,
        ...(Number.isFinite(basePrice) && basePrice > 0 ? { basePrice } : {}),
        options: options.filter((opt) => opt.value),
      });
    });
  return items;
}

const CONFIG_CACHE_TTL_MS = 60_000;
let configCache: { data: BookingConfig; at: number } | null = null;

export function clearBookingConfigCache() {
  configCache = null;
}

async function loadBookingConfigFromDb(): Promise<BookingConfig> {
  const supabase = createSupabaseClient();
  const admin = createAdminSupabaseClient();
  const [{ data: settings, error: settingsError }, servicesResult, { data: staff, error: staffError }] =
    await Promise.all([
      supabase.from('settings').select('key, value'),
      supabase.from('services').select('id, name, name_en, options_json, sort_order, base_price').eq('active', true),
      admin.from('staff').select('name, case_prefix').eq('active', true).order('name'),
    ]);

  if (settingsError) throw new Error(settingsError.message);
  let services: {
    id?: string;
    name: string;
    name_en: string;
    options_json: unknown;
    sort_order: number;
    base_price?: number | null;
  }[] | null = servicesResult.data;
  let servicesError = servicesResult.error;
  if (servicesError?.message?.includes('base_price')) {
    const fallback = await supabase
      .from('services')
      .select('id, name, name_en, options_json, sort_order')
      .eq('active', true);
    services = fallback.data;
    servicesError = fallback.error;
  }
  if (servicesError) throw new Error(servicesError.message);
  if (staffError) throw new Error(staffError.message);

  const bookableStaff = (staff ?? [])
    .filter((row) => staffHasCasePrefix(String(row.case_prefix || '')))
    .map((row) => row.name);

  const map = Object.fromEntries((settings ?? []).map((row) => [row.key, row.value]));
  const headcountOptions = parseHeadcountOptions(map.headcountOptions);
  const genderOptions = parseGenderOptions(map.genderOptions);

  return {
    shopName: String(map.shopName || '沐紋映像').trim() || '沐紋映像',
    shopEmail: String(map.shopEmail || 'muwenphoto@gmail.com').trim() || 'muwenphoto@gmail.com',
    staff: buildStaffList(bookableStaff),
    services: dedupeServices(services ?? []),
    headcountOptions: headcountOptions.map((n) => ({
      value: n,
      label: formatHeadcountLabel(n),
    })),
    genderOptions,
    openDays: parseOpenDays(map.openDays).length
      ? parseOpenDays(map.openDays)
      : [2, 3, 4, 5, 6],
    minDaysAhead: parseNonNegativeInt(map.minDaysAhead, 0),
    maxDaysAhead: parsePositiveInt(map.maxDaysAhead, 60),
    slotMinutes: parsePositiveInt(map.slotMinutes, 30),
    openTime: String(map.openTime || '10:00'),
    closeTime: String(map.closeTime || '18:00'),
    maxPerSlot: parsePositiveInt(map.maxPerSlot, 1),
  };
}

export async function loadBookingConfig(): Promise<BookingConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_TTL_MS) {
    return configCache.data;
  }

  const data = await loadBookingConfigFromDb();
  configCache = { data, at: Date.now() };
  return data;
}
