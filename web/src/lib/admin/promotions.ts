import { applyItemRowAutoDiscount } from '@/lib/admin/document-discount';
import type { DocumentItemRow } from '@/lib/admin/booking-documents';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export type PromotionRuleType = 'per_extra' | 'group_free' | 'fixed';

export type PromotionRuleConfig = {
  basePeople?: number;
  perExtra?: number;
  groupPay?: number;
  groupFree?: number;
  amount?: number;
};

export type PromotionTarget = {
  serviceId: string;
  optionLabels: string[];
};

export type AdminPromotionRow = {
  id: string;
  name: string;
  description: string;
  ruleType: PromotionRuleType;
  ruleConfig: PromotionRuleConfig;
  targets: PromotionTarget[];
  startsAt: string;
  endsAt: string;
  active: boolean;
  sortOrder: number;
};

function parseRuleType(raw: unknown): PromotionRuleType {
  if (raw === 'per_extra' || raw === 'group_free' || raw === 'fixed') return raw;
  return 'fixed';
}

function parseRuleConfig(raw: unknown): PromotionRuleConfig {
  if (!raw || typeof raw !== 'object') return {};
  const row = raw as Record<string, unknown>;
  const num = (key: string) => {
    const n = parseInt(String(row[key] ?? ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return {
    basePeople: num('basePeople'),
    perExtra: num('perExtra'),
    groupPay: num('groupPay'),
    groupFree: num('groupFree'),
    amount: num('amount'),
  };
}

function parseTargets(raw: unknown): PromotionTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const serviceId = String(row.serviceId || '').trim();
      if (!serviceId) return null;
      const optionLabels = Array.isArray(row.optionLabels)
        ? row.optionLabels.map((label) => String(label || '').trim()).filter(Boolean)
        : [];
      return { serviceId, optionLabels };
    })
    .filter((item): item is PromotionTarget => item !== null);
}

function mapPromotionRow(row: {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  rule_config: unknown;
  targets: unknown;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  sort_order: number;
}): AdminPromotionRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    ruleType: parseRuleType(row.rule_type),
    ruleConfig: parseRuleConfig(row.rule_config),
    targets: parseTargets(row.targets),
    startsAt: row.starts_at || '',
    endsAt: row.ends_at || '',
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function promotionMatchesTarget(
  promotion: AdminPromotionRow,
  serviceId: string,
  optionLabel: string,
  onDate = todayIsoDate(),
): boolean {
  if (!promotion.active) return false;
  if (promotion.startsAt && promotion.startsAt > onDate) return false;
  if (promotion.endsAt && promotion.endsAt < onDate) return false;
  return promotion.targets.some((target) => {
    if (target.serviceId !== serviceId) return false;
    if (!target.optionLabels.length) return true;
    if (!optionLabel) return false;
    return target.optionLabels.includes(optionLabel);
  });
}

export function findPromotionForServiceOption(
  promotions: AdminPromotionRow[],
  serviceId: string,
  optionLabel: string,
  onDate = todayIsoDate(),
): AdminPromotionRow | null {
  const matches = promotions
    .filter((promotion) => promotionMatchesTarget(promotion, serviceId, optionLabel, onDate))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hant'));
  return matches[0] ?? null;
}

export function resolveServiceIdByName(
  services: { id: string; name: string }[],
  serviceName: string,
): string {
  return services.find((item) => item.name === serviceName)?.id || '';
}

function shouldAutoApplyPromotion(row: DocumentItemRow): boolean {
  if (row.promotionId) return true;
  if (row.discountMode && row.discountMode !== 'manual') return true;
  return !String(row.discount || '').trim();
}

export function applyPromotionToItemRow(
  row: DocumentItemRow,
  promotion: AdminPromotionRow | null,
): DocumentItemRow {
  if (!promotion) {
    if (!row.promotionId) return row;
    return {
      ...row,
      promotionId: '',
      promotionName: '',
      discountMode: 'manual',
    };
  }

  if (!shouldAutoApplyPromotion(row)) return row;

  const patch: Partial<DocumentItemRow> = {
    promotionId: promotion.id,
    promotionName: promotion.name,
  };

  if (promotion.ruleType === 'fixed') {
    patch.discountMode = 'manual';
    patch.discount = String(promotion.ruleConfig.amount ?? 0);
  } else if (promotion.ruleType === 'per_extra') {
    patch.discountMode = 'per_extra';
    patch.discountBasePeople = String(promotion.ruleConfig.basePeople ?? 4);
    patch.discountPerExtra = String(promotion.ruleConfig.perExtra ?? 0);
  } else {
    patch.discountMode = 'group_free';
    patch.discountGroupPay = String(promotion.ruleConfig.groupPay ?? 4);
    patch.discountGroupFree = String(promotion.ruleConfig.groupFree ?? 1);
  }

  return applyItemRowAutoDiscount({ ...row, ...patch });
}

