import { NextRequest, NextResponse } from 'next/server';
import { registerAdminSession } from '@/lib/admin/admin-sessions';
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from '@/lib/admin/login-security';
import { verifyPassword } from '@/lib/admin/password';
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

    if (!account) throw new Error('請輸入登入帳號');
    if (!password) throw new Error('請輸入密碼');

    const supabase = createAdminSupabaseClient();
    await assertLoginAllowed(supabase, account);

    const { data: match, error } = await supabase
      .from('admin_users')
      .select('id, account_name, password_hash, active, role, photographer_name')
      .eq('account_name', account)
      .eq('active', true)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!match) {
      await recordLoginFailure(supabase, account);
      throw new Error('登入帳號或密碼錯誤');
    }

    const ok = await verifyPassword(password, match.password_hash);
    if (!ok) {
      await recordLoginFailure(supabase, account);
      throw new Error('登入帳號或密碼錯誤');
    }

    await clearLoginFailures(supabase, account);

    let sessionId = '';
    try {
      sessionId = await registerAdminSession(supabase, {
        userId: match.id,
        account: match.account_name,
        role: match.role as AdminRole,
        photographerName: match.photographer_name || '',
      });
    } catch {
      // admin_sessions 表尚未建立時仍允許登入
    }

    const token = await signSession({
      userId: match.id,
      account: match.account_name,
      role: match.role as AdminRole,
      photographerName: match.photographer_name || '',
      sessionId,
    });

    await supabase.from('admin_logs').insert({
      admin_account: match.account_name,
      admin_role: match.role,
      action: '登入',
      summary: '登入後台',
      detail: '',
    });

    const response = NextResponse.json({
      ok: true,
      message: `歡迎回來，${formatRoleLabel(match.role as AdminRole)}「${match.account_name}」`,
      role: match.role,
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
      { error: err instanceof Error ? err.message : '登入失敗' },
      { status: 400 },
    );
  }
}
