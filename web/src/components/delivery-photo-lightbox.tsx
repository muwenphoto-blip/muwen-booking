'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeliveryImage } from '@/components/delivery-image';

type PhotoItem = {
  id: string;
  file_name: string;
  selection: string;
  selection_note?: string;
  url: string | null;
};

type Props = {
  photos: PhotoItem[];
  index: number;
  busy?: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onToggleReject: (photoId: string) => void;
  onSaveNote?: (photoId: string, note: string) => Promise<void> | void;
};

export function DeliveryPhotoLightbox({
  photos,
  index,
  busy = false,
  onClose,
  onNavigate,
  onToggleReject,
  onSaveNote,
}: Props) {
  const photo = photos[index];
  const rejected = photo?.selection === 'reject';
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setNoteDraft(String(photo?.selection_note || ''));
    setNoteSaved(false);
  }, [photo?.id, photo?.selection_note]);

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(index - 1);
  }, [hasPrev, index, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(index + 1);
  }, [hasNext, index, onNavigate]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === 'Escape') onClose();
      if (typing) return;
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'x' || event.key === 'X') {
        event.preventDefault();
        if (photo && !busy) onToggleReject(photo.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, goPrev, goNext, onToggleReject, photo, busy]);

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX == null) return;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 48) return;
    if (delta > 0) goPrev();
    else goNext();
  }

  if (!photo) return null;

  const noteChanged = noteDraft.trim() !== String(photo.selection_note || '').trim();

  return (
    <div
      className="delivery-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`放大檢視 ${photo.file_name}`}
      onClick={onClose}
    >
      <div className="delivery-lightbox-panel" onClick={(e) => e.stopPropagation()}>
        <header className="delivery-lightbox-head">
          <p className="delivery-lightbox-title">
            {photo.file_name}
            <span className="delivery-lightbox-count">
              {index + 1} / {photos.length}
            </span>
          </p>
          <button type="button" className="delivery-lightbox-close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>

        <div
          className="delivery-lightbox-stage"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {hasPrev ? (
            <button
              type="button"
              className="delivery-lightbox-nav prev"
              onClick={goPrev}
              aria-label="上一張"
            >
              ‹
            </button>
          ) : null}
          <div className={`delivery-lightbox-image${rejected ? ' rejected' : ''}`}>
            <DeliveryImage src={photo.url} alt={photo.file_name} protect />
          </div>
          {hasNext ? (
            <button
              type="button"
              className="delivery-lightbox-nav next"
              onClick={goNext}
              aria-label="下一張"
            >
              ›
            </button>
          ) : null}
        </div>

        <footer className="delivery-lightbox-foot">
          <div className="delivery-lightbox-actions">
            <button
              type="button"
              className={`delivery-lightbox-reject${rejected ? ' active' : ''}`}
              disabled={busy}
              onClick={() => onToggleReject(photo.id)}
            >
              {rejected ? '改為保留' : '✗ 標記不要'}
            </button>
          </div>

          {onSaveNote ? (
            <div className="delivery-lightbox-note">
              <label htmlFor="delivery-photo-note">修圖備註</label>
              <input
                id="delivery-photo-note"
                type="text"
                value={noteDraft}
                maxLength={120}
                placeholder="例如：放大眼睛、背景調亮"
                disabled={busy}
                onChange={(e) => {
                  setNoteDraft(e.target.value);
                  setNoteSaved(false);
                }}
              />
              <div className="delivery-lightbox-note-actions">
                <button
                  type="button"
                  className="delivery-button small"
                  disabled={busy || !noteChanged}
                  onClick={async () => {
                    await onSaveNote?.(photo.id, noteDraft.trim());
                    setNoteSaved(true);
                  }}
                >
                  儲存備註
                </button>
                {noteSaved && !noteChanged ? (
                  <p className="delivery-lightbox-saved" role="status">
                    已儲存
                  </p>
                ) : null}
                <p className="delivery-lightbox-hint">備註會加在成品下載檔名後面，方便溝通修圖需求</p>
              </div>
            </div>
          ) : null}

          <p className="delivery-lightbox-hint delivery-lightbox-hint--desktop">
            左右鍵切換 · X 標記不要 · Esc 關閉
          </p>
          <p className="delivery-lightbox-hint delivery-lightbox-hint--touch">
            左右滑動切換 · 點背景關閉
          </p>
        </footer>
      </div>
    </div>
  );
}
