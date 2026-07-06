'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { DeliveryImage } from '@/components/delivery-image';
import { formatDateWithWeekday } from '@/lib/booking/time';

type BookingInfo = {
  id: string;
  case_number: string;
  customer_name: string;
  service: string;
  booking_date: string;
  booking_time: string;
  status: string;
  staff_name: string;
};

type DeliveryInfo = {
  id: string;
  url_slug: string;
  password_changed: boolean;
  phase: string;
  selection_locked_at: string | null;
  selection_reopened: boolean;
  finals_started_at: string | null;
  final_expires_at: string | null;
};

type PhotoRow = {
  id: string;
  kind: 'preview' | 'final';
  file_name: string;
  selection: string;
  sort_order: number;
  preview_url?: string;
};

function phaseLabel(delivery: DeliveryInfo | null): string {
  if (!delivery) return '尚未建立';
  if (delivery.phase === 'delivering') return '可下載';
  if (delivery.phase === 'expired') return '已到期';
  if (delivery.selection_locked_at && !delivery.selection_reopened) return '選片已鎖定';
  return '選片中';
}

export function AdminDeliveryPanel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [finalCount, setFinalCount] = useState(0);
  const [deliveryUrl, setDeliveryUrl] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const previewPhotos = useMemo(() => photos.filter((p) => p.kind === 'preview'), [photos]);
  const finalPhotos = useMemo(() => photos.filter((p) => p.kind === 'final'), [photos]);
  const selectionLocked = Boolean(delivery?.selection_locked_at && !delivery?.selection_reopened);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/admin/deliveries/${bookingId}`);
    const data = await res.json();
    if (res.status === 401) {
      router.replace('/admin');
      return;
    }
    if (!res.ok) throw new Error(data.error || '無法載入交片資料');
    setBooking(data.booking ?? null);
    setDelivery(data.delivery ?? null);
    setPhotos(data.photos ?? []);
    setFinalCount(data.finalCount ?? 0);
    setDeliveryUrl(data.deliveryUrl ?? null);
    setCanCreate(Boolean(data.canCreate));
    setCanManage(Boolean(data.canManage));
  }, [bookingId, router]);

  useEffect(() => {
    loadData()
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
  }, [loadData]);

  async function createDelivery() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deliveries/${bookingId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '建立失敗');
      setMessage(data.message || '已建立交片');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(kind: 'preview' | 'final', fileList: FileList | null) {
    if (!fileList?.length) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const form = new FormData();
      form.set('kind', kind);
      Array.from(fileList).forEach((file) => form.append('files', file));
      const res = await fetch(`/api/admin/deliveries/${bookingId}/photos`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上傳失敗');
      setMessage(data.message || '已上傳');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto(photoId: string, fileName: string) {
    const ok = window.confirm(`確定刪除「${fileName}」？`);
    if (!ok) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deliveries/${bookingId}/photos/${photoId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setMessage('已刪除');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setBusy(false);
    }
  }

  async function reopenSelection() {
    const ok = window.confirm('重新開啟選片後，客人可再次修改選擇。確定？');
    if (!ok) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deliveries/${bookingId}/reopen-selection`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      setMessage(data.message || '已重新開啟選片');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllPreviews() {
    if (!previewPhotos.length) return;
    const ok = window.confirm(`確定刪除全部 ${previewPhotos.length} 張預覽圖？`);
    if (!ok) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deliveries/${bookingId}/photos/previews`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setMessage(data.message || '已刪除全部預覽圖');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!deliveryUrl) return;
    try {
      await navigator.clipboard.writeText(deliveryUrl);
      setMessage('已複製交片連結');
    } catch {
      setError('無法複製連結，請手動選取');
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="admin-card">載入中…</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="admin-card">
        <div className="delivery-admin-head">
          <div>
            <h1>選片・交成品</h1>
            {booking ? (
              <p className="admin-muted">
                {booking.case_number ? `${booking.case_number}｜` : ''}
                {booking.customer_name}｜{formatDateWithWeekday(booking.booking_date)}{' '}
                {booking.booking_time}｜{booking.service}
              </p>
            ) : null}
          </div>
          <Link href="/admin/dashboard" className="admin-button neutral">
            返回預約列表
          </Link>
        </div>

        {error ? <p className="admin-error">{error}</p> : null}
        {message ? <p className="admin-success">{message}</p> : null}

        <div className="delivery-admin-meta">
          <div>
            <span className="admin-muted">狀態</span>
            <strong>{phaseLabel(delivery)}</strong>
          </div>
          <div>
            <span className="admin-muted">成品數</span>
            <strong>{finalCount}</strong>
          </div>
          {delivery?.final_expires_at ? (
            <div>
              <span className="admin-muted">下載期限</span>
              <strong>
                {new Date(delivery.final_expires_at).toLocaleDateString('zh-TW', {
                  timeZone: 'Asia/Taipei',
                })}
              </strong>
            </div>
          ) : null}
        </div>

        {!delivery ? (
          <div className="delivery-admin-empty">
            <p>尚未建立案件。</p>
            {canManage && canCreate ? (
              <button
                type="button"
                className="admin-button primary"
                disabled={busy}
                onClick={createDelivery}
              >
                建立案件
              </button>
            ) : canManage ? (
              <p className="admin-muted">
                此預約狀態為「{booking?.status}」，無法建立（須為已接受、已確認或已結案）。
              </p>
            ) : (
              <p className="admin-muted">僅主控可建立。</p>
            )}
          </div>
        ) : (
          <>
            <div className="delivery-admin-link">
              <label className="admin-field">
                <span>客人連結</span>
                <div className="delivery-link-row">
                  <input type="text" readOnly value={deliveryUrl || ''} />
                  <button type="button" className="admin-button neutral" onClick={copyUrl}>
                    複製
                  </button>
                </div>
              </label>
              <p className="admin-muted">
                預設密碼見後台設定「交片.defaultPassword」，客人首次登入須修改密碼。
              </p>
              {!selectionLocked && !delivery.finals_started_at ? (
                <div className="delivery-admin-actions">
                  <a
                    href={`/delivery/${delivery.url_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-button primary"
                  >
                    開啟選片頁
                  </a>
                  <p className="admin-muted">現場請用此頁讓客人選片（須先上傳預覽圖）。</p>
                </div>
              ) : null}
            </div>

            {canManage && selectionLocked ? (
              <div className="delivery-admin-actions">
                <a
                  href={`/api/admin/deliveries/${bookingId}/selection-export`}
                  className="admin-button primary"
                  download
                >
                  下載選片結果（ZIP）
                </a>
                <button
                  type="button"
                  className="admin-button neutral"
                  disabled={busy}
                  onClick={reopenSelection}
                >
                  重新開啟選片
                </button>
                <p className="admin-muted">
                  ZIP 內含保留的預覽圖與「選片紀錄.txt」檔名清單，請依檔名從原檔修圖。
                </p>
              </div>
            ) : null}

            <section className="delivery-admin-section">
              <div className="delivery-section-head">
                <h2>預覽圖（選片用）</h2>
                {canManage ? (
                  <div className="delivery-section-actions">
                    <label className="admin-button primary delivery-upload-btn">
                      上傳預覽
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        disabled={busy}
                        onChange={(e) => {
                          uploadPhotos('preview', e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {previewPhotos.length ? (
                      <button
                        type="button"
                        className="admin-button reject"
                        disabled={busy}
                        onClick={deleteAllPreviews}
                      >
                        一鍵刪除預覽
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {previewPhotos.length ? (
                <div className="delivery-admin-grid">
                  {previewPhotos.map((photo) => (
                    <article key={photo.id} className="delivery-admin-photo">
                      <DeliveryImage
                        src={
                          photo.preview_url ||
                          `/api/admin/deliveries/${bookingId}/photos/${photo.id}/preview`
                        }
                        alt={photo.file_name}
                      />
                      <p className="delivery-photo-name">{photo.file_name}</p>
                      <p className="delivery-photo-meta">
                        {photo.selection === 'reject' ? '客人標記刪除' : '保留'}
                      </p>
                      {canManage ? (
                        <button
                          type="button"
                          className="admin-action reject"
                          disabled={busy}
                          onClick={() => deletePhoto(photo.id, photo.file_name)}
                        >
                          刪除
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="admin-muted">尚無預覽圖。</p>
              )}
            </section>

            <section className="delivery-admin-section">
              <div className="delivery-section-head">
                <h2>成品（原檔）</h2>
                {canManage ? (
                  <label className="admin-button primary delivery-upload-btn">
                    上傳成品
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      hidden
                      disabled={busy}
                      onChange={(e) => {
                        uploadPhotos('final', e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <p className="admin-muted">上傳第一張成品後，客人進入下載階段（保留 7 天）。</p>
              {finalPhotos.length ? (
                <ul className="delivery-final-list">
                  {finalPhotos.map((photo) => (
                    <li key={photo.id}>
                      <span>{photo.file_name}</span>
                      {canManage ? (
                        <button
                          type="button"
                          className="admin-action reject"
                          disabled={busy}
                          onClick={() => deletePhoto(photo.id, photo.file_name)}
                        >
                          刪除
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">尚無成品。結案前須至少上傳一張。</p>
              )}
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
