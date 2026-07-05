import { cookies } from 'next/headers';
import { touchAdminSession } from '@/lib/admin/admin-sessions';
import { normalizeAdminRole } from '@/lib/admin/permissions';
import {
  getSessionCookieName,
  verifySessionToken,
  type AdminRole,
  type AdminSession,
} from '@/lib/admin/session';

async function loadLiveSession(session: AdminSession): Promise<AdminSession | null> {
  const { createAdminSupabaseClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminSupabaseClient();
  const { data: user, error } = await supabase
    .from('admin_users')
    .select('account_name, active, role, photographer_name')
    .eq('id', session.userId)
    .maybeSingle();

  if (error || !user?.active) return null;

  return {
    userId: session.userId,
    account: user.account_name,
    role: normalizeAdminRole(user.role) as AdminRole,
    photographerName: String(user.photographer_name || '').trim(),
    sessionId: session.sessionId,
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const live = await loadLiveSession(session);
  if (!live) return null;

  if (live.sessionId) {
    try {
      const { createAdminSupabaseClient } = await import('@/lib/supabase/admin');
      await touchAdminSession(createAdminSupabaseClient(), live.sessionId);
    } catch {
      // ignore touch failures
    }
  }

  return live;
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error('請先登入後台');
  }
  return session;
}
