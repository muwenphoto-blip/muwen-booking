import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, validatePasswordStrength } from '@/lib/admin/password';
import {
  applyPhotographerChange,
  assertAccountNameAvailable,
  validateAccountName,
  validatePersonName,
} from '@/lib/admin/team-sync';
import { normalizeAdminRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import {
  formatRoleLabel,
  getSessionCookieName,
  getSessionMaxAgeSec,
  signSession,
  type AdminRole,
} from '@/lib/admin/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function roleFromDb(value: string): AdminRole {
  return normalizeAdminRole(value);
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getSessionMaxAgeSec(),
  });
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('account_name, photographer_name, role')
      .eq('id', session.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!user) throw new Error('找不到您的帳號');

    const role = roleFromDb(user.role);
    return NextResponse.json({
      profile: {
        accountName: user.account_name,
        photographerName: user.photographer_name || '',
        role,
        roleLabel: formatRoleLabel(role),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入個人資料' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: user, error: loadError } = await supabase
      .from('admin_users')
      .select('id, account_name, photographer_name, role')
      .eq('id', session.userId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!user) throw new Error('找不到您的帳號');

    const role = roleFromDb(user.role);
    const body = await request.json();
    const updates: Record<string, string> = {};
    const changes: string[] = [];

    if (body.accountName !== undefined) {
      const newAccountName = validateAccountName(body.accountName);
      if (newAccountName !== user.account_name) {
        await assertAccountNameAvailable(supabase, newAccountName, session.userId);
        updates.account_name = newAccountName;
        changes.push(`帳號→${newAccountName}`);
      }
    }

    if (body.photographerName !== undefined) {
      const newName = validatePersonName(body.photographerName, '攝影師姓名');
      const oldName = String(user.photographer_name || '').trim();
      if (role === '主' && !newName) {
        throw new Error('主帳號必須連結一位攝影師');
      }
      if (newName !== oldName) {
        await applyPhotographerChange(supabase, {
          userId: session.userId,
          oldName,
          newName,
        });
        changes.push(`攝影師→${newName}`);
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
      const { error: updateError } = await supabase
        .from('admin_users')
        .update(updates)
        .eq('id', session.userId);
      if (updateError) throw new Error(updateError.message);
    }

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '修改個人資料',
      summary: changes.join('、'),
      detail: '',
    });

    const { data: refreshed } = await supabase
      .from('admin_users')
      .select('account_name, photographer_name, role')
      .eq('id', session.userId)
      .maybeSingle();

    const finalAccount = refreshed?.account_name || updates.account_name || user.account_name;
    const finalPhotographer =
      refreshed?.photographer_name ||
      (body.photographerName !== undefined
        ? validatePersonName(body.photographerName, '攝影師姓名')
        : user.photographer_name) ||
      '';
    const finalRole = roleFromDb(refreshed?.role || user.role);

    const token = await signSession({
      userId: session.userId,
      account: finalAccount,
      role: finalRole,
      photographerName: finalPhotographer,
      sessionId: session.sessionId,
    });

    const response = NextResponse.json({
      ok: true,
      message:
        finalAccount !== user.account_name
          ? `已更新，下次登入請用新帳號「${finalAccount}」`
          : '已更新個人資料',
      profile: {
        accountName: finalAccount,
        photographerName: finalPhotographer,
        role: finalRole,
        roleLabel: formatRoleLabel(finalRole),
      },
    });
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新失敗' },
      { status: 400 },
    );
  }
}
