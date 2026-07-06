'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminInstallBanner } from '@/components/admin-install-banner';

type StaffOption = { name: string };

const STORAGE_ACCOUNT = 'muwenAdminAccount';
const LEGACY_PASSWORD_KEY = 'muwenAdminPwd';

export function AdminAuthPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [mode, setMode] = useState<'login' | 'bootstrap' | 'recovery'>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photographerName, setPhotographerName] = useState('');
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [remember, setRemember] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/admin/session')
      .then(async (res) => res.json())
      .then((data) => {
        if (data.loggedIn) {
          router.replace('/admin/dashboard');
          return;
        }
        setNeedsBootstrap(Boolean(data.needsBootstrap));
        setMode(data.needsBootstrap ? 'bootstrap' : 'login');
      })
      .finally(() => setLoading(false));

    fetch('/api/booking/config')
      .then(async (res) => res.json())
      .then((data) => {
        const names = (data.staff || [])
          .map((item: { value: string }) => item.value)
          .filter((name: string) => name && name !== '不指定');
        setStaffOptions(names.map((name: string) => ({ name })));
        if (names[0]) setPhotographerName(names[0]);
      })
      .catch(() => {});

    try {
      localStorage.removeItem(LEGACY_PASSWORD_KEY);
      const savedAccount = localStorage.getItem(STORAGE_ACCOUNT) || '';
      if (savedAccount) {
        setAccount(savedAccount);
        setRemember(true);
      }
    } catch {
      // ignore
    }
  }, [router]);

  function saveRememberedAccount(nextAccount: string, shouldRemember: boolean) {
    try {
      localStorage.removeItem(LEGACY_PASSWORD_KEY);
      if (shouldRemember) {
        localStorage.setItem(STORAGE_ACCOUNT, nextAccount);
      } else {
        localStorage.removeItem(STORAGE_ACCOUNT);
      }
    } catch {
      // ignore
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      if (mode === 'recovery') {
        if (newPassword !== newPasswordConfirm) {
          throw new Error('兩次輸入的新密碼不一致');
        }
        const res = await fetch('/api/admin/recovery/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recoveryKey,
            newPassword,
            confirmPassword: newPasswordConfirm,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '重設失敗');
        setMessage(data.message || '已重設主控密碼');
        setMode('login');
        setRecoveryKey('');
        setNewPassword('');
        setNewPasswordConfirm('');
        return;
      }

      const endpoint = mode === 'bootstrap' ? '/api/admin/bootstrap' : '/api/admin/login';
      const payload =
        mode === 'bootstrap'
          ? { account, password: confirmPassword || password, photographerName }
          : { account, password };

      if (mode === 'bootstrap' && password !== confirmPassword) {
        throw new Error('兩次密碼不一致');
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');

      if (mode === 'login') {
        saveRememberedAccount(account.trim(), remember);
      }

      setMessage(data.message || '成功');
      router.push('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function clearRemembered() {
    saveRememberedAccount('', false);
    setRemember(false);
    setMessage('已清除記住的帳號');
    setError('');
  }

  if (loading) {
    return <div className="admin-card">載入中…</div>;
  }

  return (
    <>
      {mode === 'login' ? <AdminInstallBanner /> : null}
      <div className="admin-card">
      <h1>
        {mode === 'bootstrap'
          ? '首次設定主控帳號'
          : mode === 'recovery'
            ? '主控密碼復原'
            : '沐紋映像｜預約後台'}
      </h1>
      <p className="admin-muted">
        {mode === 'bootstrap'
          ? '目前還沒有後台帳號，請先建立主控。'
          : mode === 'recovery'
            ? '使用預先設定的復原金鑰重設主控密碼。'
            : '請輸入登入帳號與密碼。'}
      </p>

      <form className="admin-form" onSubmit={onSubmit}>
        {mode === 'recovery' ? (
          <>
            <label className="admin-field">
              <span>復原金鑰</span>
              <input
                type="password"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                required
              />
            </label>
            <label className="admin-field">
              <span>新主控密碼</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="admin-field">
              <span>確認新密碼</span>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          </>
        ) : (
          <>
            <label className="admin-field">
              <span>登入帳號</span>
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="請輸入帳號"
                autoComplete="username"
                required
              />
            </label>

            <label className="admin-field">
              <span>密碼</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'}
                required
              />
            </label>

            {mode === 'bootstrap' ? (
              <>
                <label className="admin-field">
                  <span>確認密碼</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再輸入一次密碼"
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>連結攝影師</span>
                  <select
                    value={photographerName}
                    onChange={(e) => setPhotographerName(e.target.value)}
                  >
                    <option value="">暂不連結</option>
                    {staffOptions.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="admin-field admin-field-check">
                <span> </span>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  記住帳號（僅限私人電腦）
                </label>
              </label>
            )}
          </>
        )}

        {error ? <p className="admin-error">{error}</p> : null}
        {message ? <p className="admin-success">{message}</p> : null}

        <button type="submit" className="admin-button" disabled={submitting}>
          {submitting
            ? '處理中…'
            : mode === 'bootstrap'
              ? '建立主控帳號'
              : mode === 'recovery'
                ? '重設主控密碼'
                : '登入'}
        </button>
      </form>

      {!needsBootstrap && mode === 'login' ? (
        <div className="admin-auth-links">
          <button type="button" className="admin-link-button" onClick={() => setMode('recovery')}>
            忘記密碼？使用復原金鑰
          </button>
          {remember ? (
            <button type="button" className="admin-link-button" onClick={clearRemembered}>
              清除記住的帳號
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === 'recovery' ? (
        <button
          type="button"
          className="admin-link-button"
          onClick={() => {
            setMode('login');
            setError('');
            setMessage('');
          }}
        >
          返回登入
        </button>
      ) : null}
    </div>
    </>
  );
}
