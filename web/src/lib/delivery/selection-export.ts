import type { DeliveryPhotoRecord } from '@/lib/delivery/types';

function formatTaipeiDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

export function sanitizeZipEntryName(name: string, fallback: string): string {
  const base = String(name || fallback)
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .trim();
  return base || fallback;
}

export function buildSelectionManifest(options: {
  caseNumber: string;
  customerName: string;
  service: string;
  bookingDate: string;
  bookingTime: string;
  lockedAt: string | null;
  kept: Pick<DeliveryPhotoRecord, 'file_name' | 'sort_order'>[];
  rejected: Pick<DeliveryPhotoRecord, 'file_name' | 'sort_order'>[];
}): string {
  const lines = [
    '沐紋映像｜選片紀錄',
    '==================',
    `案號：${options.caseNumber || '—'}`,
    `客戶：${options.customerName || '（未填）'}`,
    `服務：${options.service || '—'}`,
    `拍攝：${options.bookingDate} ${options.bookingTime}`,
    `選片完成：${formatTaipeiDateTime(options.lockedAt) || '—'}`,
    '',
    `保留（${options.kept.length} 張）`,
  ];

  if (options.kept.length) {
    options.kept.forEach((photo, index) => {
      lines.push(`${index + 1}. ${photo.file_name}`);
    });
  } else {
    lines.push('（無）');
  }

  lines.push('', `刪除（${options.rejected.length} 張）`);
  if (options.rejected.length) {
    options.rejected.forEach((photo, index) => {
      lines.push(`${index + 1}. ${photo.file_name}`);
    });
  } else {
    lines.push('（無）');
  }

  lines.push(
    '',
    '備註：',
    '- 此 ZIP 內「預覽圖」資料夾為客人選片時看到的壓縮預覽（含浮水印），僅供對照檔名。',
    '- 請依本紀錄檔名，從您電腦中的原始檔挑圖修圖。',
  );

  return `${lines.join('\n')}\n`;
}

export function isPhotoKept(selection: string): boolean {
  return selection !== 'reject';
}