export function describePromotionRule(promotion: AdminPromotionRow): string {
  if (promotion.ruleType === 'per_extra') {
    const base = promotion.ruleConfig.basePeople ?? 0;
    const per = promotion.ruleConfig.perExtra ?? 0;
    return `超過 ${base} 人，每人減 ${per} 元`;
  }
  if (promotion.ruleType === 'group_free') {
    const pay = promotion.ruleConfig.groupPay ?? 0;
    const free = promotion.ruleConfig.groupFree ?? 0;
    return `每滿 ${pay} 人送 ${free} 人`;
  }
  return `固定折抵 ${promotion.ruleConfig.amount ?? 0} 元`;
}

export async function loadAdminPromotions(): Promise<AdminPromotionRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('promotions')
    .select(
      'id, name, description, rule_type, rule_config, targets, starts_at, ends_at, active, sort_order',
    )
    .order('sort_order')
    .order('name');

  if (error) {
    if (error.message.includes('promotions')) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map(mapPromotionRow);
}

function validatePromotionPayload(payload: {
  name?: string;
  ruleType?: string;
  ruleConfig?: PromotionRuleConfig;
  targets?: PromotionTarget[];
  startsAt?: string;
  endsAt?: string;
}) {
  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('活動名稱至少 2 字');

  const ruleType = parseRuleType(payload.ruleType);
  const ruleConfig = payload.ruleConfig ?? {};
  if (ruleType === 'fixed' && !(Number(ruleConfig.amount) > 0)) {
    throw new Error('請填寫固定折抵金額');
  }
  if (ruleType === 'per_extra') {
    if (!(Number(ruleConfig.perExtra) > 0)) throw new Error('請填寫每人減額');
  }
  if (ruleType === 'group_free') {
    if (!(Number(ruleConfig.groupPay) > 0) || !(Number(ruleConfig.groupFree) > 0)) {
      throw new Error('請填寫滿人送人的付費人數與送人數');
    }
  }

  const targets = payload.targets ?? [];
  if (!targets.length) throw new Error('請至少選擇一個適用方案');

  const startsAt = String(payload.startsAt || '').trim();
  const endsAt = String(payload.endsAt || '').trim();
  if (startsAt && endsAt && startsAt > endsAt) {
    throw new Error('結束日期不可早於開始日期');
  }
}

async function logPromotionChange(
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

export async function addAdminPromotion(
  session: { account: string; role: string },
  payload: {
    name: string;
    description?: string;
    ruleType: PromotionRuleType;
    ruleConfig: PromotionRuleConfig;
    targets: PromotionTarget[];
    startsAt?: string;
    endsAt?: string;
    active?: boolean;
  },
) {
  validatePromotionPayload(payload);

  const supabase = createAdminSupabaseClient();
  const { data: maxRow } = await supabase
    .from('promotions')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('promotions').insert({
    name: String(payload.name).trim(),
    description: String(payload.description || '').trim(),
    rule_type: payload.ruleType,
    rule_config: payload.ruleConfig,
    targets: payload.targets,
    starts_at: String(payload.startsAt || '').trim() || null,
    ends_at: String(payload.endsAt || '').trim() || null,
    active: payload.active !== false,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
  });
  if (error) throw new Error(error.message);

  await logPromotionChange(session, '新增優惠', payload.name);
  return { message: `已新增優惠活動「${payload.name}」` };
}

export async function updateAdminPromotion(
  session: { account: string; role: string },
  id: string,
  payload: {
    name?: string;
    description?: string;
    ruleType?: PromotionRuleType;
    ruleConfig?: PromotionRuleConfig;
    targets?: PromotionTarget[];
    startsAt?: string;
    endsAt?: string;
    active?: boolean;
  },
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('promotions')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此優惠活動');

  validatePromotionPayload({
    name: payload.name ?? row.name,
    ruleType: payload.ruleType,
    ruleConfig: payload.ruleConfig,
    targets: payload.targets,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
  });

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) updates.name = String(payload.name).trim();
  if (payload.description !== undefined) updates.description = String(payload.description).trim();
  if (payload.ruleType !== undefined) updates.rule_type = payload.ruleType;
  if (payload.ruleConfig !== undefined) updates.rule_config = payload.ruleConfig;
  if (payload.targets !== undefined) updates.targets = payload.targets;
  if (payload.startsAt !== undefined) {
    updates.starts_at = String(payload.startsAt).trim() || null;
  }
  if (payload.endsAt !== undefined) {
    updates.ends_at = String(payload.endsAt).trim() || null;
  }
  if (payload.active !== undefined) updates.active = Boolean(payload.active);

  const { error } = await supabase.from('promotions').update(updates).eq('id', id);
  if (error) throw new Error(error.message);

  await logPromotionChange(session, '更新優惠', String(payload.name ?? row.name));
  return { message: '優惠活動已更新' };
}

export async function toggleAdminPromotion(
  session: { account: string; role: string },
  id: string,
  active: boolean,
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('promotions')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此優惠活動');

  const { error } = await supabase.from('promotions').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);

  await logPromotionChange(session, active ? '啟用優惠' : '停用優惠', row.name);
  return { message: active ? '已啟用優惠活動' : '已停用優惠活動' };
}

export async function deleteAdminPromotion(
  session: { account: string; role: string },
  id: string,
) {
  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchError } = await supabase
    .from('promotions')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('找不到此優惠活動');

  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await logPromotionChange(session, '刪除優惠', row.name);
  return { message: '優惠活動已刪除' };
}
