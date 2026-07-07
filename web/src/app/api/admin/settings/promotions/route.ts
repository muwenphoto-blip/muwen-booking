import { NextRequest, NextResponse } from 'next/server';
import { addAdminPromotion, loadAdminPromotions } from '@/lib/admin/promotions';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const promotions = await loadAdminPromotions();
    return NextResponse.json({ promotions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入優惠活動' },
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
    assertMasterRole(session.role);

    const body = await request.json();
    const result = await addAdminPromotion(session, {
      name: body.name,
      description: body.description,
      ruleType: body.ruleType,
      ruleConfig: body.ruleConfig,
      targets: body.targets,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      active: body.active,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '新增失敗' },
      { status: 400 },
    );
  }
}
