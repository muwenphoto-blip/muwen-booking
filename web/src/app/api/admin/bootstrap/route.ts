import { NextRequest, NextResponse } from 'next/server';
import { registerAdminSession } from '@/lib/admin/admin-sessions';
import { hashPassword, validatePasswordStrength } from '@/lib/admin/password';
import {
  formatRoleLabel,
  getSessionCookieName,
  getSessionMaxAgeSec,
  signSession,
  type AdminRole,
} from '@/lib/admin/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = String(body.account || '').trim();
    const password = String(body.password || '').trim();
    const photographerName = String(body.photographerName || '').trim();

    if (!account) throw new Error('請輸入登入帳號');
    validatePasswordStrength(password);

    const supabase = createAdminSupabaseClient();
    const { count, error: countError } = await supabase
      .from('admin_users')
      .select('*', { count: 'exact', head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new Error('主控帳號已存在，請直接登入');
    }

    if (photographerName) {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('name')
        .eq('name', photographerName)
        .eq('active', true)
        .maybeSingle();
      if (!staffRow) {
        throw new Error('找不到這位攝影師，請先在 staff 表新增');
      }
    }

    const passwordHash = await hashPassword(password);
    const { data, error } = await supabase
      .from('admin_users')
      .insert({
        account_name: account,
        password_hash: passwordHash,
        active: true,
        role: '主',
        photographer_name: photographerName,
      })
      .select('id, account_name, role, photographer_name')
      .single();

    if (error) throw new Error(error.message);

    const sessionId = await registerAdminSession(supabase, {
      userId: data.id,
      account: data.account_name,
      role: data.role as AdminRole,
      photographerName: data.photographer_name || '',
    });

    const token = await signSession({
      userId: data.id,
      account: data.account_name,
      role: data.role as AdminRole,
      photographerName: data.photographer_name || '',
      sessionId,
    });

    const response = NextResponse.json({
      ok: true,
      message: `已建立${formatRoleLabel(data.role)}帳號「${data.account_name}」`,
    });
    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getSessionMaxAgeSec(),
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '建立失敗' },
      { status: 400 },
    );
  }
}
