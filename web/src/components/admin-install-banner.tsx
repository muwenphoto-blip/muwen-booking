'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function AdminInstallBanner() {
  const [standalone, setStandalone] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneMode());
    try {
      setDismissed(sessionStorage.getItem('muwen-admin-install-dismissed') === '1');
    } catch {
      setDismissed(false);
    }

    const onInstallable = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onInstallable);
    return () => window.removeEventListener('beforeinstallprompt', onInstallable);
  }, []);

  if (standalone || dismissed) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem('muwen-admin-install-dismissed', '1');
    } catch {
      // ignore
    }
  }

  return (
    <div className="admin-install-banner">
      <div className="admin-install-banner__body">
        <strong>像 App 一樣開啟後台</strong>
        {deferredPrompt ? (
          <p className="admin-muted">按下方按鈕可安裝到主畫面，之後一鍵進入後台。</p>
        ) : isIos() ? (
          <p className="admin-muted">
            請點 Safari 下方 <strong>分享</strong> → <strong>加入主畫面</strong>，之後從桌面圖示開啟。
          </p>
        ) : (
          <p className="admin-muted">
            請用 Chrome／Edge 開啟此頁，選單中的 <strong>安裝應用程式</strong> 或{' '}
            <strong>加到主畫面</strong>。
          </p>
        )}
        <div className="admin-install-banner__actions">
          {deferredPrompt ? (
            <button type="button" className="admin-button" onClick={handleInstall}>
              安裝到主畫面
            </button>
          ) : null}
          <button type="button" className="admin-button secondary" onClick={handleDismiss}>
            暫時不要
          </button>
        </div>
      </div>
    </div>
  );
}
