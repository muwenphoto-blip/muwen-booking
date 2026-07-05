import { NextRequest, NextResponse } from 'next/server';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { formatRoleLabel, type AdminRole } from '@/lib/admin/session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    hour12: false,
    timeZone: 'Asia/Taipei',
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || '';
    const limitRaw = parseInt(request.nextUrl.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const limit = Math.min(Math.max(limitRaw || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('admin_logs')
      .select('id, created_at, admin_account, admin_role, action, summary, detail')
      .order('created_at', { ascending: false })
      .limit(query ? 500 : limit);

    if (error) throw new Error(error.message);

    let logs = (data ?? []).map((row) => ({
      id: row.id,
      timestamp: formatLogTime(row.created_at),
      actor: row.admin_account || '',
      role: row.admin_role || '',
      roleLabel: formatRoleLabel((row.admin_role || '副') as AdminRole),
      action: row.action || '',
      summary: row.summary || '',
      detail: row.detail || '',
    }));

    if (query) {
      logs = logs.filter((entry) => {
        const haystack = [
          entry.timestamp,
          entry.actor,
          entry.role,
          entry.roleLabel,
          entry.action,
          entry.summary,
          entry.detail,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
      logs = logs.slice(0, limit);
    }

    return NextResponse.json({ logs, query, limit });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入操作日誌' },
      { status: 400 },
    );
  }
}
