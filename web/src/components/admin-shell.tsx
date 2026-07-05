'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type SessionInfo = {
  account: string;
  role: string;
  roleLabel: string;
  photographerName: string;
};

type AdminShellProps = {
  children: React.ReactNode;
  onRefresh?: () => void;
};

export function AdminShell({ children, onRefresh }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetch('/api/admin/session')
      .then(async (res) => res.json())
      .then((data) => {
        if (!data.loggedIn) {
          router.replace('/admin');
          return;
        }
        setSession(data.session);
      })
      .catch(() => router.replace('/admin'));
  }, [router]);

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin');
  }

  const isManager = session?.role === '主' || session?.role === '副主';
  const isMaster = session?.role === '主';
  const isDeputy = session?.role === '副';

  function navClass(active: boolean) {
    return [
      'inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold no-underline transition-colors',
      active
        ? 'border-[var(--booking-primary)] bg-[var(--booking-primary)] text-white'
        : 'border-[var(--booking-border)] bg-white text-[var(--booking-text)] hover:border-[var(--booking-primary)]',
    ].join(' ');
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <h1>沐紋映像｜預約後台</h1>
          {session ? (
            <p className="admin-muted">
              {session.role === '副'
                ? `${session.photographerName || session.account}「${session.account}」`
                : `${session.roleLabel}「${session.account}」${
                    session.photographerName ? `｜${session.photographerName}` : ''
                  }`}
            </p>
          ) : null}
        </div>
        <div className="admin-topbar-actions">
          {onRefresh ? (
            <button type="button" className="admin-button secondary" onClick={onRefresh}>
              刷新
            </button>
          ) : null}
          <button type="button" className="admin-button secondary" onClick={logout}>
            登出
          </button>
        </div>
      </header>

      <nav className="admin-nav">
        <Link href="/admin/dashboard" className={navClass(pathname === '/admin/dashboard')}>
          預約列表
        </Link>
        {isDeputy ? (
          <>
            <Link href="/admin/profile" className={navClass(pathname === '/admin/profile')}>
              攝影師管理
            </Link>
            <Link href="/admin/schedule" className={navClass(pathname === '/admin/schedule')}>
              我的排班
            </Link>
          </>
        ) : null}
        {isManager ? (
          <>
            <Link href="/admin/team" className={navClass(pathname === '/admin/team')}>
              團隊管理
            </Link>
            <Link href="/admin/schedule" className={navClass(pathname === '/admin/schedule')}>
              排班表
            </Link>
          </>
        ) : null}
        {isMaster ? (
          <Link href="/admin/settings" className={navClass(pathname === '/admin/settings')}>
            系統設定
          </Link>
        ) : null}
      </nav>

      {children}
    </div>
  );
}
