'use client';

import { useEffect, useState } from 'react';

export function DeliveryImage({ src, alt }: { src: string | null | undefined; alt: string }) {
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
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} decoding="async" onError={() => setFailed(true)} />
  );
}
