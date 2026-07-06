'use client';

import { useCallback, useEffect } from 'react';
import { DeliveryImage } from '@/components/delivery-image';

type PhotoItem = {
  id: string;
  file_name: string;
  selection: string;
  url: string | null;
};

type Props = {
  photos: PhotoItem[];
  index: number;
  busy?: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onToggleReject: (photoId: string) => void;
};

export function DeliveryPhotoLightbox({
  photos,
  index,
  busy = false,
  onClose,
  onNavigate,
  onToggleReject,
}: Props) {
  const photo = photos[index];
  const rejected = photo?.selection === 'reject';
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

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
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, goPrev, goNext]);

  if (!photo) return null;

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

        <div className="delivery-lightbox-stage">
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
          <button
            type="button"
            className={`delivery-lightbox-reject${rejected ? ' active' : ''}`}
            disabled={busy}
            onClick={() => onToggleReject(photo.id)}
          >
            {rejected ? '改為保留' : '標記不要（✗）'}
          </button>
          <p className="delivery-lightbox-hint">左右鍵切換 · Esc 關閉</p>
        </footer>
      </div>
    </div>
  );
}
