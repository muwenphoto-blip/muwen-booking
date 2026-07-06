import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyPassword, validatePasswordStrength, hashPassword } from '@/lib/admin/password';
import {
  getDeliverySessionCookieName,
  getDeliverySessionMaxAgeSec,
  signDeliverySession,
} from '@/lib/delivery/session';
import { loadDeliveryBySlug, syncDeliveryExpiry } from '@/lib/delivery/store';

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const password = String(body.password || '');

    const loaded = await loadDeliveryBySlug(slug);
    if (!loaded) throw new Error('找不到交片連結');
    const delivery = await syncDeliveryExpiry(loaded);
    if (delivery.phase === 'expired') throw new Error('交片已到期，連結已失效');

    const ok = await verifyPassword(password, delivery.password_hash);
    if (!ok) throw new Error('密碼錯誤');

    const token = await signDeliverySession({ deliveryId: delivery.id, slug });
    const cookieStore = await cookies();
    cookieStore.set(getDeliverySessionCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getDeliverySessionMaxAgeSec(),
    });

    return NextResponse.json({
      ok: true,
      mustChangePassword: !delivery.password_changed,
      phase: delivery.phase,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '登入失敗' },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');

    const delivery = await loadDeliveryBySlug(slug);
    if (!delivery) throw new Error('找不到交片連結');

    const ok = await verifyPassword(currentPassword, delivery.password_hash);
    if (!ok) throw new Error('目前密碼錯誤');

    validatePasswordStrength(newPassword);
    if (newPassword !== confirmPassword) {
      throw new Error('兩次輸入的新密碼不一致');
    }

    const supabase = (await import('@/lib/supabase/admin')).createAdminSupabaseClient();
    const { error } = await supabase
      .from('photo_deliveries')
      .update({
        password_hash: await hashPassword(newPassword),
        password_changed: true,
      })
      .eq('id', delivery.id);
    if (error) throw new Error(error.message);

    const token = await signDeliverySession({ deliveryId: delivery.id, slug });
    const cookieStore = await cookies();
    cookieStore.set(getDeliverySessionCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: getDeliverySessionMaxAgeSec(),
    });

    return NextResponse.json({ ok: true, message: '密碼已更新' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新密碼失敗' },
      { status: 400 },
    );
  }
}
