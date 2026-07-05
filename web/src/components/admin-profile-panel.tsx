'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';

type ProfileData = {
  accountName: string;
  photographerName: string;
  role: string;
  roleLabel: string;
};

export function AdminProfilePanel() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [accountName, setAccountName] = useState('');
  const [photographerName, setPhotographerName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadProfile = useCallback(async () => {
    const res = await fetch('/api/admin/profile');
    const data = await res.json();
    if (res.status === 401) {
      router.replace('/admin');
      return;
    }
    if (!res.ok) throw new Error(data.error || '無法載入個人資料');
    const next = data.profile as ProfileData;
    if (next.role === '主' || next.role === '副主') {
      router.replace('/admin/team');
      return;
    }
    setProfile(next);
    setAccountName(next.accountName);
    setPhotographerName(next.photographerName);
    setPassword('');
    setError('');
  }, [router]);

  useEffect(() => {
    loadProfile()
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
  }, [loadProfile]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: accountName.trim(),
          photographerName: photographerName.trim(),
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      setMessage(data.message || '已更新');
      setPassword('');
      if (data.profile) {
        setProfile(data.profile);
        setAccountName(data.profile.accountName);
        setPhotographerName(data.profile.photographerName);
      } else {
        await loadProfile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSubmitting(false);
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
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}

      <div className="admin-card">
        <h2>攝影師管理</h2>
        <p className="admin-muted">僅可修改您自己的登入帳號、攝影師姓名與密碼。</p>

        <form className="admin-form admin-form-box" onSubmit={saveProfile}>
          <div className="admin-grid-2">
            <label className="admin-field">
              <span>登入帳號</span>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="至少 2 字"
                required
              />
            </label>
            <label className="admin-field">
              <span>攝影師姓名</span>
              <input
                value={photographerName}
                onChange={(e) => setPhotographerName(e.target.value)}
                placeholder="客人預約時顯示的名字"
                required
              />
            </label>
            <label className="admin-field">
              <span>新密碼</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空則不變更"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="admin-actions">
            <button type="submit" className="admin-button" disabled={submitting}>
              儲存
            </button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
