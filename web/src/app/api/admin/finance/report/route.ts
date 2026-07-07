import { NextRequest, NextResponse } from 'next/server';
import type { FinancePeriod } from '@/lib/admin/finance';
import { loadFinanceAccountingReport } from '@/lib/admin/finance-report';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const period = String(request.nextUrl.searchParams.get('period') || 'month') as FinancePeriod;
    const anchor = String(request.nextUrl.searchParams.get('anchor') || '').trim();
    const safePeriod = period === 'week' || period === 'year' ? period : 'month';

    const today = new Date();
    const defaultAnchor = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const report = await loadFinanceAccountingReport(safePeriod, anchor || defaultAnchor, {
      transactionLimit: request.nextUrl.searchParams.get('lite') === '1' ? 300 : 5000,
    });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入會計報表' },
      { status: 400 },
    );
  }
}
