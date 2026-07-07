'use client';

import type { ServiceOptionFormRow } from '@/lib/admin/settings';

type Props = {
  rows: ServiceOptionFormRow[];
  onChange: (rows: ServiceOptionFormRow[]) => void;
};

function emptyRow(): ServiceOptionFormRow {
  return { label: '', labelEn: '', price: '' };
}

export function AdminServiceOptionsEditor({ rows, onChange }: Props) {
  function updateRow(index: number, patch: Partial<ServiceOptionFormRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="admin-service-options-editor">
      <div className="admin-service-options-editor__head">
        <span>子方案與金額</span>
        <p className="admin-muted">有子方案時，請為每個方案填寫金額；現場預約與後台修改會依所選方案帶入單價。</p>
      </div>
      {rows.length ? (
        <div className="admin-service-options-editor__list">
          {rows.map((row, index) => (
            <div key={index} className="admin-service-option-row">
              <label className="admin-field">
                <span>方案名稱</span>
                <input
                  value={row.label}
                  onChange={(e) => updateRow(index, { label: e.target.value })}
                  placeholder="如：半身"
                />
              </label>
              <label className="admin-field">
                <span>英文名稱</span>
                <input
                  value={row.labelEn}
                  onChange={(e) => updateRow(index, { labelEn: e.target.value })}
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
