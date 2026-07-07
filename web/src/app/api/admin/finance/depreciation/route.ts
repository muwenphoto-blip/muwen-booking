import { NextRequest, NextResponse } from 'next/server';
import { monthKeyFromIsoDate, saveEquipmentDepreciation } from '@/lib/admin/finance-equipment';
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
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('請提供 YYYY-MM 月份');
    }

    const { loadEquipmentDepreciation } = await import('@/lib/admin/finance-equipment');
    const amount = await loadEquipmentDepreciation(month);
    return NextResponse.json({ month, amount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入器材損耗' },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const body = await request.json();
    const month = String(body.month || '').trim() || monthKeyFromIsoDate(String(body.anchorDate || ''));
    const amount = Number(body.amount);
    await saveEquipmentDepreciation(month, amount);
    return NextResponse.json({ ok: true, message: '已儲存本月器材損耗', month, amount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '儲存失敗' },
      { status: 400 },
    );
  }
}
