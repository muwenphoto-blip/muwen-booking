import { NextRequest, NextResponse } from 'next/server';
import {
  loadAdminSettings,
  saveAdminSettingsBooking,
  saveAdminSettingsForm,
  saveAdminSettingsShop,
} from '@/lib/admin/settings';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const settings = await loadAdminSettings();
    return NextResponse.json({ settings, promotions: settings.promotions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入設定' },
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
    assertMasterRole(session.role);

    const body = await request.json();
    const section = String(body.section || '').trim();

    if (section === 'shop') {
      const result = await saveAdminSettingsShop(session, body.shopName, body.shopEmail);
      return NextResponse.json({ ok: true, ...result });
    }

    if (section === 'booking') {
      const result = await saveAdminSettingsBooking(session, {
        openDays: Array.isArray(body.openDays) ? body.openDays.map(Number) : [],
        openTime: String(body.openTime || ''),
        closeTime: String(body.closeTime || ''),
        slotMinutes: Number(body.slotMinutes),
        maxPerSlot: Number(body.maxPerSlot),
        minDaysAhead: Number(body.minDaysAhead),
        maxDaysAhead: Number(body.maxDaysAhead),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (section === 'form') {
      const result = await saveAdminSettingsForm(
        session,
        String(body.headcountOptions || ''),
        String(body.genderOptions || ''),
      );
      return NextResponse.json({ ok: true, ...result });
    }

    throw new Error('未知的設定類別');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '儲存失敗' },
      { status: 400 },
    );
  }
}
