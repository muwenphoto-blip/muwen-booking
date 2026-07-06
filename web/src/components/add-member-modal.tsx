'use client';

import { useEffect, useState } from 'react';
import { FormField } from '@/components/form-field';
import { clearFieldError, focusFirstInvalid, runValidation, type ValidationRule } from '@/lib/form-validation';

type MemberRoleType = 'comaster' | 'deputy' | 'store';

type AddMemberModalProps = {
  open: boolean;
  canAssignCoMaster: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    role: MemberRoleType;
    name: string;
    casePrefix: string;
    accountName: string;
    password: string;
    createAccount: boolean;
  }) => Promise<void>;
};

const ROLE_OPTIONS: { value: MemberRoleType; label: string }[] = [
  { value: 'comaster', label: '副店長' },
  { value: 'deputy', label: '攝影師' },
  { value: 'store', label: '門市端' },
];

function buildAddMemberRules(params: {
  role: MemberRoleType;
  name: string;
  casePrefix: string;
  accountName: string;
  password: string;
  createAccount: boolean;
}): ValidationRule[] {
  const isStore = params.role === 'store';
  const needsAccount = isStore || params.createAccount;
  const rules: ValidationRule[] = [
    { fieldId: 'add-role', label: '職級', value: params.role, required: true },
  ];

  if (!isStore) {
    rules.push(
      { fieldId: 'add-name', label: '攝影師姓名', value: params.name, required: true, minLength: 2 },
      {
        fieldId: 'add-case-prefix',
        label: '案號前綴',
        value: params.casePrefix,
        required: true,
        pattern: /^[A-Z]{2}$/,
        patternMessage: '案號前綴需為 2 個英文字',
      },
    );
  }

  if (needsAccount) {
    rules.push(
      {
        fieldId: 'add-account',
        label: '登入帳號',
        value: params.accountName,
        required: true,
        minLength: 2,
      },
      {
        fieldId: 'add-password',
        label: '密碼',
        value: params.password,
        required: true,
        minLength: 8,
      },
    );
  }

  return rules;
}

export function AddMemberModal({
  open,
  canAssignCoMaster,
  submitting,
  onClose,
  onSubmit,
}: AddMemberModalProps) {
  const [role, setRole] = useState<MemberRoleType>('deputy');
  const [name, setName] = useState('');
  const [casePrefix, setCasePrefix] = useState('');
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [createAccount, setCreateAccount] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) return;
    setRole('deputy');
    setName('');
    setCasePrefix('');
    setAccountName('');
    setPassword('');
    setCreateAccount(true);
    setFieldErrors({});
  }, [open]);

  if (!open) return null;

  const isStore = role === 'store';

  function patchError(fieldId: string) {
    setFieldErrors((prev) => clearFieldError(prev, fieldId));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const errors = runValidation(
      buildAddMemberRules({ role, name, casePrefix, accountName, password, createAccount }),
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalid(errors);
      return;
    }

    await onSubmit({
      role,
      name: name.trim(),
      casePrefix: casePrefix.trim().toUpperCase(),
      accountName: accountName.trim(),
      password,
      createAccount: isStore ? true : createAccount,
    });
  }

  function handleClose() {
    setRole('deputy');
    setName('');
    setCasePrefix('');
    setAccountName('');
    setPassword('');
    setCreateAccount(true);
    setFieldErrors({});
    onClose();
  }

  return (
    <div className="admin-modal-backdrop" onClick={handleClose}>
      <div
        className="admin-modal admin-modal--add-member"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-member-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <h3 id="add-member-title">新增成員</h3>
            <p className="admin-muted">
              一次設定職級與基本資料；標示 <abbr className="admin-field-required" title="必填">*</abbr> 為必填
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={handleClose} aria-label="關閉">
            ×
          </button>
        </div>

        <form className="admin-add-member-body" onSubmit={handleSubmit} noValidate>
          <FormField
            fieldId="add-role"
            label="職級"
            required
            hint="副店長可管理團隊；攝影師負責接單排班；門市端僅能登記與查詢"
            error={fieldErrors['add-role']}
          >
            <select
              value={role}
              onChange={(e) => {
                patchError('add-role');
                setRole(e.target.value as MemberRoleType);
              }}
            >
              {ROLE_OPTIONS.map((option) =>
                option.value === 'comaster' && !canAssignCoMaster ? null : (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </FormField>

          {!isStore ? (
            <div className="admin-grid-2">
              <FormField
                fieldId="add-name"
                label="攝影師姓名"
                required
                hint="顯示於預約列表、排班與案號文件"
                error={fieldErrors['add-name']}
              >
                <input
                  value={name}
                  onChange={(e) => {
                    patchError('add-name');
                    setName(e.target.value);
                  }}
                />
              </FormField>
              <FormField
                fieldId="add-case-prefix"
                label="案號前綴（2 英文字）"
                required
                hint="用於自動產生案號，例如 XE"
                error={fieldErrors['add-case-prefix']}
              >
                <input
                  value={casePrefix}
                  maxLength={2}
                  placeholder="例如 XE"
                  onChange={(e) => {
                    patchError('add-case-prefix');
                    setCasePrefix(e.target.value.toUpperCase());
                  }}
                />
              </FormField>
            </div>
          ) : null}

          {isStore || createAccount ? (
            <div className="admin-grid-2">
              <FormField
                fieldId="add-account"
                label="登入帳號"
                required
                hint={isStore ? '門市端登入用，建議易辨識的代號' : '後台登入帳號，至少 2 字'}
                error={fieldErrors['add-account']}
              >
                <input
                  value={accountName}
                  placeholder={isStore ? '例如 store01' : '至少 2 字'}
                  onChange={(e) => {
                    patchError('add-account');
                    setAccountName(e.target.value);
                  }}
                />
              </FormField>
              <FormField
                fieldId="add-password"
                label="密碼"
                required
                hint="至少 8 字，請妥善保存"
                error={fieldErrors['add-password']}
              >
                <input
                  type="password"
                  value={password}
                  placeholder="至少 8 字"
                  onChange={(e) => {
                    patchError('add-password');
                    setPassword(e.target.value);
                  }}
                />
              </FormField>
            </div>
          ) : null}

          {!isStore ? (
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(e) => setCreateAccount(e.target.checked)}
              />
              同時建立後台登入帳號
            </label>
          ) : null}

          <div className="admin-actions">
            <button type="submit" className="admin-button" disabled={submitting}>
              {submitting ? '處理中…' : '建立成員'}
            </button>
            <button type="button" className="admin-button secondary" disabled={submitting} onClick={handleClose}>
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
