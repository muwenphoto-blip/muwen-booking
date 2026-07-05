import { NextRequest, NextResponse } from 'next/server';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const name = String((await request.json()).name || '').trim();
    if (name.length < 2) throw new Error('請輸入攝影師姓名');
    if (name === '不指定') throw new Error('「不指定」已保留在預約選項，請改用其他名稱');

    const supabase = createAdminSupabaseClient();
    const { data: existing } = await supabase.from('staff').select('id').eq('name', name).maybeSingle();
    if (existing) throw new Error('此攝影師已存在');

    const { error } = await supabase.from('staff').insert({
      name,
      active: true,
      availability_schedule: '',
    });
    if (error) throw new Error(error.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '新增攝影師',
      summary: name,
      detail: '',
    });

    return NextResponse.json({ ok: true, message: `已新增攝影師「${name}」` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '新增失敗' },
      { status: 400 },
    );
  }
}
