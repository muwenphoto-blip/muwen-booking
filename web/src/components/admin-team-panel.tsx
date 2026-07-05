'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { StaffProfileModal } from '@/components/staff-profile-modal';

type TeamMember = {
  staffId: string;
  name: string;
  staffActive: boolean;
  availabilityLabel: string;
  hasAccount: boolean;
  userId?: string;
  account: string;
  accountActive: boolean;
  role: string | null;
  roleLabel: string;
  isMaster: boolean;
  isCoMaster: boolean;
  canManage: boolean;
  canDelete: boolean;
  canRemove?: boolean;
  blockingBookings?: number;
  hasProfile?: boolean;
};

type LogEntry = {
  id: string;
  timestamp: string;
  actor: string;
  roleLabel: string;
  action: string;
  summary: string;
  detail: string;
};

type SessionEntry = {
  id: string;
  displayName: string;
  lastSeenLabel: string;
};

type EditForm = {
  staffId: string;
  userId?: string;
  name: string;
  accountName: string;
  hasAccount: boolean;
  isMaster: boolean;
  role: 'deputy' | 'comaster';
  active: boolean;
  password: string;
};

const ROLE_OPTIONS = [
  { value: 'deputy', label: '攝影師' },
  { value: 'comaster', label: '副主控' },
] as const;

function roleBadgeClass(role: string | null, hasAccount: boolean) {
  if (role === '主') return 'admin-badge master';
  if (role === '副主') return 'admin-badge comaster';
  if (hasAccount) return 'admin-badge deputy';
  return 'admin-badge inactive';
}

