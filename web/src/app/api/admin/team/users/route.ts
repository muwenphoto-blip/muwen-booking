import { NextRequest, NextResponse } from 'next/server';
import {
  assertManagerRole,
  assertRoleAssignable,
} from '@/lib/admin/permissions';
import { hashPassword, validatePasswordStrength } from '@/lib/admin/password';
import { getAdminSession } from '@/lib/admin/get-session';
import { formatRoleLabel } from '@/lib/admin/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

async function ensureStaffMember(supabase: ReturnType<typeof createAdminSupabaseClient>, name: string) {
  const { data: existing } = await supabase.from('staff').select('id').eq('name', name).maybeSingle();
  if (existing) return;
  const { error } = await supabase.from('staff').insert({
    name,
    active: true,
    availability_schedule: '',
  });
  if (error) throw new Error(error.message);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const body = await request.json();
    const password = String(body.password || '').trim();
    const role = assertRoleAssignable(session.role, String(body.role || 'deputy'));
    validatePasswordStrength(password);

    const supabase = createAdminSupabaseClient();

    if (role === '現場') {
      const accountName = String(body.accountName || '').trim();
      if (accountName.length < 2) throw new Error('登入帳號至少 2 字');

      const { data: accountExists } = await supabase
        .from('admin_users')
        .select('id')
        .eq('account_name', accountName)
        .maybeSingle();
      if (accountExists) throw new Error('此登入帳號已存在');

      const passwordHash = await hashPassword(password);
      const { error } = await supabase.from('admin_users').insert({
        account_name: accountName,
        password_hash: passwordHash,
        active: true,
        role,
        photographer_name: '',
      });
      if (error) throw new Error(error.message);

      await supabase.from('admin_logs').insert({
        admin_account: session.account,
        admin_role: session.role,
        action: '新增帳號',
        summary: `新增「${accountName}」${formatRoleLabel(role)}`,
        detail: '門市現場服務帳號',
      });

      return NextResponse.json({
        ok: true,
        message: `已新增門市帳號「${accountName}」`,
      });
    }

    const photographerName = String(body.photographerName || '').trim();
    const accountName = String(body.accountName || photographerName || '').trim();

    if (photographerName.length < 2) throw new Error('請輸入攝影師姓名');
    if (accountName.length < 2) throw new Error('登入帳號至少 2 字');
    if (photographerName === '不指定') throw new Error('「不指定」為系統保留名稱');

    const { data: accountExists } = await supabase
      .from('admin_users')
      .select('id')
      .eq('account_name', accountName)
      .maybeSingle();
    if (accountExists) throw new Error('此登入帳號已存在');

    const { data: photographerLinked } = await supabase
      .from('admin_users')
      .select('id')
      .eq('photographer_name', photographerName)
      .maybeSingle();
    if (photographerLinked) throw new Error('此攝影師已有登入帳號');

    await ensureStaffMember(supabase, photographerName);

    const passwordHash = await hashPassword(password);
    const { error } = await supabase.from('admin_users').insert({
      account_name: accountName,
      password_hash: passwordHash,
      active: true,
      role,
      photographer_name: photographerName,
    });
    if (error) throw new Error(error.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '新增帳號',
      summary: `新增「${accountName}」${formatRoleLabel(role)}`,
      detail: `攝影師：${photographerName}`,
    });

    return NextResponse.json({
      ok: true,
      message: `已新增登入帳號「${accountName}」（${formatRoleLabel(role)}）`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '新增失敗' },
      { status: 400 },
    );
  }
}
