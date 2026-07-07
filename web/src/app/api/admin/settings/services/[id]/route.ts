import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAdminService,
  toggleAdminService,
  updateAdminService,
} from '@/lib/admin/settings';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const { id } = await context.params;
    const body = await request.json();

    if (body.action === 'toggle') {
      const result = await toggleAdminService(session, id, Boolean(body.active));
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await updateAdminService(session, id, {
      name: body.name,
      nameEn: body.nameEn,
      optionsText: body.optionsText,
      basePriceText: body.basePrice,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新失敗' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const { id } = await context.params;
    const result = await deleteAdminService(session, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
