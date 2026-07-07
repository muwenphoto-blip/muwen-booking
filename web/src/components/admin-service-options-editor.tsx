'use client';

import { useState } from 'react';
import type { ServiceOptionFormRow } from '@/lib/admin/settings';
import { suggestEnglishUnlessTouched, translateChineseLabel } from '@/lib/admin/chinese-english-label';

type Props = {
  rows: ServiceOptionFormRow[];
  onChange: (rows: ServiceOptionFormRow[]) => void;
};

function emptyRow(): ServiceOptionFormRow {
  return { label: '', labelEn: '', price: '' };
}

export function AdminServiceOptionsEditor({ rows, onChange }: Props) {
  const [englishTouchedRows, setEnglishTouchedRows] = useState<Set<number>>(() => new Set());

  function updateRow(index: number, patch: Partial<ServiceOptionFormRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
    setEnglishTouchedRows((prev) => {
      const next = new Set<number>();
      prev.forEach((rowIndex) => {
        if (rowIndex < index) next.add(rowIndex);
        if (rowIndex > index) next.add(rowIndex - 1);
      });
      return next;
    });
  }

  function syncEnglish(index: number, label: string, currentEnglish: string) {
    const suggested = suggestEnglishUnlessTouched(label, currentEnglish, englishTouchedRows.has(index));
    if (suggested !== currentEnglish) {
      updateRow(index, { labelEn: suggested });
    }
  }

  return (
    <div className="admin-service-options-editor">
      <div className="admin-service-options-editor__head">
        <span>子方案與金額</span>
        <p className="admin-muted">
          有子方案時，請為每個方案填寫金額；輸入中文方案名稱會自動帶入英文（手動修改英文後將不再覆寫）。
        </p>
      </div>
      {rows.length ? (
        <div className="admin-service-options-editor__list">
          {rows.map((row, index) => (
            <div key={index} className="admin-service-option-row">
              <label className="admin-field">
                <span>方案名稱</span>
                <input
                  value={row.label}
                  onFocus={() => syncEnglish(index, row.label, row.labelEn)}
                  onChange={(e) => {
                    const nextLabel = e.target.value;
                    updateRow(index, {
                      label: nextLabel,
                      labelEn: suggestEnglishUnlessTouched(
                        nextLabel,
                        row.labelEn,
                        englishTouchedRows.has(index),
                      ),
                    });
                  }}
                  placeholder="如：半身"
                />
              </label>
              <label className="admin-field">
                <span>英文名稱</span>
                <input
                  value={row.labelEn}
                  onChange={(e) => {
                    setEnglishTouchedRows((prev) => new Set(prev).add(index));
                    updateRow(index, { labelEn: e.target.value });
                  }}
                  placeholder="Half Body"
                />
              </label>
              <label className="admin-field">
                <span>金額（新台幣）</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={row.price}
                  onChange={(e) => updateRow(index, { price: e.target.value })}
                  placeholder="1200"
                />
              </label>
              <button
                type="button"
                className="admin-action reject admin-service-option-row__remove"
                onClick={() => removeRow(index)}
              >
                移除
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="admin-muted admin-service-options-editor__empty">尚無子方案，請在下方新增，或改填上方的服務金額。</p>
      )}
      <button
        type="button"
        className="admin-button secondary admin-service-options-editor__add"
        onClick={() => onChange([...rows, emptyRow()])}
      >
        ＋ 新增方案
      </button>
    </div>
  );
}
