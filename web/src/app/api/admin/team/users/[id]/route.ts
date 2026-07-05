import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanManageAdminUser,
  assertManagerRole,
  assertRoleAssignable,
  normalizeAdminRole,
} from '@/lib/admin/permissions';
import { hashPassword, validatePasswordStrength } from '@/lib/admin/password';
import {
  applyPhotographerChange,
  assertAccountNameAvailable,
  syncStaffActiveByPhotographer,
  validateAccountName,
  validatePersonName,
} from '@/lib/admin/team-sync';
import { getAdminSession } from '@/lib/admin/get-session';
import { formatRoleLabel } from '@/lib/admin/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

async function loadTargetUser(supabase: ReturnType<typeof createAdminSupabaseClient>, id: string) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, account_name, active, role, photographer_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('找不到這個帳號');
  return data;
}

async function countActiveUsers(supabase: ReturnType<typeof createAdminSupabaseClient>) {
  const { count, error } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const target = await loadTargetUser(supabase, id);
    const targetRole = normalizeAdminRole(target.role);

    assertCanManageAdminUser(
      { id: session.userId, role: session.role },
      { id: target.id, role: targetRole, active: target.active },
    );

    const body = await request.json();
    const updates: Record<string, string | boolean> = {};
    const changes: string[] = [];

    if (session.userId === id) {
      if (body.role !== undefined) {
        throw new Error('無法自行變更角色');
      }
      if (body.active !== undefined && Boolean(body.active) !== target.active) {
        throw new Error('無法自行變更帳號啟用狀態');
      }
    }

    if (body.accountName !== undefined) {
      const newAccountName = validateAccountName(body.accountName);
      if (targetRole === '主' && session.role !== '主') {
        throw new Error('僅主控可修改主控登入帳號');
      }
      if (newAccountName !== target.account_name) {
        await assertAccountNameAvailable(supabase, newAccountName, id);
        updates.account_name = newAccountName;
        changes.push(`帳號→${newAccountName}`);
      }
    }

    if (body.role !== undefined) {
      const nextRole = assertRoleAssignable(session.role, String(body.role));
      if (targetRole === '主') {
        throw new Error('主控帳號不可變更角色');
      }
      if (nextRole !== targetRole) {
        updates.role = nextRole;
        changes.push(`角色→${formatRoleLabel(nextRole)}`);
      }
    }

    if (body.photographerName !== undefined) {
      const newName = validatePersonName(body.photographerName, '攝影師姓名');
      const oldName = String(target.photographer_name || '').trim();
      if (targetRole === '主' && !newName) {
        throw new Error('主帳號必須連結一位攝影師');
      }
      if (newName !== oldName) {
        await applyPhotographerChange(supabase, {
          userId: id,
          oldName,
          newName,
        });
        changes.push(`攝影師→${newName}`);
      }
    }

    if (body.active !== undefined) {
      const active = Boolean(body.active);
      if (targetRole === '主' && !active) {
        throw new Error('主控帳號不可停用');
      }
      if (active !== target.active) {
        if (!active) {
          const activeCount = await countActiveUsers(supabase);
          if (activeCount <= 1 && target.active) {
            throw new Error('至少需保留一組可用的後台帳號');
          }
        }
        updates.active = active;
        changes.push(active ? '已啟用' : '已停用');
      }
    }

    if (body.password !== undefined) {
      const password = String(body.password || '').trim();
      if (password) {
        validatePasswordStrength(password);
        updates.password_hash = await hashPassword(password);
        changes.push('已重設密碼');
      }
    }

    if (!Object.keys(updates).length && !changes.length) {
      return NextResponse.json({ ok: true, message: '沒有需要更新的項目' });
    }

    if (Object.keys(updates).length) {
      const { error } = await supabase.from('admin_users').update(updates).eq('id', id);
      if (error) throw new Error(error.message);

      if (updates.active !== undefined && target.photographer_name) {
        await syncStaffActiveByPhotographer(
          supabase,
          target.photographer_name,
          updates.active as boolean,
        );
      }
    }

    if (changes.length) {
      await supabase.from('admin_logs').insert({
        admin_account: session.account,
        admin_role: session.role,
        action: '修改帳號',
        summary: `「${target.account_name}」${changes.join('、')}`,
        detail: '',
      });
    }

    const { data: refreshed } = await supabase
      .from('admin_users')
      .select('account_name')
      .eq('id', id)
      .maybeSingle();
    const finalAccountName = refreshed?.account_name || target.account_name;
    return NextResponse.json({
      ok: true,
      message:
        finalAccountName !== target.account_name
          ? `已更新，下次登入請用新帳號「${finalAccountName}」`
          : `已更新「${finalAccountName}」`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新失敗' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const target = await loadTargetUser(supabase, id);
    const targetRole = normalizeAdminRole(target.role);

    assertCanManageAdminUser(
      { id: session.userId, role: session.role },
      { id: target.id, role: targetRole, active: target.active },
      { blockMaster: true, blockMessage: '主控帳號不可刪除' },
    );

    if (session.userId === target.id) {
      throw new Error('無法刪除目前登入的帳號，請先登出後由其他管理員操作');
    }

    const activeCount = await countActiveUsers(supabase);
    if (activeCount <= 1 && target.active) {
      throw new Error('至少需保留一組可用的後台帳號');
    }

    const { error } = await supabase.from('admin_users').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '刪除帳號',
      summary: `「${target.account_name}」`,
      detail: target.photographer_name ? `攝影師：${target.photographer_name}` : '',
    });

    return NextResponse.json({
      ok: true,
      message: `已刪除「${target.account_name}」的登入帳號（既有預約保留）`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
