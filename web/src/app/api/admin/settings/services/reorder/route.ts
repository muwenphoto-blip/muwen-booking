import { NextRequest, NextResponse } from 'next/server';
import { reorderAdminServices } from '@/lib/admin/settings';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const body = await request.json();
    const order = Array.isArray(body.order) ? body.order : [];
    const result = await reorderAdminServices(session, order);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '排序儲存失敗' },
      { status: 400 },
    );
  }
}
