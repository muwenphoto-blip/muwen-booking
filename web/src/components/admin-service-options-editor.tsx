'use client';

import { useEffect, useRef, useState } from 'react';
import type { ServiceOptionFormRow } from '@/lib/admin/settings';
import { suggestEnglishUnlessTouched } from '@/lib/admin/chinese-english-label';
import {
  fetchEnglishLabelSuggestion,
  getLocalEnglishLabel,
} from '@/lib/admin/chinese-english-label-client';

type Props = {
  rows: ServiceOptionFormRow[];
  onChange: (rows: ServiceOptionFormRow[]) => void;
};

function emptyRow(): ServiceOptionFormRow {
  return { label: '', labelEn: '', price: '' };
}

export function AdminServiceOptionsEditor({ rows, onChange }: Props) {
  const [englishTouchedRows, setEnglishTouchedRows] = useState<Set<number>>(() => new Set());
  const lookupTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lookupGeneration = useRef<Record<number, number>>({});

  useEffect(() => {
    return () => {
      Object.values(lookupTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

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

  function applySuggestedEnglish(index: number, label: string, suggested: string) {
    if (!suggested || englishTouchedRows.has(index)) return;
    const current = rows[index];
    if (!current) return;
    const next = suggestEnglishUnlessTouched(label, suggested, false);
    if (next !== current.labelEn) {
      updateRow(index, { labelEn: next });
    }
  }

  function queueEnglishLookup(index: number, label: string) {
    if (englishTouchedRows.has(index)) return;

    const trimmed = String(label || '').trim();
    clearTimeout(lookupTimers.current[index]);
    lookupGeneration.current[index] = (lookupGeneration.current[index] || 0) + 1;
    const generation = lookupGeneration.current[index];

    if (!trimmed) return;

    lookupTimers.current[index] = setTimeout(() => {
      void fetchEnglishLabelSuggestion(trimmed, 'option').then((suggested) => {
        if (lookupGeneration.current[index] !== generation) return;
        applySuggestedEnglish(index, trimmed, suggested);
      });
    }, 450);
  }

  function syncEnglish(index: number, label: string, currentEnglish: string, force = false) {
    const trimmed = String(currentEnglish || '').trim();
    const local = getLocalEnglishLabel(label);

    if (force && !trimmed && local) {
      updateRow(index, { labelEn: local });
    }

    if (!englishTouchedRows.has(index) && local) {
      applySuggestedEnglish(index, label, local);
    }

    queueEnglishLookup(index, label);
  }

  return (
    <div className="admin-service-options-editor">
      <div className="admin-service-options-editor__head">
        <span>子方案與金額</span>
        <p className="admin-muted">
          輸入中文方案名稱會自動帶入自然英文（優先攝影業慣用語；可選 DeepL 美式英文）。手動修改英文後將不再覆寫。
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
                  onBlur={() => syncEnglish(index, row.label, row.labelEn, true)}
                  onChange={(e) => {
                    const nextLabel = e.target.value;
                    const local = getLocalEnglishLabel(nextLabel);
                    updateRow(index, {
                      label: nextLabel,
                      labelEn: englishTouchedRows.has(index)
                        ? row.labelEn
                        : local || row.labelEn,
                    });
                    queueEnglishLookup(index, nextLabel);
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
                  placeholder="Half-Length Portraits"
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
