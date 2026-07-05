import { NextResponse } from 'next/server';
import { removeAdminSession } from '@/lib/admin/admin-sessions';
import { getAdminSession } from '@/lib/admin/get-session';
import { getSessionCookieName } from '@/lib/admin/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST() {
  const session = await getAdminSession();
  if (session?.sessionId) {
    try {
      await removeAdminSession(createAdminSupabaseClient(), session.sessionId);
    } catch {
      // ignore
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
