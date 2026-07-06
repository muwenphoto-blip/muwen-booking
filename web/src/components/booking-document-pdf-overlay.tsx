'use client';

import type { PdfExportProgress } from '@/lib/admin/booking-document-export';

type BookingDocumentPdfOverlayProps = {
  progress: PdfExportProgress | null;
};

export function BookingDocumentPdfOverlay({ progress }: BookingDocumentPdfOverlayProps) {
  if (!progress) return null;

  const percent = progress.total
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : 0;

  return (
    <div className="booking-doc-pdf-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="booking-doc-pdf-overlay__card">
        <p className="booking-doc-pdf-overlay__title">產生 PDF 中…</p>
        <div className="booking-doc-pdf-overlay__track" aria-hidden="true">
          <div className="booking-doc-pdf-overlay__fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="booking-doc-pdf-overlay__step">
          <span>{progress.label}</span>
          <span className="booking-doc-pdf-overlay__count">
            {progress.current}/{progress.total}
          </span>
        </p>
      </div>
    </div>
  );
}
