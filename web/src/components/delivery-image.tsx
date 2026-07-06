'use client';

import { useEffect, useState } from 'react';

export function DeliveryImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setFailed(true);
      setBlobUrl(null);
      return undefined;
    }

    if (src.startsWith('data:')) {
      setFailed(false);
      setBlobUrl(src);
      return undefined;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setBlobUrl(null);

    fetch(src, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) {
          throw new Error('不是圖片格式');
        }
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!src || failed) {
    return <div className="delivery-photo-placeholder">無法載入</div>;
  }
  if (!blobUrl) {
    return <div className="delivery-photo-placeholder">載入中…</div>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={blobUrl} alt={alt} />
  );
}
