import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminClientInfo } from '@/lib/admin/client-info';
import type { AdminRole } from '@/lib/admin/session';
import { formatRoleLabel } from '@/lib/admin/session';
import { isMissingColumnError, isMissingRelationError } from '@/lib/supabase/errors';

type AdminSupabase = SupabaseClient;

export const ADMIN_SESSION_TTL_MS = 5 * 60 * 1000;

export async function registerAdminSession(
  supabase: AdminSupabase,
  params: {
    userId: string;
    account: string;
    role: AdminRole;
    photographerName: string;
    client?: Partial<AdminClientInfo>;
  },
) {
  await pruneAdminSessions(supabase);
  const client = params.client ?? {};
  const payload = {
    user_id: params.userId,
    account_name: params.account,
    role: params.role,
    photographer_name: params.photographerName || '',
    device_label: client.deviceLabel || '',
    user_agent: client.userAgent || '',
    client_ip: client.clientIp || '',
    location_label: client.locationLabel || '',
    last_seen: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('admin_sessions').insert(payload).select('id').single();
  if (error) {
    if (isMissingColumnError(error.message)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('admin_sessions')
        .insert({
          user_id: payload.user_id,
          account_name: payload.account_name,
          role: payload.role,
          photographer_name: payload.photographer_name,
          last_seen: payload.last_seen,
        })
        .select('id')
        .single();
      if (legacyError) throw new Error(legacyError.message);
      return legacyData.id as string;
    }
    throw new Error(error.message);
  }
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
    .select(
      'id, account_name, role, photographer_name, device_label, user_agent, client_ip, location_label, last_seen',
    )
    .gte('last_seen', cutoff)
    .order('last_seen', { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) {
      return { items: [], tableMissing: true };
    }
    if (isMissingColumnError(error.message)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('admin_sessions')
        .select('id, account_name, role, photographer_name, last_seen')
        .gte('last_seen', cutoff)
        .order('last_seen', { ascending: false });
      if (legacyError) throw new Error(legacyError.message);
      return {
        tableMissing: false,
        items: (legacyData ?? []).map((row) => mapSessionRow(row)),
      };
    }
    throw new Error(error.message);
  }

  return {
    tableMissing: false,
    items: (data ?? []).map((row) => mapSessionRow(row)),
  };
}

function mapSessionRow(row: {
  id: string;
  account_name: string;
  role: string;
  photographer_name: string | null;
  device_label?: string | null;
  user_agent?: string | null;
  client_ip?: string | null;
  location_label?: string | null;
  last_seen: string;
}) {
  const deviceLabel = String(row.device_label || '').trim();
  const locationLabel = String(row.location_label || '').trim();
  const clientIp = String(row.client_ip || '').trim();
  return {
    id: row.id,
    account: row.account_name,
    role: row.role,
    roleLabel: formatRoleLabel(row.role as AdminRole),
    photographerName: row.photographer_name || '',
    displayName: row.photographer_name
      ? `${row.account_name}（${formatRoleLabel(row.role as AdminRole)}｜${row.photographer_name}）`
      : `${row.account_name}（${formatRoleLabel(row.role as AdminRole)}）`,
    deviceLabel: deviceLabel || inferDeviceLabel(row.user_agent),
    locationLabel: locationLabel || clientIp || '未知地區',
    clientIp,
    lastSeen: row.last_seen,
  };
}

function inferDeviceLabel(userAgent?: string | null): string {
  const ua = String(userAgent || '').trim();
  if (!ua) return '未知裝置';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android 手機' : 'Android 平板';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  return '其他裝置';
}

export function formatSessionTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec} 秒前活動`;
  return `${Math.floor(sec / 60)} 分鐘前活動`;
}
