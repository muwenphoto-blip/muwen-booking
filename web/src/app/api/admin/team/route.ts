import { NextResponse } from 'next/server';
import {
  assertManagerRole,
  canDeleteAdminUser,
  canManageAdminUser,
  formatAdminDisplayName,
  normalizeAdminRole,
} from '@/lib/admin/permissions';
import { readAdminLogs } from '@/lib/admin/admin-logs';
import { formatSessionTime, listActiveAdminSessions } from '@/lib/admin/admin-sessions';
import { countBlockingBookingsByStaffNames } from '@/lib/admin/staff-bookings';
import { getAdminSession } from '@/lib/admin/get-session';
import { formatRoleLabel, isManagerRole, type AdminRole } from '@/lib/admin/session';
import { mapStaffProfileRow, staffProfileHasData } from '@/lib/admin/staff-profile';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/errors';

type StaffRow = {
  id: string;
  name: string;
  active: boolean;
  availability_schedule: string;
  case_prefix: string | null;
};

type UserRow = {
  id: string;
  account_name: string;
  active: boolean;
  role: string;
  photographer_name: string | null;
};

function findLinkedUser(staffName: string, users: UserRow[]) {
  return (
    users.find((user) => String(user.photographer_name || '').trim() === staffName) ??
    users.find(
      (user) =>
        normalizeAdminRole(user.role) !== '主' &&
        !String(user.photographer_name || '').trim() &&
        user.account_name === staffName,
    ) ??
    null
  );
}

function buildTeamMembers(
  staff: StaffRow[],
  users: UserRow[],
  session: { userId: string; role: AdminRole },
  profileFlags: Map<string, boolean>,
  blockingCounts: Map<string, number>,
) {
  return staff.map((row) => {
    const linked = findLinkedUser(row.name, users);
    const role = linked ? normalizeAdminRole(linked.role) : null;
    const target = linked
      ? { id: linked.id, role: role!, active: linked.active }
      : null;

    return {
      staffId: row.id,
      name: row.name,
      casePrefix: row.case_prefix ? String(row.case_prefix).toUpperCase() : '',
      staffActive: row.active,
      availabilityLabel: String(row.availability_schedule || '').trim()
        ? '已設定排班'
        : '全部時段',
      hasAccount: Boolean(linked),
      userId: linked?.id,
      account: linked?.account_name || '',
      accountActive: linked?.active ?? false,
      role,
      roleLabel: role ? formatRoleLabel(role) : '僅預約',
      isMaster: role === '主',
      isCoMaster: role === '副主',
      canManage: target
        ? canManageAdminUser({ id: session.userId, role: session.role }, target)
        : true,
      canDelete: target
        ? canDeleteAdminUser({ id: session.userId, role: session.role }, target)
        : false,
      canRemove: role !== '主' && isManagerRole(session.role),
      blockingBookings: blockingCounts.get(row.name) ?? 0,
      hasProfile: profileFlags.get(row.id) ?? false,
    };
  });
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const supabase = createAdminSupabaseClient();
    const [{ data: staff, error: staffError }, { data: users, error: usersError }] =
      await Promise.all([
        supabase.from('staff').select('id, name, active, availability_schedule, case_prefix').order('name'),
        supabase
          .from('admin_users')
          .select('id, account_name, active, role, photographer_name')
          .order('account_name'),
      ]);

    if (staffError) throw new Error(staffError.message);
    if (usersError) throw new Error(usersError.message);

    const setupHints: string[] = [];

    const profileFlags = new Map<string, boolean>();
    const { data: profiles, error: profilesError } = await supabase
      .from('staff_profiles')
      .select('*');
    if (profilesError) {
      if (isMissingRelationError(profilesError.message)) {
        setupHints.push(
          '尚未建立 staff_profiles 資料表，「基本資料」需先在 Supabase 執行 supabase/staff-profiles.sql',
        );
      } else {
        throw new Error(profilesError.message);
      }
    } else {
      (profiles ?? []).forEach((row) => {
        profileFlags.set(row.staff_id, staffProfileHasData(mapStaffProfileRow(row)));
      });
    }

    const blockingCounts = await countBlockingBookingsByStaffNames(
      supabase,
      (staff ?? []).map((row) => row.name),
    );

    const missingPrefixStaff = (staff ?? [])
      .filter((row) => !String(row.case_prefix || '').trim())
      .map((row) => row.name);
    if (missingPrefixStaff.length) {
      setupHints.push(
        `以下攝影師尚未設定案號前綴：${missingPrefixStaff.join('、')}。請在團隊管理編輯設定，新預約才能產生案號。`,
      );
    }

    const logQuery = '';
    let logs: Awaited<ReturnType<typeof readAdminLogs>> = [];
    try {
      logs = await readAdminLogs(supabase, logQuery);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (isMissingRelationError(message)) {
        setupHints.push('尚未建立 admin_logs 資料表，操作日誌無法顯示');
      } else {
        throw err;
      }
    }

    const sessionResult = await listActiveAdminSessions(supabase);

    const sessions = sessionResult.items.map((item) => ({
      ...item,
      lastSeenLabel: formatSessionTime(item.lastSeen),
    }));

    return NextResponse.json({
      canAssignCoMaster: session.role === '主',
      canViewStaffProfile: session.role === '主',
      setupHints,
      sessionsTableMissing: sessionResult.tableMissing,
      members: buildTeamMembers(staff ?? [], users ?? [], session, profileFlags, blockingCounts),
      storeAccounts: (users ?? [])
        .filter((row) => normalizeAdminRole(row.role) === '現場')
        .map((row) => {
          const role: AdminRole = '現場';
          const target = { id: row.id, role, active: row.active };
          return {
            id: row.id,
            account: row.account_name,
            active: row.active,
            roleLabel: formatRoleLabel(role),
            canManage: canManageAdminUser({ id: session.userId, role: session.role }, target),
            canDelete: canDeleteAdminUser({ id: session.userId, role: session.role }, target),
          };
        }),
      staff: (staff ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        active: row.active,
        availabilityLabel: String(row.availability_schedule || '').trim()
          ? '已設定排班'
          : '全部時段',
      })),
      users: (users ?? []).map((row) => {
        const role = normalizeAdminRole(row.role);
        const target = { id: row.id, role, active: row.active };
        return {
          id: row.id,
          account: row.account_name,
          active: row.active,
          role,
          roleLabel: formatRoleLabel(role),
          photographer: row.photographer_name || '',
          displayName: formatAdminDisplayName(row.account_name, role, row.photographer_name || ''),
          canManage: canManageAdminUser(
            { id: session.userId, role: session.role },
            target,
          ),
          canDelete: canDeleteAdminUser(
            { id: session.userId, role: session.role },
            target,
          ),
        };
      }),
      logs,
      sessions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入團隊資料' },
      { status: 400 },
    );
  }
}
