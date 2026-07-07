import { NextRequest, NextResponse } from 'next/server';
import type { FinancePeriod } from '@/lib/admin/finance';
import {
  buildFinanceReportCsv,
  financeReportFilename,
  loadFinanceAccountingReport,
  type FinanceReportKind,
} from '@/lib/admin/finance-report';
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
    const kind = String(request.nextUrl.searchParams.get('kind') || 'full') as FinanceReportKind;
    const safePeriod = period === 'week' || period === 'year' ? period : 'month';
    const safeKind: FinanceReportKind =
      kind === 'detail' || kind === 'pl' || kind === 'summary' || kind === 'performance'
        ? kind
        : 'full';

    const today = new Date();
    const defaultAnchor = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const report = await loadFinanceAccountingReport(safePeriod, anchor || defaultAnchor);
    const csv = buildFinanceReportCsv(report, safeKind);
    const filename = financeReportFilename(report);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法匯出報表' },
      { status: 400 },
    );
  }
}
