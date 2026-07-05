import { NextResponse } from 'next/server';
import { formatRoleLabel } from '@/lib/admin/session';
import { getAdminSession } from '@/lib/admin/get-session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const session = await getAdminSession();
    const supabase = createAdminSupabaseClient();
    const { count } = await supabase
      .from('admin_users')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      loggedIn: Boolean(session),
      needsBootstrap: (count ?? 0) === 0,
      session: session
        ? {
            account: session.account,
            role: session.role,
            roleLabel: formatRoleLabel(session.role),
            photographerName: session.photographerName,
          }
        : null,
    });
  } catch {
    return NextResponse.json({ loggedIn: false, needsBootstrap: false, session: null });
  }
}
