import { NextRequest, NextResponse } from 'next/server';
import { lookupCuratedEnglish } from '@/lib/admin/chinese-english-label';
import {
  translateEnglishLabel,
  type EnglishLabelContext,
} from '@/lib/admin/english-label-translator';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';

function parseContext(raw: unknown): EnglishLabelContext {
  if (raw === 'option' || raw === 'gender') return raw;
  return 'service';
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const body = await request.json();
    const text = String(body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: '請提供中文名稱' }, { status: 400 });
    }

    const context = parseContext(body.context);
    const curated = lookupCuratedEnglish(text);
    const translation = await translateEnglishLabel(text, context);

    if (!translation) {
      return NextResponse.json({ error: '暫時無法產生英文建議' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      translation,
      source: curated ? 'curated' : process.env.DEEPL_API_KEY ? 'deepl' : 'dictionary',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '翻譯失敗' },
      { status: 400 },
    );
  }
}
