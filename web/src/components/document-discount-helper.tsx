'use client';

import type { DocumentItemRow } from '@/lib/admin/booking-documents';
import {
  calculateRuleDiscount,
  describeDiscountRule,
  normalizeDiscountMode,
  type DocumentDiscountMode,
} from '@/lib/admin/document-discount';
import { formatAmount } from '@/components/booking-document-shared';

type DocumentDiscountHelperProps = {
  row: DocumentItemRow;
  onPatch: (patch: Partial<DocumentItemRow>) => void;
};

const MODE_OPTIONS: { value: DocumentDiscountMode; label: string }[] = [
  { value: 'manual', label: '手動輸入折扣' },
  { value: 'per_extra', label: '超過人數，每人減額' },
  { value: 'group_free', label: '滿人送人（買 N 送 M）' },
];

export function DocumentDiscountHelper({ row, onPatch }: DocumentDiscountHelperProps) {
  const mode = normalizeDiscountMode(row.discountMode);
  const preview =
    mode !== 'manual'
      ? formatAmount(calculateRuleDiscount({ ...row, discount: '' })) || '0'
      : '';

  return (
    <div className="booking-doc-discount-helper">
      <label className="admin-field admin-field--full">
        <span>折扣方式</span>
        <select
          value={mode}
          onChange={(e) => {
            const nextMode = e.target.value as DocumentDiscountMode;
            const patch: Partial<DocumentItemRow> = {
              discountMode: nextMode,
              promotionId: '',
              promotionName: '',
            };
            if (nextMode === 'per_extra') {
              patch.discountBasePeople = row.discountBasePeople || '4';
              patch.discountPerExtra = row.discountPerExtra || '200';
            }
            if (nextMode === 'group_free') {
              patch.discountGroupPay = row.discountGroupPay || '4';
              patch.discountGroupFree = row.discountGroupFree || '1';
            }
            onPatch(patch);
          }}
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {mode === 'per_extra' ? (
        <div className="admin-grid-2 booking-doc-discount-helper-fields">
          <label className="admin-field">
            <span>含在方案內人數</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={row.discountBasePeople || ''}
              placeholder="例：4"
              onChange={(e) => onPatch({ discountBasePeople: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>每多 1 人減（元）</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={row.discountPerExtra || ''}
              placeholder="例：200"
              onChange={(e) => onPatch({ discountPerExtra: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      {mode === 'group_free' ? (
        <div className="admin-grid-2 booking-doc-discount-helper-fields">
          <label className="admin-field">
            <span>每滿幾人（付費）</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={row.discountGroupPay || ''}
              placeholder="例：4"
              onChange={(e) => onPatch({ discountGroupPay: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>送幾人</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={row.discountGroupFree || ''}
              placeholder="例：1"
              onChange={(e) => onPatch({ discountGroupFree: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      {mode !== 'manual' && row.promotionName ? (
        <p className="booking-doc-discount-helper-hint admin-muted">
          目前套用後台活動「{row.promotionName}」。若要單筆自訂，請改為「手動輸入折扣」。
        </p>
      ) : null}

      {mode !== 'manual' ? (
        <p className="booking-doc-discount-helper-hint admin-muted">
          {describeDiscountRule(row)}
          {preview ? ` · 依目前數量自動折扣 ${preview} 元` : null}
          {' · 請將「數量」設為拍攝人數'}
        </p>
      ) : null}
    </div>
  );
}