export function AdminTeamPanel() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [canAssignCoMaster, setCanAssignCoMaster] = useState(false);
  const [canViewStaffProfile, setCanViewStaffProfile] = useState(false);
  const [profileModal, setProfileModal] = useState<{ staffId: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [newName, setNewName] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'deputy' | 'comaster'>('deputy');
  const [createAccount, setCreateAccount] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [setupHints, setSetupHints] = useState<string[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logQuery, setLogQuery] = useState('');

  const loadTeam = useCallback(async () => {
    const res = await fetch('/api/admin/team');
    const data = await res.json();
    if (res.status === 401) {
      router.replace('/admin');
      return;
    }
    if (!res.ok) throw new Error(data.error || '無法載入團隊資料');
    setMembers(data.members ?? []);
    setCanAssignCoMaster(Boolean(data.canAssignCoMaster));
    setCanViewStaffProfile(Boolean(data.canViewStaffProfile));
    setLogs(data.logs ?? []);
    setSessions(data.sessions ?? []);
    setSetupHints(Array.isArray(data.setupHints) ? data.setupHints : []);
  }, [router]);

  const searchLogs = useCallback(async (query: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    const res = await fetch(`/api/admin/logs?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '無法載入操作日誌');
    setLogs(data.logs ?? []);
  }, []);

  useEffect(() => {
    loadTeam()
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
  }, [loadTeam]);

  function startEdit(member: TeamMember) {
    setEditing({
      staffId: member.staffId,
      userId: member.userId,
      name: member.name,
      accountName: member.account || '',
      hasAccount: member.hasAccount,
      isMaster: member.isMaster,
      role: member.role === '副主' ? 'comaster' : 'deputy',
      active: member.hasAccount ? member.accountActive : member.staffActive,
      password: '',
    });
    setError('');
    setMessage('');
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const nameChanged = editing.name.trim() !== members.find((m) => m.staffId === editing.staffId)?.name;
      if (nameChanged) {
        const res = await fetch(`/api/admin/team/staff/${editing.staffId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editing.name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '修改姓名失敗');
      }

      if (editing.hasAccount && editing.userId) {
        const res = await fetch(`/api/admin/team/users/${editing.userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountName: editing.accountName,
            role: editing.isMaster ? undefined : editing.role,
            photographerName: editing.name.trim(),
            active: editing.active,
            password: editing.password || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '修改帳號失敗');
        setMessage(data.message || '已更新');
      } else if (!editing.hasAccount) {
        const current = members.find((m) => m.staffId === editing.staffId);
        const activeChanged = current && editing.active !== current.staffActive;
        if (activeChanged) {
          const res = await fetch(`/api/admin/team/staff/${editing.staffId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: editing.active }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '修改服務狀態失敗');
          setMessage(data.message || '已更新服務狀態');
        } else if (nameChanged) {
          setMessage('已更新姓名');
        } else {
          setMessage('沒有需要更新的項目');
        }
      } else if (createAccount && editing.accountName && editing.password) {
        const res = await fetch('/api/admin/team/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photographerName: editing.name.trim(),
            accountName: editing.accountName,
            password: editing.password,
            role: editing.role,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '建立帳號失敗');
        setMessage(data.message || '已建立登入帳號');
      } else if (nameChanged) {
        setMessage('已更新姓名');
      } else {
        setMessage('沒有需要更新的項目');
      }

      setEditing(null);
      setCreateAccount(false);
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteMember(member: TeamMember) {
    if (!member.userId) {
      setError('此成員尚無登入帳號，請使用「移除攝影師」或先建立帳號');
      return;
    }
    const ok = window.confirm(
      `確定要刪除「${member.account}」的登入帳號？\n攝影師「${member.name}」仍會留在預約選項；若要完全移除請按「移除攝影師」。`,
    );
    if (!ok) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/admin/team/users/${member.userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      if (editing?.userId === member.userId) setEditing(null);
      setMessage(data.message || '已刪除帳號');
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeStaffMember(member: TeamMember) {
    const blocking = member.blockingBookings ?? 0;
    if (blocking > 0) {
      setError(
        `「${member.name}」尚有 ${blocking} 筆進行中預約，請先至預約列表轉派或取消後再移除。`,
      );
      return;
    }
    const ok = window.confirm(
      `確定要完全移除「${member.name}」？\n將從預約選項刪除（既有預約紀錄保留）。`,
    );
    if (!ok) return;

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/admin/team/staff/${member.staffId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '移除失敗');
      if (editing?.staffId === member.staffId) setEditing(null);
      setMessage(data.message || '已移除');
      await loadTeam();
      await searchLogs(logQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const name = newName.trim();
      const account = newAccount.trim();
      const resStaff = await fetch('/api/admin/team/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const staffData = await resStaff.json();
      if (!resStaff.ok) throw new Error(staffData.error || '新增失敗');

      if (account) {
        const resUser = await fetch('/api/admin/team/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photographerName: name,
            accountName: account,
            password: newPassword,
            role: newRole,
          }),
        });
        const userData = await resUser.json();
        if (!resUser.ok) throw new Error(userData.error || '帳號建立失敗');
        setMessage(userData.message || '已新增成員與登入帳號');
      } else {
        setMessage(staffData.message || '已新增攝影師（僅預約選項）');
      }

      setNewName('');
      setNewAccount('');
      setNewPassword('');
      setNewRole('deputy');
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function openProfile(member: TeamMember) {
    setProfileModal({ staffId: member.staffId, name: member.name });
    setError('');
    setMessage('');
  }

  function renderProfileButton(member: TeamMember) {
    if (!canViewStaffProfile) return null;
    return (
      <button
        type="button"
        className="admin-action neutral"
        disabled={submitting}
        onClick={() => openProfile(member)}
      >
        基本資料{member.hasProfile ? ' ✓' : ''}
      </button>
    );
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="admin-card">載入中…</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell onRefresh={() => loadTeam().catch((err) => setError(err.message))}>
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}
      {setupHints.length ? (
        <div className="admin-card admin-setup-hints">
          {setupHints.map((hint) => (
            <p key={hint} className="admin-muted">
              {hint}
            </p>
          ))}
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>團隊成員</h2>
            <p className="admin-muted">
              同一位成員：預約用的「攝影師姓名」＋可選的「後台登入帳號」（跟舊版 GAS 一樣）
            </p>
          </div>
        </div>

        {members.length ? (
          <>
            <div className="admin-member-cards">
              {members.map((member) => (
                <article key={member.staffId} className="admin-member-card">
                  <div className="admin-member-card-head">
                    <strong>{member.name}</strong>
                    <span className={roleBadgeClass(member.role, member.hasAccount)}>
                      {member.roleLabel}
                    </span>
                  </div>
                  <dl className="admin-member-meta">
                    <div>
                      <dt>登入帳號</dt>
                      <dd>{member.hasAccount ? member.account : '—'}</dd>
                    </div>
                    <div>
                      <dt>排班</dt>
                      <dd>
                        {member.availabilityLabel}
                        <Link
                          className="admin-link"
                          href={`/admin/schedule?staff=${encodeURIComponent(member.name)}`}
                        >
                          排班
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>狀態</dt>
                      <dd>
                        <span
                          className={
                            (member.hasAccount ? member.accountActive : member.staffActive)
                              ? 'admin-badge active'
                              : 'admin-badge inactive'
                          }
                        >
                          {member.hasAccount
                            ? member.accountActive
                              ? '啟用'
                              : '停用'
                            : member.staffActive
                              ? '預約中'
                              : '停用'}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <div className="admin-actions admin-member-card-actions">
                    {renderProfileButton(member)}
                    {member.canManage ? (
                      <button
                        type="button"
                        className="admin-action neutral"
                        disabled={submitting}
                        onClick={() => startEdit(member)}
                      >
                        編輯
                      </button>
                    ) : null}
                    {member.canDelete ? (
                      <button
                        type="button"
                        className="admin-action reject"
                        disabled={submitting}
                        onClick={() => deleteMember(member)}
                      >
                        刪除帳號
                      </button>
                    ) : null}
                    {member.canRemove ? (
                      <button
                        type="button"
                        className="admin-action reject"
                        disabled={submitting}
                        onClick={() => removeStaffMember(member)}
                      >
                        移除攝影師
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="admin-table-wrap admin-member-table">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>攝影師</th>
                    <th>管理職級</th>
                    <th>登入帳號</th>
                    <th>排班</th>
                    <th>狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.staffId}>
                      <td>{member.name}</td>
                      <td>
                        <span className={roleBadgeClass(member.role, member.hasAccount)}>
                          {member.roleLabel}
                        </span>
                      </td>
                      <td>{member.hasAccount ? member.account : '—'}</td>
                      <td>
                        <span className="admin-muted">{member.availabilityLabel}</span>
                        <Link
                          className="admin-link"
                          href={`/admin/schedule?staff=${encodeURIComponent(member.name)}`}
                        >
                          排班
                        </Link>
                      </td>
                      <td>
                        <span
                          className={
                            (member.hasAccount ? member.accountActive : member.staffActive)
                              ? 'admin-badge active'
                              : 'admin-badge inactive'
                          }
                        >
                          {member.hasAccount
                            ? member.accountActive
                              ? '啟用'
                              : '停用'
                            : member.staffActive
                              ? '預約中'
                              : '停用'}
                        </span>
                      </td>
                      <td>
                        <div className="admin-actions">
                          {renderProfileButton(member)}
                          {member.canManage ? (
                            <button
                              type="button"
                              className="admin-action neutral"
                              disabled={submitting}
                              onClick={() => startEdit(member)}
                            >
                              編輯
                            </button>
                          ) : (
                            <span className="admin-muted">—</span>
                          )}
                          {member.canDelete ? (
                            <button
                              type="button"
                              className="admin-action reject"
                              disabled={submitting}
                              onClick={() => deleteMember(member)}
                            >
                              刪除帳號
                            </button>
                          ) : null}
                          {member.canRemove ? (
                            <button
                              type="button"
                              className="admin-action reject"
                              disabled={submitting}
                              onClick={() => removeStaffMember(member)}
                            >
                              移除攝影師
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="admin-muted">尚無成員，請在下方新增。</p>
        )}

        {editing ? (
          <form className="admin-form admin-form-box admin-edit-box" onSubmit={saveEdit}>
            <h3>編輯「{editing.name}」</h3>
            <div className="admin-grid-2">
              <label className="admin-field">
                <span>攝影師姓名</span>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </label>
              {editing.hasAccount ? (
                <label className="admin-field">
                  <span>登入帳號</span>
                  <input
                    value={editing.accountName}
                    onChange={(e) => setEditing({ ...editing, accountName: e.target.value })}
                    readOnly={editing.isMaster && !canAssignCoMaster}
                    required
                  />
                </label>
              ) : (
                <div className="admin-field admin-field-check">
                  <span>後台登入</span>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={createAccount}
                      onChange={(e) => setCreateAccount(e.target.checked)}
                    />
                    建立登入帳號
                  </label>
                </div>
              )}
            </div>

            {(!editing.hasAccount && createAccount) || editing.hasAccount ? (
              <div className="admin-grid-2">
                {!editing.hasAccount && createAccount ? (
                  <label className="admin-field">
                    <span>登入帳號</span>
                    <input
                      value={editing.accountName}
                      onChange={(e) => setEditing({ ...editing, accountName: e.target.value })}
                      placeholder="至少 2 字"
                      required
                    />
                  </label>
                ) : null}
                <label className="admin-field">
                  <span>管理職級</span>
                  {editing.isMaster ? (
                    <input value="主控" readOnly />
                  ) : (
                    <select
                      value={editing.role}
                      onChange={(e) =>
                        setEditing({ ...editing, role: e.target.value as 'deputy' | 'comaster' })
                      }
                      disabled={!editing.hasAccount && !createAccount}
                    >
                      {ROLE_OPTIONS.map((option) =>
                        option.value === 'comaster' && !canAssignCoMaster ? null : (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </label>
                <label className="admin-field">
                  <span>{editing.hasAccount ? '新密碼（選填）' : '密碼'}</span>
                  <input
                    type="password"
                    value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    placeholder={editing.hasAccount ? '留空則不變更' : '至少 8 字'}
                    required={!editing.hasAccount && createAccount}
                  />
                </label>
                {editing.hasAccount ? (
                  <label className="admin-field admin-field-check">
                    <span>帳號狀態</span>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={editing.active}
                        onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                        disabled={editing.isMaster}
                      />
                      啟用此帳號
                    </label>
                    {!editing.active ? (
                      <small className="admin-muted">
                        停用後既有預約需至預約列表轉單給其他攝影師
                      </small>
                    ) : null}
                  </label>
                ) : (
                  <label className="admin-field admin-field-check">
                    <span>服務狀態</span>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={editing.active}
                        onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                      />
                      啟用此攝影師（客人可選、可接單）
                    </label>
                    {!editing.active ? (
                      <small className="admin-muted">
                        停用後既有預約需至預約列表轉單給其他攝影師
                      </small>
                    ) : null}
                  </label>
                )}
              </div>
            ) : null}

            <div className="admin-actions">
              <button type="submit" className="admin-button" disabled={submitting}>
                儲存
              </button>
              <button
                type="button"
                className="admin-button secondary"
                disabled={submitting}
                onClick={() => {
                  setEditing(null);
                  setCreateAccount(false);
                }}
              >
                取消
              </button>
            </div>
          </form>
        ) : null}

        <form className="admin-form admin-form-box" onSubmit={addMember}>
          <h3>新增成員</h3>
          <div className="admin-grid-2">
            <label className="admin-field">
              <span>攝影師姓名</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="必填"
                required
              />
            </label>
            <label className="admin-field">
              <span>登入帳號（選填）</span>
              <input
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                placeholder="留空＝僅加入預約選項"
              />
            </label>
          </div>
          {newAccount ? (
            <div className="admin-grid-2">
              <label className="admin-field">
                <span>密碼</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 8 字"
                  required
                />
              </label>
              <label className="admin-field">
                <span>管理職級</span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'deputy' | 'comaster')}
                >
                  {ROLE_OPTIONS.map((option) =>
                    option.value === 'comaster' && !canAssignCoMaster ? null : (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          ) : null}
          <button type="submit" className="admin-button" disabled={submitting}>
            新增
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2>目前登入中</h2>
        {sessions.length ? (
          <div className="admin-session-list">
            {sessions.map((session) => (
              <div key={session.id} className="admin-session-item">
                <span className="admin-session-dot" aria-hidden />
                <span>{session.displayName}</span>
                <span className="admin-muted">{session.lastSeenLabel}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-muted">目前沒有登入中的帳號</p>
        )}
      </div>

      <div className="admin-card">
        <h2>操作日誌</h2>
        <form
          className="admin-log-search"
          onSubmit={(event) => {
            event.preventDefault();
            setLogQuery(logSearch.trim());
            searchLogs(logSearch.trim()).catch((err) =>
              setError(err instanceof Error ? err.message : '搜尋失敗'),
            );
          }}
        >
          <input
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder="搜尋操作、帳號、摘要…"
          />
          <button type="submit" className="admin-button secondary">
            搜尋
          </button>
          {logQuery ? (
            <button
              type="button"
              className="admin-button secondary"
              onClick={() => {
                setLogSearch('');
                setLogQuery('');
                searchLogs('').catch(() => {});
              }}
            >
              清除
            </button>
          ) : null}
        </form>
        {logs.length ? (
          <div className="admin-log-list">
            {logs.map((entry) => (
              <article key={entry.id} className="admin-log-item">
                <div className="admin-log-head">
                  <strong>{entry.action}</strong>
                  <span>{entry.summary}</span>
                </div>
                <div className="admin-log-meta">
                  {entry.timestamp} · {entry.actor}（{entry.roleLabel}）
                  {entry.detail ? ` · ${entry.detail}` : ''}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-muted">{logQuery ? '沒有符合的紀錄。' : '尚無操作紀錄。'}</p>
        )}
      </div>

      {profileModal ? (
        <StaffProfileModal
          staffId={profileModal.staffId}
          staffName={profileModal.name}
          open
          onClose={() => setProfileModal(null)}
          onSaved={() => loadTeam().catch(() => {})}
        />
      ) : null}
    </AdminShell>
  );
}
