import { NextRequest, NextResponse } from 'next/server';
import { getRecoveryKeyHash } from '@/lib/admin/login-security';
import {
  assertRecoveryAllowed,
  clearRecoveryFailures,
  recordRecoveryFailure,
} from '@/lib/admin/recovery-security';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/admin/password';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const recoveryKey = String(body.recoveryKey || '').trim();
    const newPassword = String(body.newPassword || '').trim();
    const confirmPassword = String(body.confirmPassword || '').trim();
    const ip = clientIp(request);

    if (!recoveryKey) throw new Error('請輸入復原金鑰');
    validatePasswordStrength(newPassword);
    if (newPassword !== confirmPassword) {
      throw new Error('兩次輸入的新密碼不一致');
    }

    const supabase = createAdminSupabaseClient();
    await assertRecoveryAllowed(supabase, ip);
    const stored = await getRecoveryKeyHash(supabase);
    if (!stored) {
      throw new Error('尚未設定復原金鑰，請聯絡主控在系統設定中設定');
    }

    const ok = await verifyPassword(recoveryKey, stored);
    if (!ok) {
      await recordRecoveryFailure(supabase, ip);
      throw new Error('復原金鑰錯誤');
    }

    await clearRecoveryFailures(supabase, ip);

    const { data: master } = await supabase
      .from('admin_users')
      .select('id, account_name')
      .eq('role', '主')
      .maybeSingle();
    if (!master) throw new Error('找不到主控帳號');

    const passwordHash = await hashPassword(newPassword);
    const { error } = await supabase
      .from('admin_users')
      .update({ password_hash: passwordHash, active: true })
      .eq('id', master.id);
    if (error) throw new Error(error.message);

    await supabase.from('admin_logs').insert({
      admin_account: master.account_name,
      admin_role: '主',
      action: '復原重設密碼',
      summary: '使用復原金鑰重設主控密碼',
      detail: '',
    });

    return NextResponse.json({
      ok: true,
      message: `已重設主控「${master.account_name}」的密碼，請用新密碼登入。`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '重設失敗' },
      { status: 400 },
    );
  }
}
