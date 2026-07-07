import { NextResponse } from 'next/server';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/admin/finance';
import { assertManagerRole } from '@/lib/admin/permissions';
import { getAdminSession } from '@/lib/admin/get-session';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    assertManagerRole(session.role);

    const supabase = createAdminSupabaseClient();
    const [bookingsRes, staffRes, usersRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, case_number, customer_name, booking_date, staff_name')
        .order('booking_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('staff').select('name').eq('active', true).order('name'),
      supabase.from('admin_users').select('account_name, photographer_name, active').eq('active', true),
    ]);

    if (bookingsRes.error) throw new Error(bookingsRes.error.message);
    if (staffRes.error) throw new Error(staffRes.error.message);
    if (usersRes.error) throw new Error(usersRes.error.message);

    const caseOptions = (bookingsRes.data ?? [])
      .map((row) => {
        const caseNumber = String(row.case_number || '').trim();
        if (!caseNumber) return null;
        const customerName = String(row.customer_name || '').trim();
        const bookingDate = String(row.booking_date || '').trim();
        const staffName = String(row.staff_name || '').trim();
        const parts = [caseNumber, customerName, bookingDate, staffName].filter(Boolean);
        return {
          bookingId: row.id,
          caseNumber,
          label: parts.join(' · '),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const receiverSet = new Set<string>();
    (staffRes.data ?? []).forEach((row) => {
      const name = String(row.name || '').trim();
      if (name) receiverSet.add(name);
    });
    (usersRes.data ?? []).forEach((row) => {
      const photographer = String(row.photographer_name || '').trim();
      const account = String(row.account_name || '').trim();
      if (photographer) receiverSet.add(photographer);
      else if (account) receiverSet.add(account);
    });

    return NextResponse.json({
      caseOptions,
      receivers: Array.from(receiverSet).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
      paymentMethods: [...PAYMENT_METHOD_OPTIONS],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入選項' },
      { status: 400 },
    );
  }
}
