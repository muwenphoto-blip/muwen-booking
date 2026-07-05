'use client';

import { useEffect, useState } from 'react';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  emptyStaffProfile,
  type StaffProfile,
} from '@/lib/admin/staff-profile';
import { DateSelectField } from '@/components/date-select-field';

const CURRENT_YEAR = new Date().getFullYear();

type StaffProfileModalProps = {
  staffId: string;
  staffName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function StaffProfileModal({
  staffId,
  staffName,
  open,
  onClose,
  onSaved,
}: StaffProfileModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<StaffProfile>(() => emptyStaffProfile(staffId));

  useEffect(() => {
    if (!open || !staffId) return;

    setLoading(true);
    setError('');
    setMessage('');
    fetch(`/api/admin/team/staff/${staffId}/profile`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '無法載入基本資料');
        setProfile(data.profile ?? emptyStaffProfile(staffId));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '無法載入基本資料');
        setProfile(emptyStaffProfile(staffId));
      })
      .finally(() => setLoading(false));
  }, [open, staffId]);

  if (!open) return null;

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/admin/team/staff/${staffId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setMessage(data.message || '已儲存');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-profile-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <h3 id="staff-profile-title">員工基本資料</h3>
            <p className="admin-muted">
              {staffName}｜僅主控可見，不會顯示在預約頁
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        {loading ? (
          <p className="admin-muted">載入中…</p>
        ) : (
          <form className="admin-form" onSubmit={saveProfile}>
            <div className="admin-grid-2">
              <label className="admin-field">
                <span>本名</span>
                <input
                  value={profile.legalName}
                  onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
                  placeholder="與證件一致"
                />
              </label>
              <label className="admin-field">
                <span>手機</span>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="0912345678"
                />
              </label>
              <label className="admin-field">
                <span>私人信箱</span>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="name@example.com"
                />
                <small className="admin-muted">用於接收指派給此攝影師的預約通知信</small>
              </label>
              <label className="admin-field">
                <span>生日</span>
                <DateSelectField
                  idPrefix="birth-date"
                  value={profile.birthDate}
                  onChange={(birthDate) => setProfile({ ...profile, birthDate })}
                  minYear={1940}
                  maxYear={CURRENT_YEAR}
                />
              </label>
              <label className="admin-field">
                <span>身分證字號</span>
                <input
                  value={profile.idNumber}
                  onChange={(e) => setProfile({ ...profile, idNumber: e.target.value })}
                  placeholder="選填"
                />
              </label>
              <label className="admin-field">
                <span>到職日</span>
                <DateSelectField
                  idPrefix="hired-on"
                  value={profile.hiredOn}
                  onChange={(hiredOn) => setProfile({ ...profile, hiredOn })}
                  minYear={2000}
                  maxYear={CURRENT_YEAR + 1}
                />
              </label>
              <label className="admin-field">
                <span>僱用類型</span>
                <select
                  value={profile.employmentType}
                  onChange={(e) => setProfile({ ...profile, employmentType: e.target.value })}
                >
                  <option value="">請選擇</option>
                  {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="admin-field">
              <span>通訊地址</span>
              <input
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="選填"
              />
            </label>

            <div className="admin-grid-2">
              <label className="admin-field">
                <span>緊急聯絡人</span>
                <input
                  value={profile.emergencyContact}
                  onChange={(e) => setProfile({ ...profile, emergencyContact: e.target.value })}
                  placeholder="姓名"
                />
              </label>
              <label className="admin-field">
                <span>緊急聯絡電話</span>
                <input
                  type="tel"
                  value={profile.emergencyPhone}
                  onChange={(e) => setProfile({ ...profile, emergencyPhone: e.target.value })}
                  placeholder="電話"
                />
              </label>
            </div>

            <label className="admin-field">
              <span>備註</span>
              <textarea
                value={profile.notes}
                onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
                placeholder="例如：專長、證照、合約備註…"
              />
            </label>

            {error ? <p className="admin-error">{error}</p> : null}
            {message ? <p className="admin-success">{message}</p> : null}

            <div className="admin-actions">
              <button type="submit" className="admin-button" disabled={submitting}>
                {submitting ? '儲存中…' : '儲存'}
              </button>
              <button type="button" className="admin-button secondary" onClick={onClose}>
                關閉
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
