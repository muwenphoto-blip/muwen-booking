import { NextRequest, NextResponse } from 'next/server';
import {
  BOOKING_STATUS_CLOSED,
  buildBookingLogLabel,
  canCancelBooking,
  canCloseBooking,
  canRemoveBooking,
  canRespondToBooking,
  canTransferBooking,
  isBookingConfirmed,
  isStaffInactive,
} from '@/lib/admin/bookings';
import {
  assertWalkInSlotAvailable,
  assertStaffCasePrefixReady,
  validateWalkInCreatePayload,
  WALK_IN_DEFAULT_STATUS,
  type WalkInCreatePayload,
} from '@/lib/admin/walk-in-booking';
import {
  applyBookingSlotToDocument,
  serializeBookingDocumentState,
} from '@/lib/admin/booking-document-store';
import { DOCUMENT_DATA_SETUP_HINT } from '@/lib/admin/booking-document-query';
import { applyHeadcountToDocument } from '@/lib/admin/booking-documents';
import { applyDocumentFinancialSync } from '@/components/booking-document-shared';
import { syncTransactionsFromDocument } from '@/lib/admin/finance';
import { getAdminSession } from '@/lib/admin/get-session';
import { canCreateWalkInBooking, canViewAllBookings } from '@/lib/admin/session';
import { isManagerRole } from '@/lib/admin/session';
import { loadBookingConfig } from '@/lib/booking/config';
import { loadDeliveryListMetaByBookingIds, loadFinalCountsByBookingIds } from '@/lib/delivery/store';
import { sendBookingDecisionEmails } from '@/lib/mail/booking-emails';
import { assertActivePhotographerName, getStaffNotifyEmailByName, listActivePhotographerNames } from '@/lib/mail/staff-notify';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/supabase/errors';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    let query = supabase
      .from('bookings')
      .select(
        'id, created_at, case_number, booking_date, booking_time, staff_name, service, customer_name, phone, email, status',
      )
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: false })
      .order('created_at', { ascending: false });

    if (!canViewAllBookings(session.role)) {
      const mine = session.photographerName || session.account;
      query = query.eq('staff_name', mine);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const manager = isManagerRole(session.role);
    const canManageBookings = manager;
    const staffOptions =
      manager || session.role === '現場' ? await listActivePhotographerNames() : [];
    const activeSet = new Set(staffOptions);

    const { data: staffRows, error: staffPrefixError } = await supabase
      .from('staff')
      .select('name, case_prefix')
      .eq('active', true);
    if (staffPrefixError) throw new Error(staffPrefixError.message);
    const staffCasePrefixes: Record<string, string> = {};
    (staffRows ?? []).forEach((row) => {
      staffCasePrefixes[String(row.name)] = String(row.case_prefix || '')
        .trim()
        .toUpperCase();
    });

    const closableIds = (data ?? [])
      .filter((row) => manager && canCloseBooking(row.status))
      .map((row) => row.id);
    const finalCounts = await loadFinalCountsByBookingIds(closableIds);

    const deliveryIds = (data ?? [])
      .filter((row) => {
        const mine = session.photographerName || session.account;
        return (
          (isBookingConfirmed(row.status) || row.status === BOOKING_STATUS_CLOSED) &&
          (manager || row.staff_name === mine)
        );
      })
      .map((row) => row.id);
    const deliveryMeta = await loadDeliveryListMetaByBookingIds(deliveryIds);

    const bookings = (data ?? []).map((row) => {
      const canRespond = row.status === '待確認' && canRespondToBooking(session, row.staff_name);
      const staffInactive = isStaffInactive(row.staff_name, activeSet);
      const mine = session.photographerName || session.account;
      const canAccessDelivery =
        (isBookingConfirmed(row.status) || row.status === BOOKING_STATUS_CLOSED) &&
        (manager || row.staff_name === mine);
      const finalCount = finalCounts.get(row.id) ?? 0;
      const delivery = deliveryMeta.get(row.id);
      return {
        ...row,
        canRespond,
        needsStaffAssign: canRespond && canManageBookings && row.staff_name === '不指定',
        staffInactive,
        canTransfer: canManageBookings && canTransferBooking(row.status, row.staff_name),
        canClose: canManageBookings && canCloseBooking(row.status) && finalCount > 0,
        closeNeedsFinals: canManageBookings && canCloseBooking(row.status) && finalCount === 0,
        canDelivery: canAccessDelivery,
        canSelectPhotos: Boolean(delivery?.canSelect),
        selectionUrl: delivery?.slug ? `/delivery/${delivery.slug}` : null,
        canCancel: canManageBookings && canCancelBooking(row.status),
        canRemove: canManageBookings && canRemoveBooking(row.status, session.role),
      };
    });

    return NextResponse.json({
      bookings,
      staffOptions,
      staffCasePrefixes,
      isManager: manager,
      isStoreStaff: session.role === '現場',
      canCreateWalkIn: canCreateWalkInBooking(session.role),
      photographerName: session.photographerName || session.account,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '無法載入預約' },
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

    const manager = isManagerRole(session.role);
    if (!canCreateWalkInBooking(session.role)) {
      throw new Error('您沒有權限建立門市預約');
    }

    const body = (await request.json()) as WalkInCreatePayload;
    const config = await loadBookingConfig();
    const payload = validateWalkInCreatePayload(body, config);
    const phoneDisplay = `${payload.phoneCountry}${payload.phone}`;
    const document = applyDocumentFinancialSync(
      applyHeadcountToDocument(
        applyBookingSlotToDocument(
          {
            ...payload.document,
            customerName: payload.document.customerName || payload.name,
            email: payload.document.email || payload.email || '',
            phone: payload.document.phone || phoneDisplay,
          },
          { date: payload.date, time: payload.time, staff: payload.staff },
        ),
        payload.headcount,
      ),
    );

    if (!manager && session.role !== '現場' && payload.staff !== (session.photographerName || session.account)) {
      throw new Error('僅能為自己建立門市預約');
    }
    await assertActivePhotographerName(payload.staff);

    const supabase = createAdminSupabaseClient();
    await assertStaffCasePrefixReady(supabase, payload.staff);
    const [{ data: staffRows }, { data: counts }] = await Promise.all([
      supabase.from('staff_public').select('name, availability_schedule'),
      supabase.rpc('get_booking_slot_counts', { p_date: payload.date }),
    ]);

    await assertWalkInSlotAvailable(payload, config, staffRows ?? [], counts ?? []);

    const insertPayload = {
      booking_date: payload.date,
      booking_time: payload.time,
      staff_name: payload.staff,
      service: payload.service,
      headcount: payload.headcount,
      customer_name: payload.name,
      gender: payload.gender,
      phone: payload.phone,
      phone_country: payload.phoneCountry || '+886',
      email: payload.email || null,
      note: payload.note || '',
      status: WALK_IN_DEFAULT_STATUS,
      document_data: serializeBookingDocumentState(document),
    };

    let { data: inserted, error } = await supabase
      .from('bookings')
      .insert(insertPayload)
      .select('id, case_number, booking_date, booking_time, staff_name, service, customer_name, status')
      .single();

    if (error && isMissingColumnError(error.message, 'document_data')) {
      throw new Error(DOCUMENT_DATA_SETUP_HINT);
    }

    if (error) throw new Error(error.message);
    if (!inserted) throw new Error('建立預約失敗');

    const savedDocument = {
      ...document,
      caseNumber: inserted.case_number || document.caseNumber || '',
    };
    const docUpdate = await supabase
      .from('bookings')
      .update({ document_data: serializeBookingDocumentState(savedDocument) })
      .eq('id', inserted.id);
    if (docUpdate.error) {
      if (isMissingColumnError(docUpdate.error.message, 'document_data')) {
        throw new Error(DOCUMENT_DATA_SETUP_HINT);
      }
      throw new Error(docUpdate.error.message);
    }

    await syncTransactionsFromDocument(
      inserted.id,
      inserted.case_number || '',
      savedDocument,
      session.account,
      config.services,
    );

    const summary = buildBookingLogLabel({
      booking_date: payload.date,
      booking_time: payload.time,
      customer_name: payload.name,
    });
    await supabase.from('admin_logs').insert({
      admin_account: session.account,
      admin_role: session.role,
      action: '新增門市預約',
      summary,
      detail: `預約 ID：${inserted.id}｜案號 ${inserted.case_number || '—'}`,
    });

    let message = `已建立門市預約${inserted.case_number ? `（案號 ${inserted.case_number}）` : ''}`;
    if (payload.email) {
      const staffNotifyEmail = await getStaffNotifyEmailByName(payload.staff);
      const mailResult = await sendBookingDecisionEmails(
        config.shopName,
        config.shopEmail,
        {
          date: payload.date,
          time: payload.time,
          staff: payload.staff,
          service: payload.service,
          headcount: payload.headcount,
          name: payload.name,
          gender: payload.gender,
          phone: phoneDisplay,
          email: payload.email,
          note: payload.note,
        },
        'accept',
        staffNotifyEmail,
      );
      if (mailResult.customer) {
        message += '，確認信已寄給客人';
      }
    }

    return NextResponse.json({
      ok: true,
      message,
      booking: inserted,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '建立預約失敗' },
      { status: 400 },
    );
  }
}
