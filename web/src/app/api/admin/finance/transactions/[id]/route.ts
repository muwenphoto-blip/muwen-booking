import { NextRequest, NextResponse } from 'next/server';
import { deleteFinanceTransaction, updateFinanceTransaction } from '@/lib/admin/finance';
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
    const result = await updateFinanceTransaction(session, id, {
      bookingId: body.bookingId,
      caseNumber: body.caseNumber,
      transactionDate: body.transactionDate,
      type: body.type,
      category: body.category,
      amount: body.amount,
      paymentMethod: body.paymentMethod,
      receiver: body.receiver,
      note: body.note,
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
    const result = await deleteFinanceTransaction(session, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '刪除失敗' },
      { status: 400 },
    );
  }
}
