import { clearBookingConfigCache } from '@/lib/booking/config';
import { parseTime } from '@/lib/booking/time';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const SETTING_CATEGORIES: Record<string, string> = {
  shopName: '店家',
  shopEmail: '店家',
  openDays: '預約規則',
  openTime: '預約規則',
  closeTime: '預約規則',
  slotMinutes: '預約規則',
  maxPerSlot: '預約規則',
  minDaysAhead: '預約規則',
  maxDaysAhead: '預約規則',
  headcountOptions: '表單選項',
  genderOptions: '表單選項',
};

export type AdminServiceRow = {
  id: string;
  sort_order: number;
  name: string;
  name_en: string;
  options: { label: string; labelEn: string }[];
  active: boolean;
};

export type AdminSettingsData = {
  shopName: string;
  shopEmail: string;
  openDays: number[];
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  maxPerSlot: number;
  minDaysAhead: number;
  maxDaysAhead: number;
  headcountOptions: string;
  genderOptions: string;
  services: AdminServiceRow[];
};

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

function parseGenderOptionsText(raw: string): { value: string; en: string }[] {
  const text = String(raw || '').trim();
  if (!text) return [];

  const chunks = text.includes('\n') ? text.split(/\r?\n/) : text.split(',');
  const list: { value: string; en: string }[] = [];

  chunks.forEach((chunk) => {
    const part = chunk.trim();
    if (!part) return;
    const pipe = part.indexOf('|');
    if (pipe < 0) {
      list.push({ value: part, en: '' });
      return;
    }
    const value = part.slice(0, pipe).trim();
    const en = part.slice(pipe + 1).trim();
    if (value) list.push({ value, en });
  });

  return list;
}

function normalizeTime(value: string): string {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeInt(raw: unknown, fallback: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseServiceOptionsText(raw: string): { label: string; labelEn: string }[] {
  const text = String(raw || '').trim();
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pipe = line.indexOf('|');
      if (pipe < 0) return { label: line, labelEn: '' };
      return {
        label: line.slice(0, pipe).trim(),
        labelEn: line.slice(pipe + 1).trim(),
      };
    })
    .filter((item) => item.label);
}

export function serializeGenderOptions(options: { value: string; en: string }[]): string {
  return options
    .map((item) => (item.en ? `${item.value}|${item.en}` : item.value))
    .join('\n');
}

async function writeSettingValue(key: string, value: string) {
  const supabase = createAdminSupabaseClient();
  const category = SETTING_CATEGORIES[key] || '其他';
  const { error } = await supabase.from('settings').upsert(
    { category, key, value: String(value ?? ''), description: '' },
    { onConflict: 'category,key' },
  );
  if (error) throw new Error(error.message);
}

export async function loadAdminSettings(): Promise<AdminSettingsData> {
  const supabase = createAdminSupabaseClient();
  const [{ data: settings, error: settingsError }, { data: services, error: servicesError }] =
    await Promise.all([
      supabase.from('settings').select('key, value'),
      supabase
        .from('services')
        .select('id, sort_order, name, name_en, options_json, active')
        .order('sort_order'),
    ]);

  if (settingsError) throw new Error(settingsError.message);
  if (servicesError) throw new Error(servicesError.message);

  const map = Object.fromEntries((settings ?? []).map((row) => [row.key, row.value]));
  const openDays = parseOpenDays(map.openDays);

  return {
    shopName: String(map.shopName || '沐紋映像').trim() || '沐紋映像',
    shopEmail: String(map.shopEmail || 'muwenphoto@gmail.com').trim() || 'muwenphoto@gmail.com',
    openDays: openDays.length ? openDays : [2, 3, 4, 5, 6],
    openTime: normalizeTime(map.openTime) || '10:00',
    closeTime: normalizeTime(map.closeTime) || '18:00',
    slotMinutes: parsePositiveInt(map.slotMinutes, 30),
    maxPerSlot: parsePositiveInt(map.maxPerSlot, 1),
    minDaysAhead: parseNonNegativeInt(map.minDaysAhead, 0),
    maxDaysAhead: parsePositiveInt(map.maxDaysAhead, 60),
    headcountOptions: String(map.headcountOptions || '1,2,3,4'),
    genderOptions: String(map.genderOptions || '男|Male\n女|Female\n其他|Other'),
    services: (services ?? []).map((row) => ({
      id: row.id,
      sort_order: row.sort_order,
      name: row.name,
      name_en: row.name_en || '',
      options: Array.isArray(row.options_json)
        ? row.options_json.map((opt) => ({
            label: String(opt?.label ?? ''),
            labelEn: String(opt?.labelEn ?? ''),
          }))
        : [],
      active: Boolean(row.active),
    })),
  };
}

async function logSettingsChange(
  session: { account: string; role: string },
  action: string,
  summary: string,
  detail = '',
) {
  const supabase = createAdminSupabaseClient();
  await supabase.from('admin_logs').insert({
    admin_account: session.account,
    admin_role: session.role,
    action,
    summary,
    detail,
  });
}

export async function saveAdminSettingsShop(
  session: { account: string; role: string },
  shopName: string,
  shopEmail: string,
) {
  shopName = String(shopName || '').trim();
  shopEmail = String(shopEmail || '').trim();
  if (shopName.length < 2) throw new Error('店名至少 2 字');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shopEmail)) {
    throw new Error('請填寫有效的通知信箱');
  }

  await writeSettingValue('shopName', shopName);
  await writeSettingValue('shopEmail', shopEmail);
  clearBookingConfigCache();
  await logSettingsChange(session, '更新設定', '店家資訊', shopName);
  return { message: '店家資訊已更新' };
}

