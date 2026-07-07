import { NextRequest, NextResponse } from 'next/server';
import {
  SHOP_ADDRESS,
  SHOP_FULL_NAME,
  SHOP_PHONE,
  type BookingDocumentState,
  formatDatePartsToIso,
  syncDocumentCatalogPricing,
} from '@/lib/admin/booking-documents';
import {
  DOCUMENT_DATA_SETUP_HINT,
  loadBookingDocumentRow,
} from '@/lib/admin/booking-document-query';
import {
  formatBookingServiceFromDocument,
  loadBookingDocumentState,
  serializeBookingDocumentState,
} from '@/lib/admin/booking-document-store';
import { applyDocumentFinancialSync } from '@/components/booking-document-shared';
import { loadAdminPromotions } from '@/lib/admin/promotions';
import { loadActiveAssetOptions } from '@/lib/admin/assets';
import { syncTransactionsFromDocument } from '@/lib/admin/finance';
import { prepareDocumentPaymentsForSync } from '@/lib/admin/document-payment';
import { getAdminSession } from '@/lib/admin/get-session';
import { canViewAllBookings } from '@/lib/admin/session';
import { loadBookingConfig } from '@/lib/booking/config';
import { addDays, formatDate } from '@/lib/booking/time';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isMissingColumnError } from '@/lib/supabase/errors';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { booking, documentColumnReady } = await loadBookingDocumentRow(supabase, id);

    if (!canViewAllBookings(session.role)) {
      const mine = session.photographerName || session.account;
      if (booking.staff_name !== mine) {
        return NextResponse.json({ error: '您沒有權限查看此預約' }, { status: 403 });
      }
    }

    const config = await loadBookingConfig();
    const [promotions, assets] = await Promise.all([
      loadAdminPromotions(),
      loadActiveAssetOptions(),
    ]);
    const initial = applyDocumentFinancialSync(
      syncDocumentCatalogPricing(
        loadBookingDocumentState(
          booking,
          config.services,
          canViewAllBookings(session.role) ? '' : session.photographerName || session.account,
        ),
        config.services,
        promotions,
      ),
      config.services,
    );

    return NextResponse.json({
      shopName: config.shopName,
      shopFullName: SHOP_FULL_NAME,
      shopAddress: SHOP_ADDRESS,
      shopPhone: SHOP_PHONE,
      services: config.services,
      promotions,
      assets,
      documentColumnReady,
      documentSetupHint: documentColumnReady ? '' : DOCUMENT_DATA_SETUP_HINT,
      booking: {
        id: booking.id,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        staffName: booking.staff_name,
        status: booking.status,
      },
      scheduleConfig: {
        openTime: config.openTime,
        closeTime: config.closeTime,
        slotMinutes: config.slotMinutes,
        minDate: formatDate(new Date()),
        maxDate: formatDate(addDays(new Date(), config.maxDaysAhead)),
      },
      initial,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法載入文件資料';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { document?: BookingDocumentState };
    if (!body.document) throw new Error('缺少文件資料');

    const supabase = createAdminSupabaseClient();
    const { booking, documentColumnReady } = await loadBookingDocumentRow(supabase, id);

    if (!documentColumnReady) {
      return NextResponse.json({ error: DOCUMENT_DATA_SETUP_HINT }, { status: 400 });
    }

    if (!canViewAllBookings(session.role)) {
      const mine = session.photographerName || session.account;
      if (booking.staff_name !== mine) {
        return NextResponse.json({ error: '您沒有權限修改此預約' }, { status: 403 });
      }
    }

    const config = await loadBookingConfig();
    const promotions = await loadAdminPromotions();
    const document = prepareDocumentPaymentsForSync(
      applyDocumentFinancialSync(
        syncDocumentCatalogPricing(
          {
            ...body.document,
            caseNumber: booking.case_number || body.document.caseNumber || '',
            usedAssetIds: Array.isArray(body.document.usedAssetIds)
              ? body.document.usedAssetIds.map((id) => String(id || '').trim()).filter(Boolean)
              : [],
          },
          config.services,
          promotions,
        ),
        config.services,
      ),
      config.services,
    );

    const shootingDate = formatDatePartsToIso(document.shootingDate);
    const shootingTime = String(document.shootingTime || '').trim();
    const bookingPatch: Record<string, unknown> = {
      document_data: serializeBookingDocumentState(document),
    };
    if (shootingDate && shootingTime) {
      bookingPatch.booking_date = shootingDate;
      bookingPatch.booking_time = shootingTime;
    }

    const service = formatBookingServiceFromDocument(document);
    if (service) {
      bookingPatch.service = service;
    }

    const { error } = await supabase.from('bookings').update(bookingPatch).eq('id', id);
    if (error) {
      if (isMissingColumnError(error.message, 'document_data')) {
        return NextResponse.json({ error: DOCUMENT_DATA_SETUP_HINT }, { status: 400 });
      }
      throw new Error(error.message);
    }

    const financeSync = await syncTransactionsFromDocument(
      id,
      booking.case_number || document.caseNumber || '',
      document,
      session.account,
      config.services,
    );

    const financeHint =
      financeSync.synced > 0
        ? `，已同步 ${financeSync.synced} 筆收入至財務`
        : financeSync.errors.length
          ? `（財務同步：${financeSync.errors[0]}）`
          : '';

    return NextResponse.json({
      ok: true,
      message: `已儲存文件資料${financeHint}`,
      financeSync,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '儲存失敗' },
      { status: 400 },
    );
  }
}
