import { NextRequest, NextResponse } from 'next/server';
import { getRecoveryKeyHash, setRecoveryKeyHash } from '@/lib/admin/login-security';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/admin/password';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);
    const supabase = createAdminSupabaseClient();
    const hash = await getRecoveryKeyHash(supabase);
    return NextResponse.json({ configured: Boolean(hash) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const body = await request.json();
    const recoveryKey = String(body.recoveryKey || '').trim();
    const confirmKey = String(body.confirmKey || '').trim();
    if (recoveryKey.length < 16) {
      throw new Error('復原金鑰至少 16 字，建議 20 字以上隨機英數');
    }
    if (recoveryKey !== confirmKey) {
      throw new Error('兩次輸入的復原金鑰不一致');
    }

    const supabase = createAdminSupabaseClient();
    await setRecoveryKeyHash(supabase, await hashPassword(recoveryKey));

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '設定復原金鑰',
      summary: '已更新主控復原金鑰',
      detail: '',
    });

    return NextResponse.json({
      ok: true,
      message: '復原金鑰已設定，請離線妥善保存。',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '設定失敗' },
      { status: 400 },
    );
  }
}
