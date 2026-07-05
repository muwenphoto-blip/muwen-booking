import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRoleLabel, type AdminRole } from '@/lib/admin/session';

type AdminSupabase = SupabaseClient;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    hour12: false,
    timeZone: 'Asia/Taipei',
  });
}

export async function readAdminLogs(
  supabase: AdminSupabase,
  query: string,
  limit = DEFAULT_LIMIT,
) {
  const capped = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const { data, error } = await supabase
    .from('admin_logs')
    .select('id, created_at, admin_account, admin_role, action, summary, detail')
    .order('created_at', { ascending: false })
    .limit(query ? 500 : capped);
  if (error) throw new Error(error.message);

  let logs = (data ?? []).map((row) => ({
    id: row.id,
    timestamp: formatLogTime(row.created_at),
    actor: row.admin_account || '',
    roleLabel: formatRoleLabel((row.admin_role || '副') as AdminRole),
    action: row.action || '',
    summary: row.summary || '',
    detail: row.detail || '',
  }));

  const q = query.trim().toLowerCase();
  if (q) {
    logs = logs.filter((entry) => {
      const haystack = [
        entry.timestamp,
        entry.actor,
        entry.roleLabel,
        entry.action,
        entry.summary,
        entry.detail,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    logs = logs.slice(0, capped);
  }

  return logs;
}
