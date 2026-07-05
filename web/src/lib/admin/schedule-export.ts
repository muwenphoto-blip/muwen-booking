import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export type ScheduleExportFormat = 'csv' | 'xlsx' | 'pdf' | 'png' | 'jpeg';

export const SCHEDULE_EXPORT_FORMATS: Array<{ value: ScheduleExportFormat; label: string }> = [
  { value: 'csv', label: 'CSV（試算表）' },
  { value: 'xlsx', label: 'Excel（.xlsx）' },
  { value: 'pdf', label: 'PDF（.pdf）' },
  { value: 'png', label: 'PNG 圖片' },
  { value: 'jpeg', label: 'JPEG 圖片' },
];

export type ScheduleDayExport = {
  date: string;
  label: string;
  shopOpen: boolean;
  active: boolean;
  status: string;
  slots: string[];
  offSlots: string[];
  hasOverride: boolean;
};

export type ScheduleExportData = {
  staffName: string;
  monthLabel: string;
  timeRangeLabel: string;
  availabilityLabel: string;
  allSlots: string[];
  days: ScheduleDayExport[];
  exportedAt: string;
};

type DateInput = {
  active: boolean;
  dayOff?: boolean;
  offSlots?: Record<string, boolean>;
  slots: Record<string, boolean>;
};

type MonthDayInput = {
  date: string;
  label: string;
  shopOpen: boolean;
  hasOverride: boolean;
  active: boolean;
  slots: string[];
};

function taipeiDateStamp(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
}

