import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanManageAdminUser,
  assertManagerRole,
  normalizeAdminRole,
} from '@/lib/admin/permissions';
import { assertStaffBookingsClear } from '@/lib/admin/staff-bookings';
import { getAdminSession } from '@/lib/admin/get-session';
import {
  renamePhotographerName,
  validatePersonName,
} from '@/lib/admin/team-sync';
import { validateCasePrefix } from '@/lib/booking/case-number';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const { id } = await context.params;
    const body = await request.json();

    const supabase = createAdminSupabaseClient();
    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('id, name, active, case_prefix')
      .eq('id', id)
      .maybeSingle();
    if (staffError) throw new Error(staffError.message);
    if (!staffRow) throw new Error('找不到這位攝影師');

    const oldName = String(staffRow.name || '').trim();
    const changes: string[] = [];

    if (body.name !== undefined) {
      const newName = validatePersonName(String(body.name || ''), '攝影師姓名');
      if (oldName !== newName) {
        await renamePhotographerName(supabase, oldName, newName);
        changes.push(`姓名→${newName}`);
      }
    }

    if (body.casePrefix !== undefined) {
      const casePrefix = validateCasePrefix(String(body.casePrefix || ''));
      const currentPrefix = String(staffRow.case_prefix || '').trim().toUpperCase();
      if (casePrefix !== currentPrefix) {
        const { data: prefixOwner } = await supabase
          .from('staff')
          .select('name')
          .eq('case_prefix', casePrefix)
          .neq('id', id)
          .maybeSingle();
        if (prefixOwner) throw new Error(`案號前綴 ${casePrefix} 已被「${prefixOwner.name}」使用`);
        const { error } = await supabase.from('staff').update({ case_prefix: casePrefix }).eq('id', id);
        if (error) throw new Error(error.message);
        changes.push(`案號前綴→${casePrefix}`);
      }
    }

    if (body.active !== undefined) {
      const active = Boolean(body.active);
      if (active !== staffRow.active) {
        const { error } = await supabase.from('staff').update({ active }).eq('id', id);
        if (error) throw new Error(error.message);
        changes.push(active ? '已啟用服務' : '已停用服務');
      }
    }

    if (!changes.length) {
      return NextResponse.json({ ok: true, message: '沒有需要更新的項目' });
    }

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '修改攝影師',
      summary: `「${oldName}」${changes.join('、')}`,
      detail: '',
    });

    return NextResponse.json({
      ok: true,
      message: `已更新「${oldName}」`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '修改失敗' },
      { status: 400 },
    );
  }
}

async function countActiveUsers(supabase: ReturnType<typeof createAdminSupabaseClient>) {
  const { count, error } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
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
    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (staffError) throw new Error(staffError.message);
    if (!staffRow) throw new Error('找不到這位攝影師');

    const name = String(staffRow.name || '').trim();
    await assertStaffBookingsClear(supabase, name, '刪除');

    const { data: linkedUser } = await supabase
      .from('admin_users')
      .select('id, account_name, active, role, photographer_name')
      .eq('photographer_name', name)
      .maybeSingle();

    if (linkedUser) {
      const targetRole = normalizeAdminRole(linkedUser.role);
      if (targetRole === '主') {
        throw new Error('主控帳號不可刪除');
      }
      assertCanManageAdminUser(
        { id: session.userId, role: session.role },
        { id: linkedUser.id, role: targetRole, active: linkedUser.active },
      );
      const activeCount = await countActiveUsers(supabase);
      if (activeCount <= 1 && linkedUser.active) {
        throw new Error('至少需保留一組可用的後台帳號');
      }
      const { error: userError } = await supabase.from('admin_users').delete().eq('id', linkedUser.id);
      if (userError) throw new Error(userError.message);
    }

    const { error: deleteError } = await supabase.from('staff').delete().eq('id', id);
    if (deleteError) throw new Error(deleteError.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '刪除攝影師',
      summary: `「${name}」`,
      detail: '',
    });

    return NextResponse.json({
      ok: true,
      message: `已刪除「${name}」（預約選項已移除；既有預約紀錄保留）`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
