'use client';

import { useEffect, useState } from 'react';

type Props = {
  src: string | null | undefined;
  alt: string;
  /** Guest preview: discourage saving via right-click / drag. */
  protect?: boolean;
};

export function DeliveryImage({ src, alt, protect = false }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src) {
    return <div className="delivery-photo-placeholder">無法載入</div>;
  }
  if (failed) {
    return <div className="delivery-photo-placeholder">無法載入</div>;
  }

  return (
    <div
      className={`delivery-preview-frame${protect ? ' protected' : ''}`}
      onContextMenu={protect ? (e) => e.preventDefault() : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
      {protect ? <div className="delivery-preview-watermark" aria-hidden /> : null}
    </div>
  );
}
