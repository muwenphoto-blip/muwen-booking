import { NextRequest, NextResponse } from 'next/server';
import {
  backfillTransactionsFromBookings,
  createFinanceTransaction,
  loadFinanceTransactions,
  type TransactionType,
} from '@/lib/admin/finance';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const from = String(request.nextUrl.searchParams.get('from') || '').trim();
    const to = String(request.nextUrl.searchParams.get('to') || '').trim();
    const type = String(request.nextUrl.searchParams.get('type') || '').trim() as TransactionType | '';
    const transactions = await loadFinanceTransactions({
      from: from || undefined,
      to: to || undefined,
      type: type === 'income' || type === 'expense' || type === 'refund' ? type : undefined,
      limit: 500,
    });
    return NextResponse.json({ transactions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入收支紀錄' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const body = await request.json();
    if (body.action === 'backfill') {
      const result = await backfillTransactionsFromBookings(session.account);
      return NextResponse.json({
        ok: true,
        message: `已從 ${result.synced} 筆預約單同步收款紀錄`,
        ...result,
      });
    }

    const result = await createFinanceTransaction(session, {
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
      { error: err instanceof Error ? err.message : '新增失敗' },
      { status: 400 },
    );
  }
}
