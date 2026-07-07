import { NextRequest, NextResponse } from 'next/server';
import { deleteAdminAsset, updateAdminAsset } from '@/lib/admin/assets';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const { id } = await context.params;
    const body = await request.json();
    const result = await updateAdminAsset(session, id, {
      name: body.name,
      purchaseDate: body.purchaseDate,
      purchasePrice: body.purchasePrice,
      marketPrice: body.marketPrice,
      lifeSpanMonths: body.lifeSpanMonths,
      expectedCasesPerMonth: body.expectedCasesPerMonth,
      notes: body.notes,
      active: body.active,
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
    assertManagerRole(session.role);

    const { id } = await context.params;
    const result = await deleteAdminAsset(session, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
