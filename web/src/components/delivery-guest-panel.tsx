'use client';

import { useCallback, useEffect, useState } from 'react';
import { DeliveryImage } from '@/components/delivery-image';

type SessionState = {
  loggedIn: boolean;
  mustChangePassword?: boolean;
  phase?: string;
  selectionOpen?: boolean;
  daysRemaining?: number | null;
  finalExpiresLabel?: string;
};

type PhotoItem = {
  id: string;
  file_name: string;
  selection: string;
  url: string;
};

type View = 'login' | 'change-password' | 'selection' | 'download' | 'locked' | 'expired';

export function DeliveryGuestPanel({ slug }: { slug: string }) {
  const [view, setView] = useState<View>('login');
  const [session, setSession] = useState<SessionState>({ loggedIn: false });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resolveView = useCallback((data: SessionState): View => {
    if (!data.loggedIn) return 'login';
    if (data.mustChangePassword) return 'change-password';
    if (data.phase === 'expired') return 'expired';
    if (data.phase === 'delivering') return 'download';
    if (data.selectionOpen) return 'selection';
    return 'locked';
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
      daysRemaining: data.daysRemaining,
      finalExpiresLabel: data.finalExpiresLabel,
    };
    setSession(next);
    setView(resolveView(next));
    return next;
  }, [slug, resolveView]);

  const loadPhotos = useCallback(async () => {
    const res = await fetch(`/api/delivery/${slug}/photos`);
    const data = await res.json();
    if (res.status === 401) {
      const next = await loadSession();
      setView(resolveView(next));
      return;
    }
    if (!res.ok) throw new Error(data.error || '無法載入照片');
    setPhotos(data.photos ?? []);
    if (data.showExpiryNotice) {
      setShowExpiryModal(true);
    }
    if (data.phase === 'delivering') setView('download');
    else if (data.selectionOpen) setView('selection');
    else if (data.phase === 'expired') setView('expired');
    else setView('locked');
  }, [slug, loadSession, resolveView]);

  useEffect(() => {
    loadSession()
      .then((data) => {
        if (data.loggedIn && !data.mustChangePassword) {
          return loadPhotos();
        }
        return undefined;
      })
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'));
  }, [loadSession, loadPhotos]);

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
      if (!next.mustChangePassword) {
        await loadPhotos();
      }
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
      if (!next.mustChangePassword) {
        await loadPhotos();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
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
      await loadSession();
      setView('locked');
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delivery-page">
      <header className="delivery-hero">
        <h1>沐紋映像 · 交片</h1>
        <p>請依現場指示進行選片或下載成品。</p>
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

      {view === 'selection' ? (
        <div className="delivery-card">
          <h2>選片</h2>
          <p className="delivery-muted">
            預設全部保留。點照片下方 ✗ 可標記不要的照片（會變灰並顯示紅色 ✗）。
          </p>
          {photos.length ? (
            <>
              <div className="delivery-grid">
                {photos.map((photo) => {
                  const rejected = photo.selection === 'reject';
                  return (
                    <article
                      key={photo.id}
                      className={`delivery-photo-card${rejected ? ' rejected' : ''}`}
                    >
                      <DeliveryImage src={photo.url} alt={photo.file_name} />
                      <button
                        type="button"
                        className="delivery-reject-btn"
                        disabled={busy}
                        onClick={() => togglePhoto(photo.id)}
                        aria-label={rejected ? '改為保留' : '標記刪除'}
                      >
                        ✗
                      </button>
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

      {view === 'locked' ? (
        <div className="delivery-card">
          <h2>選片已完成</h2>
          <p className="delivery-muted">感謝您！成品準備好後將開放下載，請留意通知。</p>
        </div>
      ) : null}

      {view === 'download' ? (
        <div className="delivery-card">
          <h2>下載成品</h2>
          {session.finalExpiresLabel ? (
            <p className="delivery-muted">
              下載期限至 {session.finalExpiresLabel}
              {session.daysRemaining != null ? `（剩 ${session.daysRemaining} 天）` : ''}
            </p>
          ) : null}
          {photos.length ? (
            <>
              {photos.length > 1 ? (
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
