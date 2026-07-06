import { DELIVERY_STORAGE_BUCKET } from '@/lib/delivery/constants';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function contentTypeFromPath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

export async function loadDeliveryPhotoFile(storagePath: string): Promise<{
  body: ArrayBuffer;
  contentType: string;
}> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(DELIVERY_STORAGE_BUCKET).download(storagePath);
  if (error) {
    throw new Error(error.message || '無法讀取照片檔案');
  }
  if (!data) {
    throw new Error('找不到照片檔案，請重新上傳');
  }

  const body = await data.arrayBuffer();
  return {
    body,
    contentType: data.type || contentTypeFromPath(storagePath),
  };
}
