import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/get-session';
import { isManagerRole } from '@/lib/admin/session';
import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { buildPreviewImage } from '@/lib/delivery/image-processing';
import { toStorageUploadBody } from '@/lib/delivery/storage-bytes';
import { computeFinalExpiryFromNow } from '@/lib/delivery/access';
import { loadDeliveryByBookingId } from '@/lib/delivery/store';
import type { PhotoKind } from '@/lib/delivery/types';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ bookingId: string }> };

const ALLOWED_FINAL_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
    }
    if (!isManagerRole(session.role)) {
      return NextResponse.json({ error: '僅主控或副主控可上傳' }, { status: 403 });
    }

    const { bookingId } = await context.params;
    const delivery = await loadDeliveryByBookingId(bookingId);
    if (!delivery) throw new Error('請先建立交片案件');

    const form = await request.formData();
    const kind = String(form.get('kind') || 'preview').trim() as PhotoKind;
    if (kind !== 'preview' && kind !== 'final') {
      throw new Error('無效的上傳類型');
    }

    const files = form.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) throw new Error('請選擇檔案');

    const supabase = createAdminSupabaseClient();
    const uploaded: Array<{ id: string; file_name: string; kind: PhotoKind }> = [];

    let sortBase = 0;
    const { count } = await supabase
      .from('delivery_photos')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_id', delivery.id)
      .eq('kind', kind);
    sortBase = count ?? 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const mime = file.type || 'application/octet-stream';
      if (kind === 'final' && !ALLOWED_FINAL_TYPES.has(mime)) {
        throw new Error(`不支援的成品格式：${file.name}`);
      }
      if (kind === 'preview' && !mime.startsWith('image/')) {
        throw new Error(`預覽僅支援圖片：${file.name}`);
      }

      const photoId = randomUUID();
      const originalName = file.name || `${kind}-${photoId}`;
      const arrayBuffer = await file.arrayBuffer();
      const input = Buffer.from(arrayBuffer);

      let body: Buffer;
      let storagePath: string;
      let contentType: string;

      if (kind === 'preview') {
        body = await buildPreviewImage(input);
        storagePath = `${delivery.id}/preview/${photoId}.jpg`;
        contentType = 'image/jpeg';
      } else {
        const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
        storagePath = `${delivery.id}/final/${photoId}.${ext}`;
        body = input;
        contentType = mime;
      }

      const { error: uploadError } = await supabase.storage
        .from(DELIVERY_STORAGE_BUCKET)
        .upload(storagePath, toStorageUploadBody(body), { contentType, upsert: false });
      if (uploadError) {
        if (uploadError.message.toLowerCase().includes('bucket')) {
          throw new Error('Storage 尚未建立 photo-deliveries bucket，請至 Supabase 執行 photo-delivery.sql');
        }
        throw new Error(uploadError.message);
      }

      const { data: verifyBlob, error: verifyReadError } = await supabase.storage
        .from(DELIVERY_STORAGE_BUCKET)
        .download(storagePath);
      if (verifyReadError || !verifyBlob) {
        await supabase.storage.from(DELIVERY_STORAGE_BUCKET).remove([storagePath]);
        throw new Error('檔案寫入 Storage 失敗，請確認 Supabase 已建立 photo-deliveries bucket');
      }
      const verifyBytes = new Uint8Array(await verifyBlob.arrayBuffer());
      const isJpeg = kind === 'preview' || mime === 'image/jpeg';
      if (isJpeg && (verifyBytes[0] !== 0xff || verifyBytes[1] !== 0xd8)) {
        await supabase.storage.from(DELIVERY_STORAGE_BUCKET).remove([storagePath]);
        throw new Error('上傳的圖片檔案損壞，請重新上傳');
      }

      const { data: row, error: insertError } = await supabase
        .from('delivery_photos')
        .insert({
          id: photoId,
          delivery_id: delivery.id,
          kind,
          storage_path: storagePath,
          file_name: originalName,
          selection: kind === 'preview' ? 'keep' : 'keep',
          sort_order: sortBase + index,
        })
        .select('id, file_name, kind')
        .single();
      if (insertError) throw new Error(insertError.message);
      uploaded.push(row);
    }

    if (kind === 'final') {
      const patch: Record<string, string> = {};
      if (!delivery.finals_started_at) {
        patch.finals_started_at = new Date().toISOString();
        patch.final_expires_at = computeFinalExpiryFromNow();
        patch.phase = 'delivering';
      }
      if (Object.keys(patch).length) {
        const { error: updateError } = await supabase
          .from('photo_deliveries')
          .update(patch)
          .eq('id', delivery.id);
        if (updateError) throw new Error(updateError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      uploaded,
      message: kind === 'preview' ? '預覽圖已上傳' : '成品已上傳',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '上傳失敗' },
      { status: 400 },
    );
  }
}