function taipeiDateTimeLabel(): string {
  return new Date().toLocaleString('zh-TW', {
    hour12: false,
    timeZone: 'Asia/Taipei',
  });
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || '排班表';
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildDayRows(params: {
  monthDays: MonthDayInput[];
  allSlots: string[];
  useAllSlots: boolean;
  dateStates: Record<string, DateInput>;
}): ScheduleDayExport[] {
  const { monthDays, allSlots, useAllSlots, dateStates } = params;

  return monthDays.map((day) => {
    if (!day.shopOpen) {
      return {
        date: day.date,
        label: day.label,
        shopOpen: false,
        active: false,
        status: '全店店休',
        slots: [],
        offSlots: [],
        hasOverride: false,
      };
    }

    const state = dateStates[day.date];
    const pickedSlots = allSlots.filter((time) => state?.slots?.[time]);
    const offSlots = allSlots.filter((time) => state?.offSlots?.[time]);
    const active = useAllSlots ? true : Boolean(state?.active ?? day.active);
    const dayOff = !useAllSlots && Boolean(state?.dayOff);

    if (dayOff) {
      return {
        date: day.date,
        label: day.label,
        shopOpen: true,
        active: false,
        status: '排休',
        slots: [],
        offSlots: [],
        hasOverride: true,
      };
    }

    if (!useAllSlots && offSlots.length) {
      const workLabel = pickedSlots.length ? pickedSlots.join('、') : '—';
      const offLabel = offSlots.join('、');
      return {
        date: day.date,
        label: day.label,
        shopOpen: true,
        active: pickedSlots.length > 0,
        status: pickedSlots.length
          ? `可接 ${pickedSlots.length} 段 · 排休 ${offSlots.length} 段`
          : `時段排休 ${offSlots.length} 段`,
        slots: pickedSlots,
        offSlots,
        hasOverride: true,
      };
    }

    if (useAllSlots) {
      return {
        date: day.date,
        label: day.label,
        shopOpen: true,
        active: true,
        status: '全部可接',
        slots: [...allSlots],
        offSlots: [],
        hasOverride: false,
      };
    }

    if (!active || !pickedSlots.length) {
      return {
        date: day.date,
        label: day.label,
        shopOpen: true,
        active: false,
        status: '店休',
        slots: [],
        offSlots: [],
        hasOverride: Boolean(state),
      };
    }

    return {
      date: day.date,
      label: day.label,
      shopOpen: true,
      active: true,
      status: `可接 ${pickedSlots.length} 段`,
      slots: pickedSlots,
      offSlots: [],
      hasOverride: Boolean(state) || day.hasOverride,
    };
  });
}

export function buildScheduleExportData(params: {
  staffName: string;
  monthLabel: string;
  timeRangeLabel: string;
  availabilityLabel: string;
  monthDays: MonthDayInput[];
  allSlots: string[];
  useAllSlots: boolean;
  dateStates: Record<string, DateInput>;
}): ScheduleExportData {
  return {
    staffName: params.staffName,
    monthLabel: params.monthLabel,
    timeRangeLabel: params.timeRangeLabel,
    availabilityLabel: params.availabilityLabel,
    allSlots: params.allSlots,
    days: buildDayRows(params),
    exportedAt: taipeiDateTimeLabel(),
  };
}

function baseFilename(data: ScheduleExportData): string {
  return `排班表-${safeFilename(data.staffName)}-${safeFilename(data.monthLabel)}-${taipeiDateStamp()}`;
}

function listRows(data: ScheduleExportData): string[][] {
  return [
    ['攝影師', data.staffName],
    ['月份', data.monthLabel],
    ['營業時段', data.timeRangeLabel],
    ['排班摘要', data.availabilityLabel],
    ['匯出時間', data.exportedAt],
    [],
    ['日期', '星期', '狀態', '時段'],
    ...data.days.map((day) => [
      day.date,
      day.label,
      day.status,
      day.slots.length ? day.slots.join('、') : '—',
    ]),
  ];
}

export function exportScheduleCsv(data: ScheduleExportData) {
  const rows = listRows(data);
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
          return text;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  downloadBlob(`${baseFilename(data)}.csv`, blob);
}

export function exportScheduleXlsx(data: ScheduleExportData) {
  const sheet = XLSX.utils.aoa_to_sheet(listRows(data));
  sheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 48 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '月排班');

  if (data.allSlots.length) {
    const openDays = data.days.filter((day) => day.shopOpen);
    const gridHeader = ['時段', ...openDays.map((day) => day.label)];
    const gridRows = data.allSlots.map((time) => [
      time,
      ...openDays.map((day) => {
        if (day.offSlots.includes(time)) return '排休';
        if (!day.active) return '';
        return day.slots.includes(time) ? '可接' : '';
      }),
    ]);
    const gridSheet = XLSX.utils.aoa_to_sheet([gridHeader, ...gridRows]);
    gridSheet['!cols'] = [{ wch: 8 }, ...openDays.map(() => ({ wch: 10 }))];
    XLSX.utils.book_append_sheet(workbook, gridSheet, '時段矩陣');
  }

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    `${baseFilename(data)}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}

function slotAvailable(data: ScheduleExportData, day: ScheduleDayExport, time: string): boolean {
  if (!day.shopOpen) return false;
  return day.active && day.slots.includes(time);
}

function renderScheduleCanvas(data: ScheduleExportData): HTMLCanvasElement {
  const padding = 32;
  const titleSize = 24;
  const metaSize = 14;
  const openDays = data.days.filter((day) => day.shopOpen);
  const useGrid = data.allSlots.length > 0 && openDays.length > 0;
  const timeColWidth = 72;
  const dayColWidth = Math.max(72, Math.min(96, Math.floor(760 / Math.max(openDays.length, 1))));
  const tableWidth = useGrid ? timeColWidth + openDays.length * dayColWidth : 760;
  const headerHeight = 42;
  const rowHeight = useGrid ? 28 : 32;
  const rowCount = useGrid ? data.allSlots.length : data.days.length;
  const tableHeight = headerHeight + rowCount * rowHeight;
  const width = tableWidth + padding * 2;
  const height = 120 + tableHeight + padding;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立匯出畫布');

  const fontFamily = '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#111827';
  ctx.font = `700 ${titleSize}px ${fontFamily}`;
  ctx.fillText(`「${data.staffName}」${data.monthLabel}排班表`, padding, padding + 8);

  ctx.fillStyle = '#6b7280';
  ctx.font = `500 ${metaSize}px ${fontFamily}`;
  ctx.fillText(`營業時段 ${data.timeRangeLabel} · ${data.availabilityLabel}`, padding, padding + 38);
  ctx.fillText(`匯出時間 ${data.exportedAt}`, padding, padding + 58);

  const tableTop = padding + 78;

  if (useGrid) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padding, tableTop, tableWidth, headerHeight);
    ctx.strokeStyle = '#e5e7eb';
    ctx.strokeRect(padding, tableTop, tableWidth, headerHeight);

    ctx.fillStyle = '#374151';
    ctx.font = `700 13px ${fontFamily}`;
    ctx.fillText('時段', padding + 16, tableTop + 26);
    openDays.forEach((day, index) => {
      const x = padding + timeColWidth + index * dayColWidth;
      ctx.strokeRect(x, tableTop, dayColWidth, headerHeight);
      ctx.fillText(day.label, x + 10, tableTop + 26);
    });

    data.allSlots.forEach((time, rowIndex) => {
      const y = tableTop + headerHeight + rowIndex * rowHeight;
      ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#fcfcfd';
      ctx.fillRect(padding, y, tableWidth, rowHeight);
      ctx.strokeStyle = '#e5e7eb';
      ctx.strokeRect(padding, y, tableWidth, rowHeight);
      ctx.fillStyle = '#111827';
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillText(time, padding + 16, y + 19);

      openDays.forEach((day, colIndex) => {
        const x = padding + timeColWidth + colIndex * dayColWidth;
        ctx.strokeRect(x, y, dayColWidth, rowHeight);
        if (slotAvailable(data, day, time)) {
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(x + 8, y + 7, dayColWidth - 16, rowHeight - 14);
          ctx.fillStyle = '#ffffff';
          ctx.font = `700 12px ${fontFamily}`;
          ctx.fillText('可接', x + 24, y + 19);
        }
      });
    });
  } else {
    const headers = ['日期', '狀態', '時段'];
    const colWidths = [140, 120, tableWidth - 260];
    let x = padding;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padding, tableTop, tableWidth, headerHeight);
    headers.forEach((header, index) => {
      ctx.strokeStyle = '#e5e7eb';
      ctx.strokeRect(x, tableTop, colWidths[index], headerHeight);
      ctx.fillStyle = '#374151';
      ctx.font = `700 14px ${fontFamily}`;
      ctx.fillText(header, x + 12, tableTop + 26);
      x += colWidths[index];
    });

    data.days.forEach((day, rowIndex) => {
      const y = tableTop + headerHeight + rowIndex * rowHeight;
      const cells = [day.label, day.status, day.slots.length ? day.slots.join('、') : '—'];
      let cellX = padding;
      ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#fcfcfd';
      ctx.fillRect(padding, y, tableWidth, rowHeight);
      cells.forEach((cell, index) => {
        ctx.strokeStyle = '#e5e7eb';
        ctx.strokeRect(cellX, y, colWidths[index], rowHeight);
        ctx.fillStyle = '#111827';
        ctx.font = `500 13px ${fontFamily}`;
        ctx.fillText(cell, cellX + 12, y + 19);
        cellX += colWidths[index];
      });
    });
  }

  return canvas;
}

export function exportSchedulePdf(data: ScheduleExportData) {
  const canvas = renderScheduleCanvas(data);
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${baseFilename(data)}.pdf`);
}

export function exportScheduleImage(data: ScheduleExportData, format: 'png' | 'jpeg') {
  const canvas = renderScheduleCanvas(data);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'jpeg' ? 0.92 : undefined;
  canvas.toBlob(
    (blob) => {
      if (!blob) throw new Error('無法產生圖片');
      downloadBlob(`${baseFilename(data)}.${format}`, blob);
    },
    mime,
    quality,
  );
}

export function exportSchedule(data: ScheduleExportData, format: ScheduleExportFormat) {
  switch (format) {
    case 'csv':
      exportScheduleCsv(data);
      break;
    case 'xlsx':
      exportScheduleXlsx(data);
      break;
    case 'pdf':
      exportSchedulePdf(data);
      break;
    case 'png':
      exportScheduleImage(data, 'png');
      break;
    case 'jpeg':
      exportScheduleImage(data, 'jpeg');
      break;
    default:
      throw new Error('不支援的匯出格式');
  }
}
