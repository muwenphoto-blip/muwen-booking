import { NextRequest, NextResponse } from 'next/server';
import { assertMasterRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import {
  emptyStaffProfile,
  mapStaffProfileRow,
  parseStaffProfileInput,
  staffProfileHasData,
  staffProfileToDb,
} from '@/lib/admin/staff-profile';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();

    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (staffError) throw new Error(staffError.message);
    if (!staffRow) throw new Error('找不到這位攝影師');

    const { data: profileRow, error: profileError } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('staff_id', id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const profile = profileRow ? mapStaffProfileRow(profileRow) : emptyStaffProfile(id);

    return NextResponse.json({
      staffName: staffRow.name,
      profile,
      hasProfile: staffProfileHasData(profile),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入基本資料' },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertMasterRole(session.role);

    const { id } = await context.params;
    const body = await request.json();
    const profile = parseStaffProfileInput(id, body);

    const supabase = createAdminSupabaseClient();
    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (staffError) throw new Error(staffError.message);
    if (!staffRow) throw new Error('找不到這位攝影師');

    const { error } = await supabase.from('staff_profiles').upsert(staffProfileToDb(profile), {
      onConflict: 'staff_id',
    });
    if (error) throw new Error(error.message);

    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '更新員工資料',
      summary: staffRow.name,
      detail: profile.legalName ? `本名：${profile.legalName}` : '已儲存基本資料',
    });

    return NextResponse.json({
      ok: true,
      message: '員工基本資料已儲存',
      hasProfile: staffProfileHasData(profile),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '儲存失敗' },
      { status: 400 },
    );
  }
}
