import { NextRequest, NextResponse } from 'next/server';
import {
  addAdminAsset,
  loadAssetsWithMetrics,
  syncMonthDepreciationFromAssets,
} from '@/lib/admin/assets';
import { monthKeyFromIsoDate } from '@/lib/admin/finance-equipment';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const month = String(request.nextUrl.searchParams.get('month') || '').trim();
    const today = new Date();
    const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthKey = /^\d{4}-\d{2}$/.test(month) ? month : defaultMonth;

    const snapshot = await loadAssetsWithMetrics(monthKey);
    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入器材資料' },
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
    if (body.action === 'sync-depreciation') {
      const month =
        String(body.month || '').trim() ||
        monthKeyFromIsoDate(String(body.anchorDate || '').trim());
      const amount = await syncMonthDepreciationFromAssets(month);
      return NextResponse.json({
        ok: true,
        message: `已依器材與案量重算 ${month} 損耗：NT$ ${amount.toLocaleString('zh-Hant-TW')}`,
        amount,
      });
    }

    const result = await addAdminAsset(session, {
      name: body.name,
      purchaseDate: body.purchaseDate,
      purchasePrice: body.purchasePrice,
      marketPrice: body.marketPrice,
      lifeSpanMonths: body.lifeSpanMonths,
      expectedCasesPerMonth: body.expectedCasesPerMonth,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '操作失敗' },
      { status: 400 },
    );
  }
}
