'use client';

import { useMemo, useState } from 'react';
import type { AdminServiceRow } from '@/lib/admin/settings';
import type {
  AdminPromotionRow,
  PromotionRuleType,
  PromotionTarget,
} from '@/lib/admin/promotions';
import { describePromotionRule } from '@/lib/admin/promotions';

type TargetSelection = Record<string, string[]>;

type PromotionFormState = {
  name: string;
  description: string;
  ruleType: PromotionRuleType;
  basePeople: string;
  perExtra: string;
  groupPay: string;
  groupFree: string;
  fixedAmount: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  targets: TargetSelection;
};

function emptyForm(): PromotionFormState {
  return {
    name: '',
    description: '',
    ruleType: 'per_extra',
    basePeople: '4',
    perExtra: '200',
    groupPay: '4',
    groupFree: '1',
    fixedAmount: '',
    startsAt: '',
    endsAt: '',
    active: true,
    targets: {},
  };
}

function targetsFromPromotion(promotion: AdminPromotionRow): TargetSelection {
  const map: TargetSelection = {};
  promotion.targets.forEach((target) => {
    map[target.serviceId] = [...target.optionLabels];
  });
  return map;
}

function buildTargets(selection: TargetSelection): PromotionTarget[] {
  return Object.entries(selection)
    .filter(([, labels]) => labels)
    .map(([serviceId, optionLabels]) => ({ serviceId, optionLabels }));
}

function formatTargetSummary(
  promotion: AdminPromotionRow,
  services: AdminServiceRow[],
): string {
  if (!promotion.targets.length) return '未指定方案';
  return promotion.targets
    .map((target) => {
      const service = services.find((item) => item.id === target.serviceId);
      const serviceName = service?.name || '未知服務';
      if (!target.optionLabels.length) return `${serviceName}（全部方案）`;
      return `${serviceName}：${target.optionLabels.join('、')}`;
    })
    .join('；');
}

function formatDateRange(startsAt: string, endsAt: string): string {
  if (startsAt && endsAt) return `${startsAt} ~ ${endsAt}`;
  if (startsAt) return `${startsAt} 起`;
  if (endsAt) return `至 ${endsAt}`;
  return '不限期間';
}

function buildRuleConfig(form: PromotionFormState) {
  if (form.ruleType === 'fixed') {
    return { amount: parseInt(form.fixedAmount, 10) || 0 };
  }
  if (form.ruleType === 'group_free') {
    return {
      groupPay: parseInt(form.groupPay, 10) || 0,
      groupFree: parseInt(form.groupFree, 10) || 0,
    };
  }
  return {
    basePeople: parseInt(form.basePeople, 10) || 0,
    perExtra: parseInt(form.perExtra, 10) || 0,
  };
}

