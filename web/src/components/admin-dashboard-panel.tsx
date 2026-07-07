'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { BookingDocumentsModal } from '@/components/booking-documents-modal';
import { WalkInBookingModal } from '@/components/walk-in-booking-modal';
import {
  bookingStatusClass,
  countBookingStats,
} from '@/lib/admin/bookings';
import { formatDate, formatDateWithWeekday } from '@/lib/booking/time';

type BookingRow = {
  id: string;
  case_number: string;
  booking_date: string;
  booking_time: string;
  staff_name: string;
  service: string;
  customer_name: string;
  phone: string;
  email: string;
  status: string;
  canRespond?: boolean;
  needsStaffAssign?: boolean;
  staffInactive?: boolean;
  canTransfer?: boolean;
  canClose?: boolean;
  closeNeedsFinals?: boolean;
  canDelivery?: boolean;
  canSelectPhotos?: boolean;
  selectionUrl?: string | null;
  canCancel?: boolean;
  canRemove?: boolean;
};

function CaseNumberButton({
  caseNumber,
  bookingId,
  onOpen,
}: {
  caseNumber: string;
  bookingId: string;
  onOpen: (bookingId: string, caseNumber: string) => void;
}) {
  if (!caseNumber) return <span className="admin-muted">—</span>;
  return (
    <button
      type="button"
      className="admin-case-number-btn"
      onClick={() => onOpen(bookingId, caseNumber)}
      title="開啟項目表／合約／估價單"
    >
      {caseNumber}
    </button>
  );
}

function StaffNameCell({ name, inactive }: { name: string; inactive?: boolean }) {
  if (!inactive) return <>{name}</>;
  return (
    <span className="admin-staff-inactive-wrap">
      <span className="admin-staff-inactive">{name}</span>
      <span className="admin-staff-warning">該攝影師已停用，請轉單給其他攝影師</span>
    </span>
  );
}

