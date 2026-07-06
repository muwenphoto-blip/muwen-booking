import { ZipArchive } from 'archiver';
import { PassThrough, Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { buildSelectionZipFilename } from '@/lib/booking/case-number';
import {
  buildSelectionManifest,
  isPhotoKept,
  sanitizeZipEntryName,
} from '@/lib/delivery/selection-export';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }

    const { bookingId } = await context.params;
    const supabase = createAdminSupabaseClient();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, case_number, customer_name, service, booking_date, booking_time, staff_name')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking) throw new Error('找不到這筆預約');

    if (!isManagerRole(session.role)) {
      const mine = session.photographerName || session.account;
      if (booking.staff_name !== mine) {
        return NextResponse.json({ error: '您沒有權限下載' }, { status: 403 });
      }
    }

    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('找不到交片案件');
    if (!delivery.selection_locked_at || delivery.selection_reopened) {
      throw new Error('客人尚未完成選片');
    }

    const { data: photos, error: photoError } = await supabase
      .from('delivery_photos')
      .select('id, file_name, selection, storage_path, sort_order')
      .eq('delivery_id', delivery.id)
      .eq('kind', 'preview')
      .order('sort_order', { ascending: true });
    if (photoError) throw new Error(photoError.message);

    const kept = (photos ?? []).filter((photo) => isPhotoKept(photo.selection));
    const rejected = (photos ?? []).filter((photo) => photo.selection === 'reject');
    if (!kept.length) {
      throw new Error('沒有保留的預覽圖可下載');
    }

    const manifest = buildSelectionManifest({
      caseNumber: booking.case_number,
      customerName: booking.customer_name,
      service: booking.service,
      bookingDate: booking.booking_date,
      bookingTime: booking.booking_time,
      lockedAt: delivery.selection_locked_at,
      kept,
      rejected,
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    archive.append(Buffer.from(`\uFEFF${manifest}`, 'utf8'), { name: '選片紀錄.txt' });

    const usedNames = new Set<string>();
    for (const photo of kept) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(DELIVERY_STORAGE_BUCKET)
        .download(photo.storage_path);
      if (downloadError || !blob) {
        throw new Error(`無法下載：${photo.file_name}`);
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      let entryName = sanitizeZipEntryName(photo.file_name, `${photo.id}.jpg`);
      if (!entryName.includes('.')) entryName += '.jpg';
      while (usedNames.has(entryName)) {
        const dot = entryName.lastIndexOf('.');
        const stem = dot > 0 ? entryName.slice(0, dot) : entryName;
        const ext = dot > 0 ? entryName.slice(dot) : '.jpg';
        entryName = `${stem}_${photo.id.slice(0, 6)}${ext}`;
      }
      usedNames.add(entryName);
      archive.append(buffer, { name: `預覽圖/${entryName}` });
    }

    const zipName = buildSelectionZipFilename({
      caseNumber: booking.case_number,
      customerName: booking.customer_name,
      service: booking.service,
      fallbackId: bookingId,
    });

    archive.finalize();

    const webStream = Readable.toWeb(passThrough) as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '下載失敗' },
      { status: 400 },
    );
  }
}