type AdminPromotionsSectionProps = {
  services: AdminServiceRow[];
  promotions: AdminPromotionRow[];
  onReload: () => Promise<void>;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

export function AdminPromotionsSection({
  services,
  promotions,
  onReload,
  onMessage,
  onError,
}: AdminPromotionsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PromotionFormState>(emptyForm);

  const activeServices = useMemo(
    () => services.filter((service) => service.active),
    [services],
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(promotion: AdminPromotionRow) {
    setEditingId(promotion.id);
    setForm({
      name: promotion.name,
      description: promotion.description,
      ruleType: promotion.ruleType,
      basePeople: String(promotion.ruleConfig.basePeople ?? 4),
      perExtra: String(promotion.ruleConfig.perExtra ?? 0),
      groupPay: String(promotion.ruleConfig.groupPay ?? 4),
      groupFree: String(promotion.ruleConfig.groupFree ?? 1),
      fixedAmount: String(promotion.ruleConfig.amount ?? ''),
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      active: promotion.active,
      targets: targetsFromPromotion(promotion),
    });
    setShowForm(true);
  }

  function toggleTarget(serviceId: string, optionLabel: string | null, checked: boolean) {
    setForm((prev) => {
      const next = { ...prev.targets };
      const current = new Set(next[serviceId] ?? []);
      if (optionLabel === null) {
        if (checked) {
          next[serviceId] = [];
        } else {
          delete next[serviceId];
        }
        return { ...prev, targets: next };
      }
      if (checked) current.add(optionLabel);
      else current.delete(optionLabel);
      next[serviceId] = Array.from(current);
      if (!next[serviceId].length) delete next[serviceId];
      return { ...prev, targets: next };
    });
  }

  function isAllOptionsSelected(serviceId: string): boolean {
    return Object.prototype.hasOwnProperty.call(form.targets, serviceId);
  }

  function isOptionSelected(serviceId: string, optionLabel: string): boolean {
    const labels = form.targets[serviceId];
    if (!labels) return false;
    if (!labels.length) return false;
    return labels.includes(optionLabel);
  }

  async function savePromotion() {
    setSubmitting(true);
    onError('');
    try {
      const payload = {
        name: form.name,
        description: form.description,
        ruleType: form.ruleType,
        ruleConfig: buildRuleConfig(form),
        targets: buildTargets(form.targets),
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        active: form.active,
      };
      const res = await fetch(
        editingId ? `/api/admin/settings/promotions/${editingId}` : '/api/admin/settings/promotions',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      onMessage(data.message || '已儲存優惠活動');
      setShowForm(false);
      setEditingId(null);
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePromotion(promotion: AdminPromotionRow) {
    setSubmitting(true);
    onError('');
    try {
      const res = await fetch(`/api/admin/settings/promotions/${promotion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', active: !promotion.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      onMessage(data.message || '已更新狀態');
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePromotion(promotion: AdminPromotionRow) {
    if (!window.confirm(`確定刪除優惠活動「${promotion.name}」？`)) return;
    setSubmitting(true);
    onError('');
    try {
      const res = await fetch(`/api/admin/settings/promotions/${promotion.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      onMessage(data.message || '已刪除');
      await onReload();
    } catch (err) {
      onError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-form-box">
      <p className="admin-muted">
        設定檔期限間的優惠活動，並指定適用服務與方案。開啟預約單時會自動帶入符合條件的折扣規則。
      </p>

      <div className="admin-promotion-list">
        {promotions.length ? (
          promotions.map((promotion) => (
            <article
              key={promotion.id}
              className={['admin-promotion-item', promotion.active ? '' : 'inactive'].filter(Boolean).join(' ')}
            >
              <div className="admin-promotion-item-body">
                <strong>{promotion.name}</strong>
                {promotion.description ? <p>{promotion.description}</p> : null}
                <p className="admin-muted">
                  {describePromotionRule(promotion)} · {formatDateRange(promotion.startsAt, promotion.endsAt)}
                </p>
                <p className="admin-muted">適用：{formatTargetSummary(promotion, services)}</p>
              </div>
              <div className="admin-promotion-item-actions">
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={submitting}
                  onClick={() => openEdit(promotion)}
                >
                  編輯
                </button>
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={submitting}
                  onClick={() => togglePromotion(promotion)}
                >
                  {promotion.active ? '停用' : '啟用'}
                </button>
                <button
                  type="button"
                  className="admin-button reject"
                  disabled={submitting}
                  onClick={() => deletePromotion(promotion)}
                >
                  刪除
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="admin-muted">尚無優惠活動。可先新增一筆，例如「全家福滿 4 送 1」。</p>
        )}
      </div>

      {!showForm ? (
        <button type="button" className="admin-button" onClick={openCreate}>
          新增優惠活動
        </button>
      ) : (
        <div className="admin-promotion-form">
          <h3>{editingId ? '編輯優惠活動' : '新增優惠活動'}</h3>
          <div className="admin-grid-2">
            <label className="admin-field admin-field--full">
              <span>活動名稱</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例：春季全家福優惠"
                required
              />
            </label>
            <label className="admin-field admin-field--full">
              <span>說明（選填）</span>
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="內部備註，例如僅限週末"
              />
            </label>
            <label className="admin-field">
              <span>折扣類型</span>
              <select
                value={form.ruleType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ruleType: e.target.value as PromotionRuleType }))
                }
              >
                <option value="per_extra">超過人數，每人減額</option>
                <option value="group_free">滿人送人（買 N 送 M）</option>
                <option value="fixed">固定折抵金額</option>
              </select>
            </label>
            <label className="admin-field">
              <span>狀態</span>
              <select
                value={form.active ? 'on' : 'off'}
                onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === 'on' }))}
              >
                <option value="on">啟用</option>
                <option value="off">停用</option>
              </select>
            </label>

            {form.ruleType === 'per_extra' ? (
              <>
                <label className="admin-field">
                  <span>含在方案內人數</span>
                  <input
                    type="number"
                    min={0}
                    value={form.basePeople}
                    onChange={(e) => setForm((prev) => ({ ...prev, basePeople: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  <span>每多 1 人減（元）</span>
                  <input
                    type="number"
                    min={0}
                    value={form.perExtra}
                    onChange={(e) => setForm((prev) => ({ ...prev, perExtra: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {form.ruleType === 'group_free' ? (
              <>
                <label className="admin-field">
                  <span>每滿幾人（付費）</span>
                  <input
                    type="number"
                    min={1}
                    value={form.groupPay}
                    onChange={(e) => setForm((prev) => ({ ...prev, groupPay: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  <span>送幾人</span>
                  <input
                    type="number"
                    min={1}
                    value={form.groupFree}
                    onChange={(e) => setForm((prev) => ({ ...prev, groupFree: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {form.ruleType === 'fixed' ? (
              <label className="admin-field">
                <span>固定折抵（元）</span>
                <input
                  type="number"
                  min={1}
                  value={form.fixedAmount}
                  onChange={(e) => setForm((prev) => ({ ...prev, fixedAmount: e.target.value }))}
                />
              </label>
            ) : null}

            <label className="admin-field">
              <span>開始日期（選填）</span>
              <input
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
              />
            </label>
            <label className="admin-field">
              <span>結束日期（選填）</span>
              <input
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
              />
            </label>
          </div>

          <div className="admin-promotion-targets">
            <strong>適用方案</strong>
            <p className="admin-muted">勾選「全部方案」表示該服務的所有方案皆適用；有子方案時也可只勾特定方案。</p>
            {activeServices.map((service) => (
              <div key={service.id} className="admin-promotion-target-group">
                <label className="admin-promotion-target-all">
                  <input
                    type="checkbox"
                    checked={isAllOptionsSelected(service.id)}
                    onChange={(e) => toggleTarget(service.id, null, e.target.checked)}
                  />
                  <span>{service.name}（全部方案）</span>
                </label>
                {service.options.length ? (
                  <div className="admin-promotion-target-options">
                    {service.options.map((option) => (
                      <label key={`${service.id}-${option.label}`} className="admin-promotion-target-option">
                        <input
                          type="checkbox"
                          checked={isOptionSelected(service.id, option.label)}
                          disabled={isAllOptionsSelected(service.id)}
                          onChange={(e) => toggleTarget(service.id, option.label, e.target.checked)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="admin-promotion-form-actions">
            <button type="button" className="admin-button" disabled={submitting} onClick={savePromotion}>
              {editingId ? '儲存變更' : '新增活動'}
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
      )}
    </div>
  );
}