function BookingActions({
  row,
  busyId,
  staffOptions,
  isManager,
  assignStaff,
  transferStaff,
  onAssignStaffChange,
  onTransferStaffChange,
  onRespond,
  onTransfer,
  onClose,
  onCancel,
  onRemove,
}: {
  row: BookingRow;
  busyId: string;
  staffOptions: string[];
  isManager: boolean;
  assignStaff: string;
  transferStaff: string;
  onAssignStaffChange: (bookingId: string, value: string) => void;
  onTransferStaffChange: (bookingId: string, value: string) => void;
  onRespond: (id: string, decision: 'accept' | 'reject', assignStaff?: string) => void;
  onTransfer: (id: string, newStaff: string) => void;
  onClose: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const transferOptions = staffOptions.filter((name) => name !== row.staff_name);
  const hasActions =
    row.canRespond ||
    row.canTransfer ||
    row.canClose ||
    row.closeNeedsFinals ||
    row.canDelivery ||
    row.canSelectPhotos ||
    row.canCancel ||
    row.canRemove;
  const showDeputyHint = row.staffInactive && !isManager && staffOptions.length > 0;

  if (!hasActions && !showDeputyHint) {
    return <span className="admin-muted">—</span>;
  }

  const hasButtonRow =
    row.canRespond ||
    row.canTransfer ||
    row.canClose ||
    row.canDelivery ||
    row.canSelectPhotos ||
    row.canCancel ||
    row.canRemove;

  return (
    <div className="admin-booking-respond">
      {row.needsStaffAssign && row.canRespond ? (
        <label className="admin-field admin-assign-field">
          <span>指派攝影師</span>
          <select
            value={assignStaff}
            onChange={(e) => onAssignStaffChange(row.id, e.target.value)}
          >
            <option value="">請選擇</option>
            {staffOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {row.canTransfer && transferOptions.length ? (
        <label className="admin-field admin-assign-field">
          <span>轉給</span>
          <select
            value={transferStaff}
            onChange={(e) => onTransferStaffChange(row.id, e.target.value)}
          >
            <option value="">請選擇</option>
            {transferOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {row.closeNeedsFinals ? (
        <p className="admin-muted delivery-close-hint">須上傳成品後才能結案</p>
      ) : null}

      {showDeputyHint ? (
        <p className="admin-staff-warning">該攝影師已停用，請聯繫主控轉單</p>
      ) : null}

      {hasButtonRow ? (
        <div className="admin-actions-row">
          {row.canSelectPhotos && row.selectionUrl ? (
            <a
              href={row.selectionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-action accept delivery-link-btn"
            >
              選片
            </a>
          ) : null}
          {row.canDelivery ? (
            <Link
              href={`/admin/delivery/${row.id}`}
              className="admin-action neutral delivery-link-btn"
            >
              交成品
            </Link>
          ) : null}
          {row.canRespond ? (
            <>
              <button
                type="button"
                className="admin-action accept"
                disabled={busyId === row.id}
                onClick={() =>
                  onRespond(row.id, 'accept', row.needsStaffAssign ? assignStaff : undefined)
                }
              >
                接受
              </button>
              <button
                type="button"
                className="admin-action reject"
                disabled={busyId === row.id}
                onClick={() => onRespond(row.id, 'reject')}
              >
                拒絕
              </button>
            </>
          ) : null}
          {row.canTransfer && transferOptions.length ? (
            <button
              type="button"
              className="admin-action neutral"
              disabled={busyId === row.id}
              onClick={() => onTransfer(row.id, transferStaff)}
            >
              轉單
            </button>
          ) : null}
          {row.canClose ? (
            <button
              type="button"
              className="admin-action close"
              disabled={busyId === row.id}
              onClick={() => onClose(row.id)}
            >
              結案
            </button>
          ) : null}
          {row.canCancel ? (
            <button
              type="button"
              className="admin-action reject"
              disabled={busyId === row.id}
              onClick={() => onCancel(row.id)}
            >
              取消
            </button>
          ) : null}
          {row.canRemove ? (
            <button
              type="button"
              className="admin-action reject"
              disabled={busyId === row.id}
              onClick={() => onRemove(row.id)}
            >
              移除
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BookingCard({
  row,
  busyId,
  staffOptions,
  isManager,
  assignStaff,
  transferStaff,
  onAssignStaffChange,
  onTransferStaffChange,
  onRespond,
  onTransfer,
  onClose,
  onCancel,
  onRemove,
  onOpenDocuments,
}: {
  row: BookingRow;
  busyId: string;
  staffOptions: string[];
  isManager: boolean;
  assignStaff: string;
  transferStaff: string;
  onAssignStaffChange: (bookingId: string, value: string) => void;
  onTransferStaffChange: (bookingId: string, value: string) => void;
  onRespond: (id: string, decision: 'accept' | 'reject', assignStaff?: string) => void;
  onTransfer: (id: string, newStaff: string) => void;
  onClose: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenDocuments: (bookingId: string, caseNumber: string) => void;
}) {
  const hasActions =
    row.canRespond ||
    row.canTransfer ||
    row.canClose ||
    row.closeNeedsFinals ||
    row.canDelivery ||
    row.canSelectPhotos ||
    row.canCancel ||
    row.canRemove ||
    (row.staffInactive && !isManager && staffOptions.length > 0);

  return (
    <article className="admin-booking-card">
      <div className="admin-booking-card-head">
        <div>
          <strong className="admin-booking-name">{row.customer_name || '（未填姓名）'}</strong>
          {row.case_number ? (
            <p className="admin-booking-case">
              <CaseNumberButton
                caseNumber={row.case_number}
                bookingId={row.id}
                onOpen={onOpenDocuments}
              />
            </p>
          ) : null}
        </div>
        <span className={`admin-status-badge ${bookingStatusClass(row.status)}`}>
          {row.status}
        </span>
      </div>
      <dl className="admin-booking-meta">
        <div>
          <dt>日期</dt>
          <dd>{formatDateWithWeekday(row.booking_date)}</dd>
        </div>
        <div>
          <dt>時段</dt>
          <dd>{row.booking_time}</dd>
        </div>
        <div>
          <dt>服務</dt>
          <dd>{row.service}</dd>
        </div>
        <div>
          <dt>攝影師</dt>
          <dd>
            <StaffNameCell name={row.staff_name} inactive={row.staffInactive} />
          </dd>
        </div>
        <div>
          <dt>電話</dt>
          <dd>{row.phone}</dd>
        </div>
        {row.email ? (
          <div>
            <dt>Email</dt>
            <dd>{row.email}</dd>
          </div>
        ) : null}
      </dl>
      {hasActions ? (
        <div className="admin-booking-card-actions">
          <BookingActions
            row={row}
            busyId={busyId}
            staffOptions={staffOptions}
            isManager={isManager}
            assignStaff={assignStaff}
            transferStaff={transferStaff}
            onAssignStaffChange={onAssignStaffChange}
            onTransferStaffChange={onTransferStaffChange}
            onRespond={onRespond}
            onTransfer={onTransfer}
            onClose={onClose}
            onCancel={onCancel}
            onRemove={onRemove}
          />
        </div>
      ) : null}
    </article>
  );
}

export function AdminDashboardPanel() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [assignStaffById, setAssignStaffById] = useState<Record<string, string>>({});
  const [transferStaffById, setTransferStaffById] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [documentsBookingId, setDocumentsBookingId] = useState('');
  const [documentsCaseNumber, setDocumentsCaseNumber] = useState('');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [photographerName, setPhotographerName] = useState('');
  const [canCreateWalkIn, setCanCreateWalkIn] = useState(false);
  const [canAssignWalkInStaff, setCanAssignWalkInStaff] = useState(false);
  const [staffCasePrefixes, setStaffCasePrefixes] = useState<Record<string, string>>({});

  function openDocuments(bookingId: string, caseNumber: string) {
    setDocumentsBookingId(bookingId);
    setDocumentsCaseNumber(caseNumber);
  }

  function closeDocuments() {
    setDocumentsBookingId('');
    setDocumentsCaseNumber('');
  }

  const today = useMemo(() => formatDate(new Date()), []);
  const stats = useMemo(() => countBookingStats(bookings, today), [bookings, today]);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const res = await fetch('/api/admin/bookings');
    const bookingsData = await res.json();

    if (res.status === 401) {
      router.replace('/admin');
      return false;
    }

    if (!res.ok) {
      throw new Error(bookingsData.error || '無法載入預約');
    }

    setBookings(bookingsData.bookings ?? []);
    setStaffOptions(bookingsData.staffOptions ?? []);
    setIsManager(Boolean(bookingsData.isManager));
    setPhotographerName(bookingsData.photographerName ?? '');
    setCanCreateWalkIn(Boolean(bookingsData.canCreateWalkIn));
    setCanAssignWalkInStaff(Boolean(bookingsData.isManager || bookingsData.isStoreStaff));
    setStaffCasePrefixes(bookingsData.staffCasePrefixes ?? {});
    if (!options?.silent) {
      setError('');
    }
    return true;
  }, [router]);

  useEffect(() => {
    loadData()
      .catch((err) => {
        setError(err instanceof Error ? err.message : '載入失敗');
      })
      .finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    function refreshIfIdle() {
      if (document.visibilityState !== 'visible' || busyId) return;
      loadData({ silent: true }).catch(() => {});
    }

    window.addEventListener('focus', refreshIfIdle);
    document.addEventListener('visibilitychange', refreshIfIdle);
    return () => {
      window.removeEventListener('focus', refreshIfIdle);
      document.removeEventListener('visibilitychange', refreshIfIdle);
    };
  }, [busyId, loadData]);

  function updateAssignStaff(bookingId: string, value: string) {
    setAssignStaffById((prev) => ({ ...prev, [bookingId]: value }));
  }

  function updateTransferStaff(bookingId: string, value: string) {
    setTransferStaffById((prev) => ({ ...prev, [bookingId]: value }));
  }

  async function respondBooking(id: string, decision: 'accept' | 'reject', assignStaff?: string) {
    const row = bookings.find((item) => item.id === id);
    if (decision === 'accept' && row?.needsStaffAssign && !assignStaff) {
      setError('請先選擇要指派的攝影師');
      return;
    }

    setError('');
    setMessage('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          assignStaff: assignStaff || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      setMessage(data.message || '已更新');
      setAssignStaffById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setBusyId('');
    }
  }

  async function transferBooking(id: string, newStaff: string) {
    if (!newStaff) {
      setError('請先選擇要轉單的攝影師');
      return;
    }

    setError('');
    setMessage('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStaff }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '轉單失敗');
      setMessage(data.message || '已轉單');
      setTransferStaffById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '轉單失敗');
    } finally {
      setBusyId('');
    }
  }

  async function closeBooking(id: string) {
    const ok = window.confirm('結案後此筆預約將無法再修改，確定結案？');
    if (!ok) return;

    setError('');
    setMessage('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '結案失敗');
      setMessage(data.message || '已結案');
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '結案失敗');
    } finally {
      setBusyId('');
    }
  }

  async function cancelBooking(id: string) {
    const ok = window.confirm('確定取消這筆預約？將寄信通知客人。');
    if (!ok) return;

    setError('');
    setMessage('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取消失敗');
      setMessage(data.message || '已取消');
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失敗');
    } finally {
      setBusyId('');
    }
  }

  async function removeBooking(id: string) {
    const ok = window.confirm('確定要永久移除這筆預約？此動作無法復原。');
    if (!ok) return;

    setError('');
    setMessage('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '移除失敗');
      setMessage(data.message || '已移除');
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失敗');
    } finally {
      setBusyId('');
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
    <AdminShell
      onRefresh={() => loadData().catch((err) => setError(err instanceof Error ? err.message : '刷新失敗'))}
    >
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}

      {canCreateWalkIn ? (
        <div className="admin-walk-in-bar">
          <button type="button" className="admin-button" onClick={() => setWalkInOpen(true)}>
            ＋ 新增現場預約
          </button>
        </div>
      ) : null}

      <div className="admin-stats">
        <div className="admin-stat">
          <span>今日預約</span>
          <strong>{stats.todayCount}</strong>
        </div>
        <div className="admin-stat admin-stat-confirmed">
          <span>已確認</span>
          <strong>{stats.confirmedCount}</strong>
        </div>
        <div className="admin-stat admin-stat-pending">
          <span>待確認</span>
          <strong>{stats.pendingCount}</strong>
        </div>
      </div>

      <div className="admin-card">
        <h2>預約列表</h2>
        {bookings.length ? (
          <>
            <div className="admin-booking-cards">
              {bookings.map((row) => (
                <BookingCard
                  key={row.id}
                  row={row}
                  busyId={busyId}
                  staffOptions={staffOptions}
                  isManager={isManager}
                  assignStaff={assignStaffById[row.id] || ''}
                  transferStaff={transferStaffById[row.id] || ''}
                  onAssignStaffChange={updateAssignStaff}
                  onTransferStaffChange={updateTransferStaff}
                  onRespond={respondBooking}
                  onTransfer={transferBooking}
                  onClose={closeBooking}
                  onCancel={cancelBooking}
                  onRemove={removeBooking}
                  onOpenDocuments={openDocuments}
                />
              ))}
            </div>
            <div className="admin-table-wrap admin-booking-table">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>案號</th>
                    <th>日期</th>
                    <th>時段</th>
                    <th>服務</th>
                    <th>攝影師</th>
                    <th>姓名</th>
                    <th>電話</th>
                    <th>狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <CaseNumberButton
                          caseNumber={row.case_number}
                          bookingId={row.id}
                          onOpen={openDocuments}
                        />
                      </td>
                      <td>{formatDateWithWeekday(row.booking_date)}</td>
                      <td>{row.booking_time}</td>
                      <td>{row.service}</td>
                      <td>
                        <StaffNameCell name={row.staff_name} inactive={row.staffInactive} />
                      </td>
                      <td>{row.customer_name}</td>
                      <td>{row.phone}</td>
                      <td>
                        <span className={`admin-status-badge ${bookingStatusClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <BookingActions
                          row={row}
                          busyId={busyId}
                          staffOptions={staffOptions}
                          isManager={isManager}
                          assignStaff={assignStaffById[row.id] || ''}
                          transferStaff={transferStaffById[row.id] || ''}
                          onAssignStaffChange={updateAssignStaff}
                          onTransferStaffChange={updateTransferStaff}
                          onRespond={respondBooking}
                          onTransfer={transferBooking}
                          onClose={closeBooking}
                          onCancel={cancelBooking}
                          onRemove={removeBooking}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="admin-muted">目前沒有預約。</p>
        )}
      </div>

      <BookingDocumentsModal
        bookingId={documentsBookingId}
        caseNumber={documentsCaseNumber}
        open={Boolean(documentsBookingId)}
        onClose={closeDocuments}
        onSaved={() => {
          loadData({ silent: true }).catch(() => {});
        }}
      />

      <WalkInBookingModal
        open={walkInOpen}
        canAssignStaff={canAssignWalkInStaff}
        photographerName={photographerName}
        staffCasePrefixes={staffCasePrefixes}
        onClose={() => setWalkInOpen(false)}
        onSuccess={(booking) => {
          setMessage(
            `已建立門市預約${booking.case_number ? `（案號 ${booking.case_number}）` : ''}`,
          );
          loadData({ silent: true }).catch(() => {});
        }}
      />
    </AdminShell>
  );
}
