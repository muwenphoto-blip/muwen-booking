import { NextResponse } from 'next/server';
import { loadActiveAssetOptions } from '@/lib/admin/assets';
import { getAdminSession } from '@/lib/admin/get-session';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const assets = await loadActiveAssetOptions();
    return NextResponse.json({ assets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入器材清單' },
      { status: 400 },
    );
  }
}
