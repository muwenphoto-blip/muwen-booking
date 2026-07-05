import type { AdminRole } from '@/lib/admin/session';
import { isManagerRole } from '@/lib/admin/session';
import type { createAdminSupabaseClient } from '@/lib/supabase/admin';

export function isOwnStaffSchedule(
  actor: { photographerName: string },
  staffName: string,
): boolean {
  return String(actor.photographerName || '').trim() === staffName;
}

/** 此攝影師名稱是否綁定副主控帳號（排班僅主控可核定） */
export function staffRequiresMasterApproval(
  staffName: string,
  coMasterStaffNames: ReadonlySet<string>,
): boolean {
  return coMasterStaffNames.has(staffName);
}

export function pendingApproverLabel(requiresMasterApproval: boolean): string {
  return requiresMasterApproval ? '主控' : '主控／副主控';
}

export function canApproveStaffSchedule(
  actor: { role: AdminRole; photographerName: string },
  staffName: string,
  masterStaffNames: ReadonlySet<string>,
  coMasterStaffNames: ReadonlySet<string>,
): boolean {
  if (actor.role === '主') return true;
  if (actor.role !== '副主') return false;
  if (isOwnStaffSchedule(actor, staffName)) return false;
  if (masterStaffNames.has(staffName)) return false;
  if (staffRequiresMasterApproval(staffName, coMasterStaffNames)) return false;
  return true;
}

/** @deprecated 請改用 canApproveStaffSchedule */
export function canApproveSchedule(role: AdminRole): boolean {
  return isManagerRole(role);
}

export function canViewStaffSchedule(
  actor: { role: AdminRole; photographerName: string },
  staffName: string,
  masterStaffNames: ReadonlySet<string>,
  coMasterStaffNames: ReadonlySet<string>,
): boolean {
  if (actor.role === '主') return true;
  if (actor.role === '副') return isOwnStaffSchedule(actor, staffName);
  if (isOwnStaffSchedule(actor, staffName)) return true;
  if (masterStaffNames.has(staffName)) return false;
  if (coMasterStaffNames.has(staffName)) return false;
  return true;
}

export function canEditStaffSchedule(
  actor: { role: AdminRole; photographerName: string },
  staffName: string,
  masterStaffNames: ReadonlySet<string>,
  coMasterStaffNames: ReadonlySet<string>,
): boolean {
  return canViewStaffSchedule(actor, staffName, masterStaffNames, coMasterStaffNames);
}

export function assertScheduleView(
  actor: { role: AdminRole; photographerName: string },
  staffName: string,
  masterStaffNames: ReadonlySet<string>,
  coMasterStaffNames: ReadonlySet<string>,
) {
  if (canViewStaffSchedule(actor, staffName, masterStaffNames, coMasterStaffNames)) return;
  if (actor.role === '副主' && masterStaffNames.has(staffName)) {
    throw new Error('副主控無法查看主控的排班表');
  }
  if (actor.role === '副主' && coMasterStaffNames.has(staffName)) {
    throw new Error('副主控無法查看其他副主控的排班表');
  }
  throw new Error('您只能查看自己的排班表');
}

/** 儲存時是否必須送審（不能直接核定生效） */
export function mustSubmitForApproval(
  actor: { role: AdminRole; photographerName: string },
  staffName: string,
): boolean {
  if (actor.role === '主') return false;
  if (actor.role === '副') return true;
  return isOwnStaffSchedule(actor, staffName);
}

export function filterStaffOptionsForScheduleView(
  allStaff: string[],
  actor: { role: AdminRole; photographerName: string },
  masterStaffNames: ReadonlySet<string>,
  coMasterStaffNames: ReadonlySet<string>,
): string[] {
  return allStaff.filter((name) =>
    canViewStaffSchedule(actor, name, masterStaffNames, coMasterStaffNames),
  );
}

export async function loadMasterStaffNames(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('admin_users')
    .select('photographer_name')
    .eq('role', '主')
    .eq('active', true);
  return new Set(
    (data ?? [])
      .map((row) => String(row.photographer_name || '').trim())
      .filter(Boolean),
  );
}

export async function loadCoMasterStaffNames(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('admin_users')
    .select('photographer_name')
    .eq('role', '副主')
    .eq('active', true);
  return new Set(
    (data ?? [])
      .map((row) => String(row.photographer_name || '').trim())
      .filter(Boolean),
  );
}

export async function loadScheduleRoleSets(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
): Promise<{ masterStaffNames: Set<string>; coMasterStaffNames: Set<string> }> {
  const [masterStaffNames, coMasterStaffNames] = await Promise.all([
    loadMasterStaffNames(supabase),
    loadCoMasterStaffNames(supabase),
  ]);
  return { masterStaffNames, coMasterStaffNames };
}
