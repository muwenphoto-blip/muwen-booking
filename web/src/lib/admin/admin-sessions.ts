import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminRole } from '@/lib/admin/session';
import { formatRoleLabel } from '@/lib/admin/session';
import { isMissingRelationError } from '@/lib/supabase/errors';

type AdminSupabase = SupabaseClient;

export const ADMIN_SESSION_TTL_MS = 2 * 60 * 1000;

export async function registerAdminSession(
  supabase: AdminSupabase,
  params: {
    userId: string;
    account: string;
    role: AdminRole;
    photographerName: string;
  },
) {
  await pruneAdminSessions(supabase);
  const { data, error } = await supabase
    .from('admin_sessions')
    .insert({
      user_id: params.userId,
      account_name: params.account,
      role: params.role,
      photographer_name: params.photographerName || '',
      last_seen: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function touchAdminSession(supabase: AdminSupabase, sessionId: string) {
  if (!sessionId) return;
  await supabase
    .from('admin_sessions')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', sessionId);
}

export async function removeAdminSession(supabase: AdminSupabase, sessionId: string) {
  if (!sessionId) return;
  await supabase.from('admin_sessions').delete().eq('id', sessionId);
}

export async function pruneAdminSessions(supabase: AdminSupabase) {
  const cutoff = new Date(Date.now() - ADMIN_SESSION_TTL_MS).toISOString();
  await supabase.from('admin_sessions').delete().lt('last_seen', cutoff);
}

export async function listActiveAdminSessions(supabase: AdminSupabase) {
  try {
    await pruneAdminSessions(supabase);
  } catch (err) {
    if (err instanceof Error && isMissingRelationError(err.message)) {
      return { items: [], tableMissing: true };
    }
    throw err;
  }

  const cutoff = new Date(Date.now() - ADMIN_SESSION_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('id, account_name, role, photographer_name, last_seen')
    .gte('last_seen', cutoff)
    .order('last_seen', { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) {
      return { items: [], tableMissing: true };
    }
    throw new Error(error.message);
  }

  return {
    tableMissing: false,
    items: (data ?? []).map((row) => ({
      id: row.id,
      account: row.account_name,
      role: row.role,
      roleLabel: formatRoleLabel(row.role as AdminRole),
      photographerName: row.photographer_name || '',
      displayName: row.photographer_name
        ? `${row.account_name}（${formatRoleLabel(row.role as AdminRole)}｜${row.photographer_name}）`
        : `${row.account_name}（${formatRoleLabel(row.role as AdminRole)}）`,
      lastSeen: row.last_seen,
    })),
  };
}

export function formatSessionTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec} 秒前活動`;
  return `${Math.floor(sec / 60)} 分鐘前活動`;
}
