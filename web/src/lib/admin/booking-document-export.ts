import { jsPDF } from 'jspdf';
import { DOCUMENT_TAB_LABELS } from '@/lib/admin/booking-documents';

const PDF_MARGIN_PT = 0;
const PDF_CAPTURE_SCALE = 4;
const PDF_SHEET_WIDTH_PX = 794;
const PDF_SHEET_LABELS = ['項目表', '合約表', '估價單'] as const;

export type PdfExportProgress = {
  current: number;
  total: number;
  label: string;
};

export type PdfExportOptions = {
  studio?: boolean;
};

function togglePdfCapture(host: HTMLElement | null, enabled: boolean) {
  if (!host) return;
  host.classList.toggle('booking-doc-print-host--capture', enabled);
  if (enabled) {
    host.dataset.prevLeft = host.style.left;
    host.dataset.prevTop = host.style.top;
    host.dataset.prevZIndex = host.style.zIndex;
    host.dataset.prevOpacity = host.style.opacity;
    host.style.left = '0';
    host.style.top = '0';
    host.style.zIndex = '-1';
    host.style.opacity = '1';
    return;
  }
  host.style.left = host.dataset.prevLeft || '';
  host.style.top = host.dataset.prevTop || '';
  host.style.zIndex = host.dataset.prevZIndex || '';
  host.style.opacity = host.dataset.prevOpacity || '';
}

function prepareElementForCapture(element: HTMLElement, studio: boolean) {
  element.classList.add('booking-doc-sheet--capture');
  if (studio) {
    element.style.width = `${PDF_SHEET_WIDTH_PX}px`;
    element.style.maxWidth = `${PDF_SHEET_WIDTH_PX}px`;
  }
}

function cleanupElementAfterCapture(element: HTMLElement) {
  element.classList.remove('booking-doc-sheet--capture');
  element.style.width = '';
  element.style.maxWidth = '';
}

async function captureElementCanvas(element: HTMLElement, studio: boolean) {
  const html2canvas = (await import('html2canvas')).default;
  prepareElementForCapture(element, studio);

  try {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    return await html2canvas(element, {
      scale: PDF_CAPTURE_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: studio ? PDF_SHEET_WIDTH_PX : element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: studio ? PDF_SHEET_WIDTH_PX : element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
  } finally {
    cleanupElementAfterCapture(element);
  }
}

export async function renderElementToPdfPage(
  pdf: jsPDF,
  element: HTMLElement,
  pageIndex: number,
  options: PdfExportOptions = {},
): Promise<number> {
  const canvas = await captureElementCanvas(element, Boolean(options.studio));
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const renderWidth = pageWidth - PDF_MARGIN_PT * 2;
  const renderHeight = (canvas.height / canvas.width) * renderWidth;
  const sliceHeightPx = Math.floor((pageHeight / renderWidth) * canvas.width);
  const totalSlices = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));

  for (let slice = 0; slice < totalSlices; slice += 1) {
    const sourceY = slice * sliceHeightPx;
    const sourceHeight = Math.min(sliceHeightPx, canvas.height - sourceY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sourceHeight;
    const context = sliceCanvas.getContext('2d');
    if (!context) continue;
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      sourceHeight,
    );

    const imgData = sliceCanvas.toDataURL('image/png');
    const sliceHeightPt = (sourceHeight / canvas.width) * renderWidth;
    const pageNumber = pageIndex + slice;
    if (pageNumber > 0) pdf.addPage();
    pdf.addImage(
      imgData,
      'PNG',
      PDF_MARGIN_PT,
      PDF_MARGIN_PT,
      renderWidth,
      sliceHeightPt,
      undefined,
      'SLOW',
    );
  }

  return pageIndex + totalSlices;
}

export async function downloadDocumentPdf(
  element: HTMLElement,
  filename: string,
  options: PdfExportOptions = {},
): Promise<void> {
  const host = element.closest('.booking-doc-print-host') as HTMLElement | null;
  togglePdfCapture(host, true);
  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    await renderElementToPdfPage(pdf, element, 0, options);
    pdf.save(filename);
  } finally {
    togglePdfCapture(host, false);
  }
}

export async function downloadAllDocumentSheetsPdf(
  sheets: HTMLElement[],
  filename: string,
  onProgress?: (progress: PdfExportProgress) => void,
  options: PdfExportOptions = {},
): Promise<void> {
  const host = sheets[0]?.closest('.booking-doc-print-host, .booking-doc-print-area') as HTMLElement | null;
  togglePdfCapture(host, true);

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const total = sheets.length;
    let pageIndex = 0;

    for (let index = 0; index < sheets.length; index += 1) {
      onProgress?.({
        current: index + 1,
        total,
        label: PDF_SHEET_LABELS[index] ?? `第 ${index + 1} 份`,
      });
      pageIndex = await renderElementToPdfPage(pdf, sheets[index], pageIndex, options);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    onProgress?.({ current: total, total, label: '完成下載' });
    pdf.save(filename);
  } finally {
    togglePdfCapture(host, false);
  }
}

export function buildDocumentFilename(
  caseNumber: string,
  customerName: string,
  suffix = '一式三份',
): string {
  const safeCase = (caseNumber || '無案號').replace(/[\\/:*?"<>|]/g, '_');
  const safeName = (customerName || '客戶').replace(/[\\/:*?"<>|]/g, '_');
  return `${safeCase}_${safeName}_${suffix}.pdf`;
}

export function buildAllDocumentsFilename(caseNumber: string, customerName: string): string {
  return buildDocumentFilename(caseNumber, customerName, '一式三份');
}

export function printDocument(element: HTMLElement): void {
  const previousTitle = document.title;
  document.body.classList.add('booking-doc-printing');
  const cleanup = () => {
    document.body.classList.remove('booking-doc-printing');
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  document.title = element.dataset.printTitle || '沐紋映像文件';
  window.print();
}

export const ALL_DOCUMENT_LABEL = `${DOCUMENT_TAB_LABELS.items}・${DOCUMENT_TAB_LABELS.contract}・${DOCUMENT_TAB_LABELS.quote}`;
