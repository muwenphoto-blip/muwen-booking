'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { DeliveryImage } from '@/components/delivery-image';
import { DeliveryUploadProgress } from '@/components/delivery-upload-progress';
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
  completed_at?: string | null;
};

type PhotoRow = {
  id: string;
  kind: 'preview' | 'final';
  file_name: string;
  selection: string;
  selection_note?: string;
  sort_order: number;
  preview_src?: string;
};

type UploadProgress = {
  kind: 'preview' | 'final';
  done: number;
  total: number;
  failed: number;
};

const UPLOAD_CONCURRENCY = 3;

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
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [dragKind, setDragKind] = useState<'preview' | 'final' | null>(null);

  const previewPhotos = useMemo(() => photos.filter((p) => p.kind === 'preview'), [photos]);
  const finalPhotos = useMemo(() => photos.filter((p) => p.kind === 'final'), [photos]);
  const selectionLocked = Boolean(delivery?.selection_locked_at && !delivery?.selection_reopened);
  const deliveryCompleted = Boolean(delivery?.completed_at);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/admin/deliveries/${bookingId}`);
    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      throw new Error('無法解析交片資料，請重新整理後再試');
    }
    if (res.status === 401) {
      router.replace('/admin');
      return;
    }
    if (!res.ok) throw new Error(String(data.error || '無法載入交片資料'));
    setBooking((data.booking as BookingInfo | null) ?? null);
    setDelivery((data.delivery as DeliveryInfo | null) ?? null);
    setPhotos((data.photos as PhotoRow[]) ?? []);
    setFinalCount(Number(data.finalCount ?? 0));
    setDeliveryUrl((data.deliveryUrl as string | null) ?? null);
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

  async function uploadPhotos(kind: 'preview' | 'final', input: FileList | File[] | null) {
    if (!input?.length) return;
    const files = Array.from(input);
    setError('');
    setMessage('');
    setUploadProgress({ kind, done: 0, total: files.length, failed: 0 });
    setBusy(true);

    let done = 0;
    let failed = 0;
    let failedNames: string[] = [];
    let index = 0;

    const uploadOne = async (file: File) => {
      const form = new FormData();
      form.set('kind', kind);
      form.append('files', file);
      const res = await fetch(`/api/admin/deliveries/${bookingId}/photos`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上傳失敗');
    };

    const worker = async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= files.length) break;
        const file = files[current];
        try {
          await uploadOne(file);
          done += 1;
        } catch (err) {
          failed += 1;
          const reason = err instanceof Error ? err.message : '上傳失敗';
          failedNames = [...failedNames, `${file.name}：${reason}`];
        }
        setUploadProgress({ kind, done: done + failed, total: files.length, failed });
      }
    };

    try {
      await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()));
      if (failed === 0) {
        setMessage(`已上傳 ${done} 個${kind === 'preview' ? '預覽' : '成品'}檔案`);
      } else if (done > 0) {
        setError(`上傳完成：${done} 成功、${failed} 失敗。${failedNames.slice(0, 3).join('；')}`);
      } else {
        throw new Error(failedNames[0] || '上傳失敗');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  }

  function handleDrop(kind: 'preview' | 'final', event: DragEvent) {
    event.preventDefault();
    setDragKind(null);
    if (!canManage || busy) return;
    const files = event.dataTransfer.files;
    if (!files.length) return;
    void uploadPhotos(kind, files);
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

  async function deleteAllFinals() {
    if (!finalPhotos.length) return;
    const ok = window.confirm(
      `確定刪除全部 ${finalPhotos.length} 個成品？客人將回到選片階段，需重新上傳成品才會開放下載。`,
    );
    if (!ok) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deliveries/${bookingId}/photos/finals`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setMessage(data.message || '已刪除全部成品');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string | null, label: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`已複製${label}`);
    } catch {
      setError('無法複製連結，請手動選取');
    }
  }

  async function markDeliveryComplete() {
    const ok = window.confirm(
      '標記交片完成後，後台「下載選片結果 ZIP」將關閉。確定？',
    );
    if (!ok) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deliveries/${bookingId}/complete`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      setMessage(data.message || '已標記交片完成');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusy(false);
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
                  <button
                    type="button"
                    className="admin-button neutral"
                    onClick={() => copyUrl(deliveryUrl, '客人連結')}
                  >
                    複製
                  </button>
                </div>
              </label>
              <p className="admin-muted">
                客人登入後可選「選片」或「交片」。預設密碼見後台設定「交片.defaultPassword」，首次登入須修改密碼。
              </p>

              {delivery && !selectionLocked ? (
                <div className="delivery-admin-actions">
                  <a
                    href={`/delivery/${delivery.url_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-button primary"
                  >
                    開啟客人頁
                  </a>
                  <p className="admin-muted">現場請用此連結讓客人登入選片（須先上傳預覽圖）。</p>
                </div>
              ) : null}

              {canManage && delivery?.finals_started_at && !deliveryCompleted ? (
                <div className="delivery-admin-actions">
                  <button
                    type="button"
                    className="admin-button primary"
                    disabled={busy}
                    onClick={markDeliveryComplete}
                  >
                    標記交片完成
                  </button>
                  <p className="admin-muted">
                    修圖交件完成後按此按鈕，將關閉後台「下載選片結果 ZIP」。
                  </p>
                </div>
              ) : null}

              {deliveryCompleted ? (
                <p className="admin-success">交片已完成 · 選片結果 ZIP 已關閉</p>
              ) : null}
            </div>

            {canManage && selectionLocked && !deliveryCompleted ? (
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

            <section
              className={`delivery-admin-section delivery-drop-zone${dragKind === 'preview' ? ' drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (canManage && !busy) setDragKind('preview');
              }}
              onDragLeave={() => setDragKind((k) => (k === 'preview' ? null : k))}
              onDrop={(e) => handleDrop('preview', e)}
            >
              <div className="delivery-section-head">
                <h2>預覽圖（選片用）</h2>
                {canManage ? (
                  <div className="delivery-section-actions">
                    <label className="admin-button primary delivery-upload-btn">
                      選擇多張預覽
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
              {uploadProgress?.kind === 'preview' ? (
                <DeliveryUploadProgress progress={uploadProgress} />
              ) : (
                <p className="admin-muted delivery-upload-hint">
                  可一次選取多張，或直接拖曳檔案到此區塊。
                </p>
              )}
              {previewPhotos.length ? (
                <div className="delivery-admin-grid">
                  {previewPhotos.map((photo) => (
                    <article key={photo.id} className="delivery-admin-photo">
                      <DeliveryImage src={photo.preview_src} alt={photo.file_name} />
                      <p className="delivery-photo-name">{photo.file_name}</p>
                      <p className="delivery-photo-meta">
                        {photo.selection === 'reject' ? '客人標記刪除' : '保留'}
                        {photo.selection_note ? `｜備註：${photo.selection_note}` : ''}
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

            <section
              className={`delivery-admin-section delivery-drop-zone${dragKind === 'final' ? ' drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (canManage && !busy) setDragKind('final');
              }}
              onDragLeave={() => setDragKind((k) => (k === 'final' ? null : k))}
              onDrop={(e) => handleDrop('final', e)}
            >
              <div className="delivery-section-head">
                <h2>成品（原檔）</h2>
                {canManage ? (
                  <div className="delivery-section-actions">
                    <label className="admin-button primary delivery-upload-btn">
                      選擇多個成品
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
                    {finalPhotos.length ? (
                      <button
                        type="button"
                        className="admin-button reject"
                        disabled={busy}
                        onClick={deleteAllFinals}
                      >
                        一鍵刪除成品
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {uploadProgress?.kind === 'final' ? (
                <DeliveryUploadProgress progress={uploadProgress} />
              ) : (
                <p className="admin-muted delivery-upload-hint">
                  可一次選取多個檔案，或直接拖曳到此區塊。上傳第一張成品後，客人進入下載階段（保留 7 天）。
                </p>
              )}
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
