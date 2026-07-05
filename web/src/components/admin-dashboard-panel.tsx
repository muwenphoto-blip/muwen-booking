'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import {
  bookingStatusClass,
  countBookingStats,
} from '@/lib/admin/bookings';
import { formatDate, formatDateWithWeekday } from '@/lib/booking/time';

type BookingRow = {
  id: string;
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
  canCancel?: boolean;
};

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
}) {
  const transferOptions = staffOptions.filter((name) => name !== row.staff_name);
  const hasActions =
    row.canRespond || row.canTransfer || row.canClose || row.canCancel;
  const showDeputyHint = row.staffInactive && !isManager && staffOptions.length > 0;

  if (!hasActions && !showDeputyHint) {
    return <span className="admin-muted">—</span>;
  }

  return (
    <div className="admin-booking-respond">
      {row.canRespond ? (
        <>
          {row.needsStaffAssign ? (
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
          <div className="admin-actions">
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
          </div>
        </>
      ) : null}

      {row.canTransfer && transferOptions.length ? (
        <label className="admin-field admin-assign-field">
          <span>轉給</span>
          <div className="admin-transfer-row">
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
            <button
              type="button"
              className="admin-action neutral"
              disabled={busyId === row.id}
              onClick={() => onTransfer(row.id, transferStaff)}
            >
              轉單
            </button>
          </div>
        </label>
      ) : null}

      {row.canClose ? (
        <div className="admin-actions">
          <button
            type="button"
            className="admin-action close"
            disabled={busyId === row.id}
            onClick={() => onClose(row.id)}
          >
            結案
          </button>
        </div>
      ) : null}

      {row.canCancel ? (
        <div className="admin-actions">
          <button
            type="button"
            className="admin-action reject"
            disabled={busyId === row.id}
            onClick={() => onCancel(row.id)}
          >
            取消
          </button>
        </div>
      ) : null}

      {showDeputyHint ? (
        <p className="admin-staff-warning">該攝影師已停用，請聯繫主控轉單</p>
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
}) {
  const hasActions =
    row.canRespond ||
    row.canTransfer ||
    row.canClose ||
    row.canCancel ||
    (row.staffInactive && !isManager && staffOptions.length > 0);

  return (
    <article className="admin-booking-card">
      <div className="admin-booking-card-head">
        <strong className="admin-booking-name">{row.customer_name || '（未填姓名）'}</strong>
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
                />
              ))}
            </div>
            <div className="admin-table-wrap admin-booking-table">
              <table className="admin-table">
                <thead>
                  <tr>
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
    </AdminShell>
  );
}