export async function saveAdminSettingsBooking(
  session: { account: string; role: string },
  payload: {
    openDays: number[];
    openTime: string;
    closeTime: string;
    slotMinutes: number;
    maxPerSlot: number;
    minDaysAhead: number;
    maxDaysAhead: number;
  },
) {
  const openDays = (payload.openDays ?? []).filter((d) => d >= 0 && d <= 6);
  if (!openDays.length) throw new Error('請至少選擇一個營業日');

  const openTime = normalizeTime(payload.openTime);
  const closeTime = normalizeTime(payload.closeTime);
  if (!openTime || !closeTime) throw new Error('請填寫有效的營業時間');
  if (parseTime(openTime) >= parseTime(closeTime)) {
    throw new Error('結束時間必須晚於開始時間');
  }

  const slotMinutes = parsePositiveInt(payload.slotMinutes, 30);
  const maxPerSlot = parsePositiveInt(payload.maxPerSlot, 1);
  const minDaysAhead = parseNonNegativeInt(payload.minDaysAhead, 0);
  const maxDaysAhead = parsePositiveInt(payload.maxDaysAhead, 60);
  if (maxDaysAhead < minDaysAhead) {
    throw new Error('最遠可約天數不可小於最早可約');
  }

  await writeSettingValue('openDays', openDays.join(','));
  await writeSettingValue('openTime', openTime);
  await writeSettingValue('closeTime', closeTime);
  await writeSettingValue('slotMinutes', String(slotMinutes));
  await writeSettingValue('maxPerSlot', String(maxPerSlot));
  await writeSettingValue('minDaysAhead', String(minDaysAhead));
  await writeSettingValue('maxDaysAhead', String(maxDaysAhead));
  clearBookingConfigCache();
  await logSettingsChange(session, '更新設定', '預約規則', `${openTime}–${closeTime}`);
  return { message: '預約規則已更新（排班表時段會一併改變）' };
}

export async function saveAdminSettingsForm(
  session: { account: string; role: string },
  headcountText: string,
  genderText: string,
) {
  const headcountOptions = parseHeadcountOptions(headcountText);
  const genderOptions = parseGenderOptionsText(genderText);
  if (!headcountOptions.length) throw new Error('請至少填一個人數選項');
  if (!genderOptions.length) throw new Error('請至少填一個性別選項');

  await writeSettingValue('headcountOptions', headcountOptions.join(','));
  await writeSettingValue('genderOptions', serializeGenderOptions(genderOptions));
  clearBookingConfigCache();
  await logSettingsChange(session, '更新設定', '表單選項', '');
  return { message: '表單選項已更新' };
}

export async function addAdminService(
  session: { account: string; role: string },
  name: string,
  nameEn: string,
  optionsText: string,
) {
  name = String(name || '').trim();
  nameEn = String(nameEn || '').trim();
  if (name.length < 2) throw new Error('服務名稱至少 2 字');

  const supabase = createAdminSupabaseClient();
  const { data: existing } = await supabase.from('services').select('id').eq('name', name).maybeSingle();
  if (existing) throw new Error(`服務「${name}」已存在`);

  const { data: maxRow } = await supabase
    .from('services')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const options = parseServiceOptionsText(optionsText);
  const { error } = await supabase.from('services').insert({
    name,
    name_en: nameEn,
    options_json: options,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    active: true,
  });
  if (error) throw new Error(error.message);

  clearBookingConfigCache();
  await logSettingsChange(
    session,
    '新增服務',
    name,
    options.length ? `${options.length} 個方案` : '無子方案',
  );
  return { message: `已新增服務「${name}」` };
}

export async function updateAdminService(
  session: { account: string; role: string },
  id: string,
  payload: { name?: string; nameEn?: string; optionsText?: string },
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('services')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此服務');

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (name.length < 2) throw new Error('服務名稱至少 2 字');
    const { data: conflict } = await supabase
      .from('services')
      .select('id')
      .eq('name', name)
      .neq('id', id)
      .maybeSingle();
    if (conflict) throw new Error(`服務「${name}」已存在`);
    updates.name = name;
  }
  if (payload.nameEn !== undefined) {
    updates.name_en = String(payload.nameEn).trim();
  }
  if (payload.optionsText !== undefined) {
    updates.options_json = parseServiceOptionsText(payload.optionsText);
  }

  if (!Object.keys(updates).length) throw new Error('沒有可更新的內容');

  const { error } = await supabase.from('services').update(updates).eq('id', id);
  if (error) throw new Error(error.message);

  clearBookingConfigCache();
  await logSettingsChange(session, '更新服務', String(updates.name || row.name), '');
  return { message: '服務已更新' };
}

export async function toggleAdminService(
  session: { account: string; role: string },
  id: string,
  active: boolean,
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('services')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此服務');

  const { error } = await supabase.from('services').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);

  clearBookingConfigCache();
  await logSettingsChange(session, active ? '上架服務' : '下架服務', row.name, '');
  return {
    message: active ? `已上架「${row.name}」` : `已下架「${row.name}」（既有預約保留）`,
  };
}

export async function deleteAdminService(session: { account: string; role: string }, id: string) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('services')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此服務');

  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) throw new Error(error.message);

  clearBookingConfigCache();
  await logSettingsChange(session, '刪除服務', row.name, '');
  return { message: `已刪除服務「${row.name}」` };
}
