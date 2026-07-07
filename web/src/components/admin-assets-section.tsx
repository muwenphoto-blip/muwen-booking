'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/admin/finance';
import type { AdminAssetWithMetrics } from '@/lib/admin/assets';

type AssetFormState = {
  name: string;
  purchaseDate: string;
  purchasePrice: string;
  marketPrice: string;
  lifeSpanMonths: string;
  expectedCasesPerMonth: string;
  notes: string;
};

type AssetsSnapshot = {
  monthKey: string;
  casesThisMonth: number;
  assets: AdminAssetWithMetrics[];
  totalMonthlyDepreciation: number;
  totalCurrentValue: number;
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthKeyFromAnchor(anchor: string): string {
  const match = String(anchor || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : todayIso().slice(0, 7);
}

function emptyForm(): AssetFormState {
  return {
    name: '',
    purchaseDate: todayIso(),
    purchasePrice: '',
    marketPrice: '',
    lifeSpanMonths: '36',
    expectedCasesPerMonth: '15',
    notes: '',
  };
}

type AdminAssetsSectionProps = {
  anchor: string;
  onSynced?: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

export function AdminAssetsSection({ anchor, onSynced, onMessage, onError }: AdminAssetsSectionProps) {
  const monthKey = monthKeyFromAnchor(anchor);
  const [snapshot, setSnapshot] = useState<AssetsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetFormState>(emptyForm);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const res = await fetch(`/api/admin/assets?month=${monthKey}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '無法載入器材');
      setSnapshot(data.snapshot);
    } catch (err) {
      onError(err instanceof Error ? err.message : '無法載入器材');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [monthKey, onError]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(asset: AdminAssetWithMetrics) {
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      purchaseDate: asset.purchaseDate,
      purchasePrice: String(asset.purchasePrice),
      marketPrice: asset.marketPrice != null ? String(asset.marketPrice) : '',
      lifeSpanMonths: String(asset.lifeSpanMonths),
      expectedCasesPerMonth: String(asset.expectedCasesPerMonth),
      notes: asset.notes,
    });
    setShowForm(true);
  }

  async function saveAsset() {
    setSubmitting(true);
    onError('');
    try {
      const payload = {
        name: form.name,
        purchaseDate: form.purchaseDate,
        purchasePrice: Number(form.purchasePrice),
        marketPrice: form.marketPrice.trim() ? Number(form.marketPrice) : null,
        lifeSpanMonths: Number(form.lifeSpanMonths),
        expectedCasesPerMonth: Number(form.expectedCasesPerMonth),
        notes: form.notes,
      };
      const res = await fetch(editingId ? `/api/admin/assets/${editingId}` : '/api/admin/assets', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      onMessage(data.message || '已儲存器材');
      setShowForm(false);
      setEditingId(null);
      await loadAssets();
      onSynced?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeAsset(asset: AdminAssetWithMetrics) {
    if (!window.confirm(`確定刪除器材「${asset.name}」？`)) return;
    setSubmitting(true);
    onError('');
    try {
      const res = await fetch(`/api/admin/assets/${asset.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      onMessage(data.message || '已刪除');
      await loadAssets();
      onSynced?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function syncDepreciation() {
    setSubmitting(true);
    onError('');
    try {
      const res = await fetch('/api/admin/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-depreciation', month: monthKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重算失敗');
      onMessage(data.message || '已重算損耗');
      await loadAssets();
      onSynced?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : '重算失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-assets-section">
      <div className="admin-section-head">
        <div>
          <h3>器材管理</h3>
          <p className="admin-muted">
            登錄購入價與市場價，系統依 <strong>{monthKey}</strong> 案量（
            {snapshot?.casesThisMonth ?? '—'} 件）自動計算折舊與本月損耗。
          </p>
        </div>
        <div className="admin-finance-head-actions">
          <button type="button" className="admin-button secondary" disabled={submitting} onClick={syncDepreciation}>
            依案量重算本月損耗
          </button>
          <button type="button" className="admin-button" onClick={openCreate}>
            新增器材
          </button>
        </div>
      </div>

      {snapshot ? (
        <div className="admin-stats admin-finance-stats">
          <div className="admin-stat">
            <span>本月案量</span>
            <strong>{snapshot.casesThisMonth}</strong>
          </div>
          <div className="admin-stat">
            <span>本月器材損耗</span>
            <strong>{formatCurrency(snapshot.totalMonthlyDepreciation)}</strong>
          </div>
          <div className="admin-stat">
            <span>器材估計殘值合計</span>
            <strong>{formatCurrency(snapshot.totalCurrentValue)}</strong>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="admin-finance-form">
          <h4>{editingId ? '編輯器材' : '新增器材'}</h4>
          <div className="admin-grid-2">
            <label className="admin-field">
              <span>器材名稱</span>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>
            <label className="admin-field">
              <span>購入日期</span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm((p) => ({ ...p, purchaseDate: e.target.value }))}
                required
              />
            </label>
            <label className="admin-field">
              <span>購入價格（元）</span>
              <input
                type="number"
                min={0}
                value={form.purchasePrice}
                onChange={(e) => setForm((p) => ({ ...p, purchasePrice: e.target.value }))}
                required
              />
            </label>
            <label className="admin-field">
              <span>目前市場價格（元，選填）</span>
              <input
                type="number"
                min={0}
                value={form.marketPrice}
                onChange={(e) => setForm((p) => ({ ...p, marketPrice: e.target.value }))}
                placeholder="二手行情或估價"
              />
            </label>
            <label className="admin-field">
              <span>預估壽命（月）</span>
              <input
                type="number"
                min={1}
                value={form.lifeSpanMonths}
                onChange={(e) => setForm((p) => ({ ...p, lifeSpanMonths: e.target.value }))}
              />
            </label>
            <label className="admin-field">
              <span>基準月案量（件）</span>
              <input
                type="number"
                min={1}
                value={form.expectedCasesPerMonth}
                onChange={(e) => setForm((p) => ({ ...p, expectedCasesPerMonth: e.target.value }))}
              />
            </label>
            <label className="admin-field admin-field--full">
              <span>備註</span>
              <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
          <p className="admin-muted">
            折舊會隨本月案量調整：案量愈高，本月損耗與累計折舊愈快。基準月案量代表「正常負荷」下的預期拍攝件數。
          </p>
          <div className="admin-finance-form-actions">
            <button type="button" className="admin-button" disabled={submitting} onClick={saveAsset}>
              儲存
            </button>
            <button
              type="button"
              className="admin-button secondary"
              disabled={submitting}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="admin-muted">載入器材中…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-finance-table">
            <thead>
              <tr>
                <th>器材</th>
                <th>購入價</th>
                <th>市場價</th>
                <th>折舊後估計值</th>
                <th>本月損耗</th>
                <th>案量係數</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.assets.length ? (
                snapshot.assets.map((asset) => (
                  <tr key={asset.id} className={asset.active ? '' : 'inactive-row'}>
                    <td>
                      <strong>{asset.name}</strong>
                      {!asset.active ? <span className="admin-muted">（停用）</span> : null}
                    </td>
                    <td>{formatCurrency(asset.purchasePrice)}</td>
                    <td>{asset.marketPrice != null ? formatCurrency(asset.marketPrice) : '—'}</td>
                    <td>
                      {formatCurrency(asset.metrics.estimatedValue)}
                      <span className="admin-muted"> / 耗損 {asset.metrics.wearPercent}%</span>
                    </td>
                    <td>{formatCurrency(asset.metrics.monthlyDepreciation)}</td>
                    <td>{asset.metrics.utilizationRate}%</td>
                    <td>
                      <div className="admin-inline-actions">
                        <button
                          type="button"
                          className="admin-button secondary"
                          disabled={submitting}
                          onClick={() => openEdit(asset)}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className="admin-button reject"
                          disabled={submitting}
                          onClick={() => removeAsset(asset)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="admin-muted">
                    尚無器材。新增相機、鏡頭、燈具等，系統會依案量自動計入財務流水。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
