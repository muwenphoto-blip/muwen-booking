import { ZipArchive } from 'archiver';
import { PassThrough, Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { resolveDeliveryPhase } from '@/lib/delivery/access';
import { loadDeliveryPhotoFile } from '@/lib/delivery/load-photo-file';
import { sanitizeZipEntryName } from '@/lib/delivery/selection-export';
import { getDeliveryGuestSession, loadDeliveryBySlug } from '@/lib/delivery/store';
import { buildFinalsZipFilename } from '@/lib/booking/case-number';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const guest = await getDeliveryGuestSession();
    if (!guest || guest.slug !== slug) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const delivery = await loadDeliveryBySlug(slug);
    if (!delivery || delivery.id !== guest.deliveryId || !delivery.password_changed) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }
    if (resolveDeliveryPhase(delivery) !== 'delivering') {
      throw new Error('目前尚不可下載');
    }

    const supabase = createAdminSupabaseClient();
    const { data: photos, error: photoError } = await supabase
      .from('delivery_photos')
      .select('id, storage_path, file_name')
      .eq('delivery_id', delivery.id)
      .eq('kind', 'final')
      .order('sort_order', { ascending: true });
    if (photoError) throw new Error(photoError.message);
    if (!photos?.length) throw new Error('尚無可下載的成品');

    const { data: booking } = await supabase
      .from('bookings')
      .select('case_number, customer_name')
      .eq('id', delivery.booking_id)
      .maybeSingle();

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    const usedNames = new Set<string>();
    for (const photo of photos) {
      const file = await loadDeliveryPhotoFile(photo.storage_path);
      let entryName = sanitizeZipEntryName(photo.file_name, `${photo.id}.jpg`);
      if (!entryName.includes('.')) entryName += '.jpg';
      while (usedNames.has(entryName)) {
        const dot = entryName.lastIndexOf('.');
        const stem = dot > 0 ? entryName.slice(0, dot) : entryName;
        const ext = dot > 0 ? entryName.slice(dot) : '.jpg';
        entryName = `${stem}_${photo.id.slice(0, 6)}${ext}`;
      }
      usedNames.add(entryName);
      archive.append(Buffer.from(file.body), { name: entryName });
    }

    const zipName = buildFinalsZipFilename({
      caseNumber: booking?.case_number ?? '',
      customerName: booking?.customer_name ?? '',
      fallbackId: delivery.id,
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
      { error: err instanceof Error ? err.message : '打包下載失敗' },
      { status: 400 },
    );
  }
}
