import type { AdminRole } from '@/lib/admin/session';
import { formatRoleLabel, isManagerRole } from '@/lib/admin/session';

export function normalizeAdminRole(value: string): AdminRole {
  const text = String(value || '').trim();
  if (text === '主' || text === '主控' || text === '主後台' || text === 'master') {
    return '主';
  }
  if (text === '副主' || text === '副主控' || text === 'comaster') {
    return '副主';
  }
  if (text === '現場' || text === '現場服務人員' || text === 'store' || text === 'frontdesk') {
    return '現場';
  }
  if (text === '副' || text === '攝影師' || text === 'deputy' || text === 'photographer') {
    return '副';
  }
  return '副';
}

export function assertManagerRole(role: AdminRole) {
  if (!isManagerRole(role)) {
    throw new Error('您沒有權限執行此操作');
  }
}

export function assertMasterRole(role: AdminRole) {
  if (role !== '主') {
    throw new Error('僅主控可執行此操作');
  }
}

export function assertRoleAssignable(actorRole: AdminRole, targetRoleInput: string): AdminRole {
  const targetRole = normalizeAdminRole(targetRoleInput);
  if (targetRole === '主') {
    throw new Error('後台無法新增或指定主控');
  }
  if (targetRole === '副主' && actorRole !== '主') {
    throw new Error('僅主控可新增或指定副店長');
  }
  if (targetRole === '現場' && !isManagerRole(actorRole)) {
    throw new Error('僅管理員可新增現場服務人員');
  }
  return targetRole;
}

type AdminUserTarget = {
  id: string;
  role: AdminRole;
  active: boolean;
};

export function assertCanManageAdminUser(
  actor: { id: string; role: AdminRole },
  target: AdminUserTarget,
  options?: { blockMaster?: boolean; blockMessage?: string },
) {
  if (!isManagerRole(actor.role)) {
    throw new Error('您沒有權限執行此操作');
  }
  if (target.role === '主') {
    if (actor.role !== '主') {
      throw new Error('主控帳號不可操作');
    }
    if (options?.blockMaster) {
      throw new Error(options.blockMessage || '主控帳號不可進行此操作');
    }
    return;
  }
  if (actor.role === '副主' && target.role === '副主') {
    if (actor.id === target.id) {
      return;
    }
    throw new Error('僅主控可管理副店長帳號');
  }
  if (actor.id === target.id && options?.blockMaster) {
    throw new Error('無法刪除目前登入的帳號，請先登出後由其他管理員操作');
  }
}

export function formatAdminDisplayName(
  account: string,
  role: AdminRole,
  photographer: string,
): string {
  const roleLabel = formatRoleLabel(role);
  if (photographer) {
    return `${account}（${roleLabel}｜${photographer}）`;
  }
  return `${account}（${roleLabel}）`;
}

export function canManageAdminUser(
  actor: { id: string; role: AdminRole },
  target: AdminUserTarget,
): boolean {
  try {
    assertCanManageAdminUser(actor, target);
    return true;
  } catch {
    return false;
  }
}

export function canDeleteAdminUser(
  actor: { id: string; role: AdminRole },
  target: AdminUserTarget,
): boolean {
  if (target.role === '主') return false;
  try {
    assertCanManageAdminUser(actor, target, { blockMaster: true });
    return actor.id !== target.id;
  } catch {
    return false;
  }
}
