'use client';

import { useEffect, useRef, useState } from 'react';
import '@fontsource/noto-sans-tc/chinese-traditional-400.css';
import {
  BookingDocumentContractPrint,
  BookingDocumentItemsPrint,
  BookingDocumentQuotePrint,
  type BookingDocumentPrintProps,
} from '@/components/booking-document-print-views';
import { BookingDocumentPdfOverlay } from '@/components/booking-document-pdf-overlay';
import {
  buildAllDocumentsFilename,
  downloadAllDocumentSheetsPdf,
  printDocument,
  type PdfExportProgress,
} from '@/lib/admin/booking-document-export';
import {
  DOCUMENT_TAB_HINTS,
  DOCUMENT_TAB_LABELS,
  type DocumentTab,
} from '@/lib/admin/booking-documents';
import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import { applyDocumentFinancialSync } from '@/components/booking-document-shared';

type StudioTab = DocumentTab | 'all';

const ZOOM_OPTIONS = [75, 100, 125, 150] as const;

type BookingDocumentStudioModalProps = {
  open: boolean;
  onClose: () => void;
  state: BookingDocumentState;
  onChange: (next: BookingDocumentState) => void;
  shopName: string;
  shopFullName: string;
  shopAddress: string;
  shopPhone: string;
  caseNumber?: string;
  dirty?: boolean;
};

export function BookingDocumentStudioModal({
  open,
  onClose,
  state,
  onChange,
  shopName,
  shopFullName,
  shopAddress,
  shopPhone,
  caseNumber,
  dirty,
}: BookingDocumentStudioModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<StudioTab>('items');
  const [zoom, setZoom] = useState<(typeof ZOOM_OPTIONS)[number]>(100);
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);
  const [error, setError] = useState('');
  const [pdfProgress, setPdfProgress] = useState<PdfExportProgress | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('items');
    setZoom(100);
    setError('');
  }, [open]);

  if (!open) return null;

  const sheetProps: BookingDocumentPrintProps = {
    state,
    shopName,
    shopFullName,
    shopAddress,
    shopPhone,
    studio: true,
    onChange: (next) => onChange(applyDocumentFinancialSync(next)),
  };

  function requestClose() {
    if (dirty && !window.confirm('尚有未儲存的變更，確定要離開文件工作室？')) return;
    onClose();
  }

  async function handleDownload() {
    if (!printRef.current) return;
    const prevTab = tab;
    if (tab !== 'all') {
      setTab('all');
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
    }
    const sheets = Array.from(
      printRef.current.querySelectorAll<HTMLElement>('.booking-doc-sheet'),
    );
    if (!sheets.length) return;
    setBusy('download');
    setError('');
    setPdfProgress({ current: 0, total: sheets.length, label: '準備中' });
    try {
      const filename = buildAllDocumentsFilename(
        state.caseNumber || caseNumber || '',
        state.customerName,
      );
      await downloadAllDocumentSheetsPdf(sheets, filename, setPdfProgress, { studio: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '下載失敗');
    } finally {
      if (prevTab !== 'all') setTab(prevTab);
      setBusy(null);
      setPdfProgress(null);
    }
  }

  function handlePrint() {
    if (!printRef.current) return;
    setBusy('print');
    printDocument(printRef.current);
    setBusy(null);
  }

  return (
    <div className="booking-doc-studio-backdrop" onClick={requestClose}>
      <div
        className="booking-doc-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-doc-studio-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="booking-doc-studio-head">
          <div>
            <p className="booking-doc-modal-eyebrow">沐紋映像 · 文件工作室</p>
            <div className="booking-doc-modal-title-row">
              <h3 id="booking-doc-studio-title">紙本預覽與製作</h3>
              {caseNumber || state.caseNumber ? (
                <span className="booking-doc-case-badge">{caseNumber || state.caseNumber}</span>
              ) : null}
              {dirty ? <span className="booking-doc-dirty-badge">未儲存</span> : null}
            </div>
            <p className="booking-doc-modal-sub">
              直接在紙本上編輯內容，確認後輸出清晰 PDF 或列印
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={requestClose} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="booking-doc-studio-toolbar">
          <div className="booking-doc-tabs booking-doc-studio-tabs">
            {(['items', 'contract', 'quote', 'all'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`booking-doc-tab${tab === key ? ' is-active' : ''}`}
                onClick={() => setTab(key)}
              >
                <span className="booking-doc-tab-label">
                  {key === 'all' ? '全部預覽' : DOCUMENT_TAB_LABELS[key]}
                </span>
                <span className="booking-doc-tab-hint">
                  {key === 'all' ? '項目表・合約表・估價單' : DOCUMENT_TAB_HINTS[key]}
                </span>
              </button>
            ))}
          </div>

          <div className="booking-doc-studio-controls">
            <label className="booking-doc-studio-zoom">
              <span>縮放</span>
              <select
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value) as (typeof ZOOM_OPTIONS)[number])}
              >
                {ZOOM_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="admin-button secondary"
              disabled={busy !== null}
              onClick={handlePrint}
            >
              {busy === 'print' ? '處理中…' : '列印'}
            </button>
            <button
              type="button"
              className="admin-button"
              disabled={busy !== null}
              onClick={handleDownload}
            >
              {busy === 'download' ? '產生中…' : '輸出 PDF'}
            </button>
            <button type="button" className="admin-button secondary" onClick={requestClose}>
              返回
            </button>
          </div>
        </div>

        {error ? <p className="admin-error booking-doc-studio-error">{error}</p> : null}

        <div className="booking-doc-studio-canvas-wrap">
          <div
            className="booking-doc-studio-canvas"
            style={{ transform: `scale(${zoom / 100})` }}
          >
            <div
              ref={printRef}
              className={`booking-doc-print-area booking-doc-print-area--bundle booking-doc-print-area--studio${
                tab === 'all' ? '' : ' booking-doc-print-area--single'
              }`}
              data-print-title={`${caseNumber || state.caseNumber || '案號'}_一式三份`}
            >
              {tab === 'items' || tab === 'all' ? (
                <BookingDocumentItemsPrint {...sheetProps} />
              ) : null}
              {tab === 'contract' || tab === 'all' ? (
                <BookingDocumentContractPrint {...sheetProps} />
              ) : null}
              {tab === 'quote' || tab === 'all' ? (
                <BookingDocumentQuotePrint {...sheetProps} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <BookingDocumentPdfOverlay progress={pdfProgress} />
    </div>
  );
}
