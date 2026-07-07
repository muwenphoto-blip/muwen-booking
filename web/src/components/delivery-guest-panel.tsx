'use client';

import { useCallback, useEffect, useState } from 'react';
import { DeliveryImage } from '@/components/delivery-image';
import { DeliveryPhotoLightbox } from '@/components/delivery-photo-lightbox';

type SessionState = {
  loggedIn: boolean;
  mustChangePassword?: boolean;
  phase?: string;
  selectionOpen?: boolean;
  showSelectionOption?: boolean;
  showDeliveryOption?: boolean;
  deliveryReady?: boolean;
  daysRemaining?: number | null;
  finalExpiresLabel?: string;
};

type PhotoItem = {
  id: string;
  file_name: string;
  selection: string;
  selection_note?: string;
  url: string | null;
};

type View =
  | 'login'
  | 'change-password'
  | 'hub'
  | 'selection'
  | 'download'
  | 'waiting'
  | 'expired';

export function DeliveryGuestPanel({ slug }: { slug: string }) {
  const [view, setView] = useState<View>('login');
  const [session, setSession] = useState<SessionState>({ loggedIn: false });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resolveHubView = useCallback((data: SessionState): View => {
    if (!data.loggedIn) return 'login';
    if (data.mustChangePassword) return 'change-password';
    if (data.phase === 'expired') return 'expired';
    return 'hub';
  }, []);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/delivery/${slug}/session`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '無法載入狀態');
    const next: SessionState = {
      loggedIn: Boolean(data.loggedIn),
      mustChangePassword: data.mustChangePassword,
      phase: data.phase,
      selectionOpen: data.selectionOpen,
      showSelectionOption: data.showSelectionOption,
      showDeliveryOption: data.showDeliveryOption,
      deliveryReady: data.deliveryReady,
      daysRemaining: data.daysRemaining,
      finalExpiresLabel: data.finalExpiresLabel,
    };
    setSession(next);
    return next;
  }, [slug]);

  const loadPhotos = useCallback(
    async (mode: 'selection' | 'delivery') => {
      const res = await fetch(`/api/delivery/${slug}/photos?mode=${mode}`);
      const data = await res.json();
      if (res.status === 401) {
        const next = await loadSession();
        setView(resolveHubView(next));
        return null;
      }
      if (!res.ok) throw new Error(data.error || '無法載入照片');
      setPhotos(data.photos ?? []);
      if (data.showExpiryNotice) {
        setShowExpiryModal(true);
      }
      return data;
    },
    [slug, loadSession, resolveHubView],
  );

  const goToHub = useCallback(async () => {
    const next = await loadSession();
    setPhotos([]);
    setView(resolveHubView(next));
  }, [loadSession, resolveHubView]);

  useEffect(() => {
    loadSession()
      .then((data) => setView(resolveHubView(data)))
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'));
  }, [loadSession, resolveHubView]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${slug}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登入失敗');
      const next = await loadSession();
      setView(resolveHubView(next));
      setMessage('登入成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${slug}/auth`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      setMessage(data.message || '密碼已更新');
      const next = await loadSession();
      setView(resolveHubView(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setBusy(false);
    }
  }

  async function openSelection() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await loadPhotos('selection');
      setView('selection');
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法載入選片');
    } finally {
      setBusy(false);
    }
  }

  async function openDelivery() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const next = await loadSession();
      if (!next.deliveryReady) {
        setView('waiting');
        return;
      }
      await loadPhotos('delivery');
      setView('download');
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法載入成品');
    } finally {
      setBusy(false);
    }
  }

  async function togglePhoto(photoId: string) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${slug}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', photoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === photoId
            ? { ...photo, selection: data.selection === 'reject' ? 'reject' : 'keep' }
            : photo,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusy(false);
    }
  }

  async function savePhotoNote(photoId: string, note: string) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${slug}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setNote', photoId, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存備註失敗');
      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === photoId ? { ...photo, selection_note: data.note || '' } : photo,
        ),
      );
      setMessage('備註已儲存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存備註失敗');
    } finally {
      setBusy(false);
    }
  }

  async function submitSelection() {
    const ok = window.confirm('送出後將鎖定選片，確定？');
    if (!ok) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${slug}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '送出失敗');
      setMessage(data.message || '已送出');
      await goToHub();
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗');
    } finally {
      setBusy(false);
    }
  }

  const showZipDownload = photos.length > 1;

  return (
    <div className="delivery-page">
      <header className="delivery-hero">
        <h1>沐紋映像 · 交片</h1>
        <p>請登入後選擇選片或下載成品。</p>
      </header>

      {error ? <p className="delivery-error">{error}</p> : null}
      {message ? <p className="delivery-success">{message}</p> : null}

      {view === 'login' ? (
        <form className="delivery-card" onSubmit={handleLogin}>
          <h2>登入</h2>
          <label className="delivery-field">
            <span>密碼</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="delivery-button" disabled={busy}>
            進入
          </button>
        </form>
      ) : null}

      {view === 'change-password' ? (
        <form className="delivery-card" onSubmit={handleChangePassword}>
          <h2>請修改密碼</h2>
          <p className="delivery-muted">首次登入須設定新密碼（至少 8 字）。</p>
          <label className="delivery-field">
            <span>目前密碼</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="delivery-field">
            <span>新密碼</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label className="delivery-field">
            <span>確認新密碼</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="delivery-button" disabled={busy}>
            儲存並繼續
          </button>
        </form>
      ) : null}

      {view === 'hub' ? (
        <div className="delivery-card delivery-hub">
          <h2>請選擇</h2>
          <p className="delivery-muted">依現場指示進入選片或下載成品。</p>
          <div className="delivery-hub-actions">
            {session.showSelectionOption ? (
              <button
                type="button"
                className="delivery-hub-btn"
                disabled={busy}
                onClick={openSelection}
              >
                <strong>選片</strong>
                <span>挑選要保留的照片並加備註</span>
              </button>
            ) : null}
            {session.showDeliveryOption ? (
              <button
                type="button"
                className="delivery-hub-btn"
                disabled={busy}
                onClick={openDelivery}
              >
                <strong>交片</strong>
                <span>
                  {session.deliveryReady ? '下載修好的成品' : '攝影師正努力中，請稍候'}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === 'selection' ? (
        <div className="delivery-card">
          <div className="delivery-section-head-inline">
            <h2>選片</h2>
            <button type="button" className="delivery-link-btn" disabled={busy} onClick={goToHub}>
              返回
            </button>
          </div>
          <p className="delivery-muted">
            預設全部保留。點照片可全螢幕放大；點右上角 ✗ 或按鍵盤 X 標記不要；可為每張加備註（會寫在下載檔名後面）。
          </p>
          {photos.length ? (
            <>
              <div className="delivery-grid">
                {photos.map((photo, index) => {
                  const rejected = photo.selection === 'reject';
                  const note = String(photo.selection_note || '').trim();
                  return (
                    <article
                      key={photo.id}
                      className={`delivery-photo-card${rejected ? ' rejected' : ''}`}
                    >
                      <div className="delivery-photo-thumb">
                        <button
                          type="button"
                          className="delivery-photo-open"
                          disabled={busy}
                          onClick={() => setLightboxIndex(index)}
                          aria-label={`放大檢視 ${photo.file_name}`}
                        >
                          <DeliveryImage src={photo.url} alt={photo.file_name} protect />
                        </button>
                        <button
                          type="button"
                          className="delivery-reject-btn"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePhoto(photo.id);
                          }}
                          aria-label={rejected ? '改為保留' : '標記不要'}
                          title={rejected ? '改為保留' : '標記不要'}
                        >
                          {rejected ? '↩' : '✗'}
                        </button>
                      </div>
                      {note ? <p className="delivery-photo-note-preview">{note}</p> : null}
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                className="delivery-button"
                disabled={busy}
                onClick={submitSelection}
              >
                送出選片
              </button>
            </>
          ) : (
            <p className="delivery-muted">攝影師尚未上傳預覽圖，請稍候。</p>
          )}
        </div>
      ) : null}

      {view === 'waiting' ? (
        <div className="delivery-card">
          <div className="delivery-section-head-inline">
            <h2>交片</h2>
            <button type="button" className="delivery-link-btn" disabled={busy} onClick={goToHub}>
              返回
            </button>
          </div>
          <p className="delivery-muted delivery-waiting-message">
            攝影師正努力中，請稍候。
          </p>
          <p className="delivery-muted">選片已完成，成品上傳後即可在此下載。</p>
        </div>
      ) : null}

      {view === 'download' ? (
        <div className="delivery-card">
          <div className="delivery-section-head-inline">
            <h2>交片 · 下載成品</h2>
            <button type="button" className="delivery-link-btn" disabled={busy} onClick={goToHub}>
              返回
            </button>
          </div>
          {session.finalExpiresLabel ? (
            <p className="delivery-muted">
              下載期限至 {session.finalExpiresLabel}
              {session.daysRemaining != null ? `（剩 ${session.daysRemaining} 天）` : ''}
            </p>
          ) : null}
          {photos.length ? (
            <>
              {showZipDownload ? (
                <p className="delivery-download-actions">
                  <a
                    href={`/api/delivery/${slug}/download-all`}
                    className="delivery-button"
                    download
                  >
                    打包下載全部（{photos.length} 個檔案）
                  </a>
                </p>
              ) : null}
              <div className="delivery-download-grid">
                {photos.map((photo) => {
                  const isPdf = photo.file_name.toLowerCase().endsWith('.pdf');
                  return (
                    <article key={photo.id} className="delivery-download-card">
                      {isPdf ? (
                        <div className="delivery-photo-placeholder">PDF</div>
                      ) : (
                        <DeliveryImage src={photo.url} alt={photo.file_name} />
                      )}
                      <p className="delivery-photo-name">{photo.file_name}</p>
                      <a
                        href={`/api/delivery/${slug}/download/${photo.id}`}
                        className="delivery-button small"
                        download
                      >
                        下載
                      </a>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="delivery-muted">尚無可下載的成品。</p>
          )}
        </div>
      ) : null}

      {view === 'expired' ? (
        <div className="delivery-card">
          <h2>連結已失效</h2>
          <p className="delivery-muted">下載期限已過，如需協助請聯繫沐紋映像。</p>
        </div>
      ) : null}

      {lightboxIndex !== null ? (
        <DeliveryPhotoLightbox
          photos={photos}
          index={lightboxIndex}
          busy={busy}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onToggleReject={togglePhoto}
          onSaveNote={savePhotoNote}
        />
      ) : null}

      {showExpiryModal && session.daysRemaining != null ? (
        <div className="delivery-modal-backdrop" role="presentation">
          <div className="delivery-modal" role="dialog" aria-modal="true">
            <h3>下載提醒</h3>
            <p>
              成品下載期限剩 <strong>{session.daysRemaining}</strong> 天
              {session.finalExpiresLabel ? `（至 ${session.finalExpiresLabel}）` : ''}
              ，請盡快下載備份。
            </p>
            <button
              type="button"
              className="delivery-button"
              onClick={() => setShowExpiryModal(false)}
            >
              我知道了
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
