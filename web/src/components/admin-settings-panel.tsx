'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { AdminServiceOptionsEditor } from '@/components/admin-service-options-editor';
import type { AdminServiceRow, AdminSettingsData, ServiceOptionFormRow } from '@/lib/admin/settings';
import { formRowsToOptionsText, serviceOptionsToFormRows } from '@/lib/admin/settings';
import { autoFillGenderOptionsText, suggestEnglishUnlessTouched } from '@/lib/admin/chinese-english-label';
import {
  fetchEnglishLabelSuggestion,
  getLocalEnglishLabel,
} from '@/lib/admin/chinese-english-label-client';
import { reorderListById } from '@/lib/admin/reorder-list';

type ConfigTab = 'shop' | 'booking' | 'form' | 'services' | 'security';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function formatServicePrice(price: number | null): string {
  return price && price > 0 ? String(price) : '';
}

function validateServiceOptionRows(rows: ServiceOptionFormRow[]): string {
  const filled = rows.filter((row) => row.label.trim());
  if (!filled.length) return '';
  const missing = filled.filter((row) => {
    const price = parseInt(row.price, 10);
    return !Number.isFinite(price) || price <= 0;
  });
  if (!missing.length) return '';
  return `請為方案「${missing.map((row) => row.label.trim()).join('、')}」填寫金額`;
}

export function AdminSettingsPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<ConfigTab>('shop');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [shopName, setShopName] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  const [openDays, setOpenDays] = useState<number[]>([]);
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [maxPerSlot, setMaxPerSlot] = useState(1);
  const [minDaysAhead, setMinDaysAhead] = useState(0);
  const [maxDaysAhead, setMaxDaysAhead] = useState(60);
  const [headcountOptions, setHeadcountOptions] = useState('');
  const [genderOptions, setGenderOptions] = useState('');
  const [services, setServices] = useState<AdminServiceRow[]>([]);

  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceNameEn, setNewServiceNameEn] = useState('');
  const [newServiceBasePrice, setNewServiceBasePrice] = useState('');
  const [newServiceOptionRows, setNewServiceOptionRows] = useState<ServiceOptionFormRow[]>([]);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceNameEn, setEditServiceNameEn] = useState('');
  const [editServiceBasePrice, setEditServiceBasePrice] = useState('');
  const [editServiceOptionRows, setEditServiceOptionRows] = useState<ServiceOptionFormRow[]>([]);
  const [editServiceNameEnTouched, setEditServiceNameEnTouched] = useState(false);
  const [newServiceNameEnTouched, setNewServiceNameEnTouched] = useState(false);
  const [draggingServiceId, setDraggingServiceId] = useState<string | null>(null);
  const [dragOverServiceId, setDragOverServiceId] = useState<string | null>(null);
  const [reorderingServices, setReorderingServices] = useState(false);
  const serviceNameLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editServiceLookupGen = useRef(0);
  const newServiceLookupGen = useRef(0);
  const [recoveryConfigured, setRecoveryConfigured] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');

  const applySettings = useCallback((settings: AdminSettingsData) => {
    setShopName(settings.shopName);
    setShopEmail(settings.shopEmail);
    setOpenDays(settings.openDays);
    setOpenTime(settings.openTime);
    setCloseTime(settings.closeTime);
    setSlotMinutes(settings.slotMinutes);
    setMaxPerSlot(settings.maxPerSlot);
    setMinDaysAhead(settings.minDaysAhead);
    setMaxDaysAhead(settings.maxDaysAhead);
    setHeadcountOptions(settings.headcountOptions);
    setGenderOptions(settings.genderOptions);
    setServices(settings.services);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (res.status === 401) {
      router.replace('/admin');
      return;
    }
    if (res.status === 400 && String(data.error || '').includes('主控')) {
      router.replace('/admin/dashboard');
      return;
    }
    if (!res.ok) throw new Error(data.error || '無法載入設定');
    applySettings(data.settings);
  }, [applySettings, router]);

  useEffect(() => {
    loadSettings()
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
    fetch('/api/admin/recovery/setup')
      .then(async (res) => res.json())
      .then((data) => setRecoveryConfigured(Boolean(data.configured)))
      .catch(() => {});
  }, [loadSettings]);

  useEffect(() => {
    return () => {
      if (serviceNameLookupTimer.current) clearTimeout(serviceNameLookupTimer.current);
    };
  }, []);

  function queueServiceNameLookup(
    chinese: string,
    mode: 'edit' | 'new',
    englishTouched: boolean,
  ) {
    if (englishTouched) return;
    const trimmed = String(chinese || '').trim();
    if (!trimmed) return;

    if (serviceNameLookupTimer.current) clearTimeout(serviceNameLookupTimer.current);
    const generationRef = mode === 'edit' ? editServiceLookupGen : newServiceLookupGen;
    generationRef.current += 1;
    const generation = generationRef.current;

    serviceNameLookupTimer.current = setTimeout(() => {
      void fetchEnglishLabelSuggestion(trimmed, 'service').then((suggested) => {
        if (generationRef.current !== generation || !suggested) return;
        if (mode === 'edit') {
          setEditServiceNameEn((prev) => suggestEnglishUnlessTouched(trimmed, suggested, false));
        } else {
          setNewServiceNameEn((prev) => suggestEnglishUnlessTouched(trimmed, suggested, false));
        }
      });
    }, 450);
  }

  function handleServiceNameChange(
    nextName: string,
    mode: 'edit' | 'new',
    englishTouched: boolean,
  ) {
    const local = getLocalEnglishLabel(nextName);
    if (mode === 'edit') {
      setEditServiceName(nextName);
      setEditServiceNameEn((prev) =>
        englishTouched ? prev : local || suggestEnglishUnlessTouched(nextName, prev, false),
      );
      queueServiceNameLookup(nextName, 'edit', englishTouched);
      return;
    }

    setNewServiceName(nextName);
    setNewServiceNameEn((prev) =>
      englishTouched ? prev : local || suggestEnglishUnlessTouched(nextName, prev, false),
    );
    queueServiceNameLookup(nextName, 'new', englishTouched);
  }

  async function hydrateServiceEnglishOnEdit(
    name: string,
    nameEn: string,
    optionRows: ServiceOptionFormRow[],
  ) {
    const localName = getLocalEnglishLabel(name);
    setEditServiceName(name);
    setEditServiceNameEn(nameEn || localName || '');
    setEditServiceNameEnTouched(false);
    setEditServiceOptionRows(
      optionRows.map((row) => ({
        ...row,
        labelEn: row.labelEn.trim() || getLocalEnglishLabel(row.label) || '',
      })),
    );

    const [nameSuggestion, ...optionSuggestions] = await Promise.all([
      nameEn ? Promise.resolve('') : fetchEnglishLabelSuggestion(name, 'service'),
      ...optionRows.map((row) =>
        row.labelEn.trim()
          ? Promise.resolve('')
          : fetchEnglishLabelSuggestion(row.label, 'option'),
      ),
    ]);

    if (nameSuggestion) {
      setEditServiceNameEn((prev) => prev || nameSuggestion);
    }

    if (optionSuggestions.some(Boolean)) {
      setEditServiceOptionRows((prev) =>
        prev.map((row, index) => ({
          ...row,
          labelEn: row.labelEn.trim() || optionSuggestions[index] || row.labelEn,
        })),
      );
    }
  }

  function toggleOpenDay(day: number) {
    setOpenDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function saveSection(section: ConfigTab, payload: Record<string, unknown>) {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setMessage(data.message || '已儲存');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRecoveryKey(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/recovery/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryKey, confirmKey: recoveryConfirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '設定失敗');
      setMessage(data.message || '已設定復原金鑰');
      setRecoveryConfigured(true);
      setRecoveryKey('');
      setRecoveryConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function addService() {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const optionError = validateServiceOptionRows(newServiceOptionRows);
      if (optionError) throw new Error(optionError);
      if (!newServiceOptionRows.length && !newServiceBasePrice.trim()) {
        throw new Error('請填寫服務金額，或新增至少一個子方案並填寫金額');
      }
      const res = await fetch('/api/admin/settings/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newServiceName,
          nameEn: newServiceNameEn,
          basePrice: newServiceBasePrice,
          optionsText: formRowsToOptionsText(newServiceOptionRows),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '新增失敗');
      setMessage(data.message || '已新增');
      setNewServiceName('');
      setNewServiceNameEn('');
      setNewServiceNameEnTouched(false);
      setNewServiceBasePrice('');
      setNewServiceOptionRows([]);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleService(id: string, active: boolean) {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/settings/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      setMessage(data.message || '已更新');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveServiceEdit(id: string) {
    setSubmitting(true);
    setError('');
    try {
      const optionError = validateServiceOptionRows(editServiceOptionRows);
      if (optionError) throw new Error(optionError);
      if (!editServiceOptionRows.length && !editServiceBasePrice.trim()) {
        throw new Error('請填寫服務金額，或保留至少一個子方案並填寫金額');
      }
      const res = await fetch(`/api/admin/settings/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editServiceName,
          nameEn: editServiceNameEn,
          basePrice: editServiceBasePrice,
          optionsText: formRowsToOptionsText(editServiceOptionRows),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      setMessage(data.message || '已更新');
      setEditingServiceId(null);
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeService(id: string, name: string) {
    if (!window.confirm(`確定刪除服務「${name}」？`)) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/settings/services/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setMessage(data.message || '已刪除');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function persistServiceOrder(nextServices: AdminServiceRow[]) {
    const previous = services;
    setServices(nextServices);
    setReorderingServices(true);
    setError('');
    try {
      const res = await fetch('/api/admin/settings/services/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: nextServices.map((service) => service.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '排序儲存失敗');
      setMessage(data.message || '服務排序已更新');
    } catch (err) {
      setServices(previous);
      setError(err instanceof Error ? err.message : '排序儲存失敗');
    } finally {
      setReorderingServices(false);
    }
  }

  function handleServiceDrop(targetId: string, sourceId: string | null) {
    if (!sourceId || sourceId === targetId || editingServiceId) return;
    const next = reorderListById(services, sourceId, targetId);
    if (next === services) return;
    void persistServiceOrder(next);
  }

  const canReorderServices =
    services.length > 1 && !editingServiceId && !submitting && !reorderingServices;

  if (loading) {
    return (
      <AdminShell>
        <div className="admin-card">載入中…</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell onRefresh={() => loadSettings().catch((err) => setError(err.message))}>
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}

      <div className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>系統設定</h2>
            <p className="admin-muted">僅主控可修改。變更後客人重新整理預約頁即可看到。</p>
          </div>
        </div>

        <nav className="admin-config-nav">
          {(
            [
              ['shop', '店家資訊'],
              ['booking', '預約規則'],
              ['form', '表單選項'],
              ['services', '服務項目'],
              ['security', '安全復原'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={['admin-config-tab', tab === key ? 'active' : ''].join(' ')}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'shop' ? (
          <form
            className="admin-form admin-form-box"
            onSubmit={(e) => {
              e.preventDefault();
              saveSection('shop', { shopName, shopEmail });
            }}
          >
            <p className="admin-muted">店名顯示在預約頁；通知信箱為系統寄信收件。</p>
            <label className="admin-field">
              <span>店名</span>
              <input value={shopName} onChange={(e) => setShopName(e.target.value)} required />
            </label>
            <label className="admin-field">
              <span>通知信箱</span>
              <input
                type="email"
                value={shopEmail}
                onChange={(e) => setShopEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="admin-button" disabled={submitting}>
              儲存
            </button>
          </form>
        ) : null}

        {tab === 'booking' ? (
          <form
            className="admin-form admin-form-box"
            onSubmit={(e) => {
              e.preventDefault();
              saveSection('booking', {
                openDays,
                openTime,
                closeTime,
                slotMinutes,
                maxPerSlot,
                minDaysAhead,
                maxDaysAhead,
              });
            }}
          >
            <p className="admin-muted">營業日、時間、時段間隔與可預約天數。</p>
            <div className="admin-field">
              <span>營業日（未選＝店休）</span>
              <div className="admin-day-picks">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    className={['admin-day-pick', openDays.includes(day) ? 'on' : ''].join(' ')}
                    onClick={() => toggleOpenDay(day)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-grid-2">
              <label className="admin-field">
                <span>開始時間</span>
                <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} required />
              </label>
              <label className="admin-field">
                <span>結束時間</span>
                <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} required />
              </label>
              <label className="admin-field">
                <span>每格（分鐘）</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={slotMinutes}
                  onChange={(e) => setSlotMinutes(Number(e.target.value))}
                  required
                />
              </label>
              <label className="admin-field">
                <span>同時段名額</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxPerSlot}
                  onChange={(e) => setMaxPerSlot(Number(e.target.value))}
                  required
                />
              </label>
              <label className="admin-field">
                <span>最早可約（天）</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={minDaysAhead}
                  onChange={(e) => setMinDaysAhead(Number(e.target.value))}
                  required
                />
              </label>
              <label className="admin-field">
                <span>最遠可約（天）</span>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={maxDaysAhead}
                  onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
                  required
                />
              </label>
            </div>
            <button type="submit" className="admin-button" disabled={submitting}>
              儲存
            </button>
          </form>
        ) : null}

        {tab === 'form' ? (
          <form
            className="admin-form admin-form-box"
            onSubmit={(e) => {
              e.preventDefault();
              saveSection('form', { headcountOptions, genderOptions });
            }}
          >
            <label className="admin-field">
              <span>人數選項</span>
              <input
                value={headcountOptions}
                onChange={(e) => setHeadcountOptions(e.target.value)}
                placeholder="例：1,2,3,4"
                required
              />
            </label>
            <label className="admin-field">
              <span>性別選項</span>
              <textarea
                value={genderOptions}
                onChange={(e) => setGenderOptions(autoFillGenderOptionsText(e.target.value))}
                placeholder="一行一個，例：男|Male"
                required
              />
            </label>
            <button type="submit" className="admin-button" disabled={submitting}>
              儲存
            </button>
          </form>
        ) : null}

        {tab === 'services' ? (
          <div className="admin-form-box">
            <p className="admin-muted">
              管理客人可選的服務項目。{canReorderServices ? '拖曳左側把手可調整顯示順序。' : ''}
            </p>
            <div className="admin-service-list">
              {services.map((service) => (
                <article
                  key={service.id}
                  className={[
                    'admin-service-item',
                    service.active ? '' : 'inactive',
                    draggingServiceId === service.id ? 'is-dragging' : '',
                    dragOverServiceId === service.id ? 'is-drag-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={(event) => {
                    if (!canReorderServices || !draggingServiceId || draggingServiceId === service.id) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverServiceId(service.id);
                  }}
                  onDragLeave={(event) => {
                    const related = event.relatedTarget as Node | null;
                    if (related && event.currentTarget.contains(related)) return;
                    if (dragOverServiceId === service.id) setDragOverServiceId(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId =
                      event.dataTransfer.getData('text/plain') || draggingServiceId || '';
                    handleServiceDrop(service.id, sourceId);
                    setDraggingServiceId(null);
                    setDragOverServiceId(null);
                  }}
                >
                  {editingServiceId !== service.id && canReorderServices ? (
                    <button
                      type="button"
                      className="admin-service-drag-handle"
                      draggable
                      aria-label={`拖曳調整「${service.name}」順序`}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', service.id);
                        setDraggingServiceId(service.id);
                      }}
                      onDragEnd={() => {
                        setDraggingServiceId(null);
                        setDragOverServiceId(null);
                      }}
                    >
                      <span aria-hidden="true">⋮⋮</span>
                    </button>
                  ) : null}
                  <div className="admin-service-item__body">
                  {editingServiceId === service.id ? (
                    <div className="admin-form">
                      <label className="admin-field">
                        <span>服務名稱</span>
                        <input
                          value={editServiceName}
                          onFocus={() => {
                            if (!editServiceNameEn.trim()) {
                              const local = getLocalEnglishLabel(editServiceName);
                              if (local) setEditServiceNameEn(local);
                            }
                            queueServiceNameLookup(editServiceName, 'edit', editServiceNameEnTouched);
                          }}
                          onChange={(e) =>
                            handleServiceNameChange(e.target.value, 'edit', editServiceNameEnTouched)
                          }
                          onBlur={() => {
                            if (!editServiceNameEn.trim()) {
                              void fetchEnglishLabelSuggestion(editServiceName, 'service').then(
                                (suggested) => {
                                  if (suggested) setEditServiceNameEn(suggested);
                                },
                              );
                            }
                          }}
                          required
                        />
                      </label>
                      <label className="admin-field">
                        <span>英文名稱</span>
                        <input
                          value={editServiceNameEn}
                          onChange={(e) => {
                            setEditServiceNameEnTouched(true);
                            setEditServiceNameEn(e.target.value);
                          }}
                        />
                      </label>
                      <label className="admin-field">
                        <span>服務金額（新台幣）</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={editServiceBasePrice}
                          onChange={(e) => setEditServiceBasePrice(e.target.value)}
                          placeholder={editServiceOptionRows.length ? '僅無子方案時使用' : '例：800'}
                          disabled={editServiceOptionRows.length > 0}
                        />
                      </label>
                      <AdminServiceOptionsEditor
                        rows={editServiceOptionRows}
                        onChange={(rows) => {
                          setEditServiceOptionRows(rows);
                          if (rows.length) setEditServiceBasePrice('');
                        }}
                      />
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-button"
                          disabled={submitting}
                          onClick={() => saveServiceEdit(service.id)}
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          className="admin-button secondary"
                          onClick={() => setEditingServiceId(null)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="admin-service-item-head">
                        <strong>
                          {service.name}
                          {service.name_en ? ` ${service.name_en}` : ''}
                        </strong>
                        <span className={service.active ? 'admin-badge active' : 'admin-badge inactive'}>
                          {service.active ? '上架中' : '已下架'}
                        </span>
                      </div>
                      {service.options.length ? (
                        <p className="admin-muted admin-service-options">
                          方案：{service.options.map((opt) => {
                            const price = opt.price ? `（$${opt.price}）` : '';
                            return `${opt.label}${price}`;
                          }).join('、')}
                        </p>
                      ) : service.base_price ? (
                        <p className="admin-muted">金額：${service.base_price}</p>
                      ) : (
                        <p className="admin-muted">無子方案</p>
                      )}
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-action neutral"
                          disabled={submitting}
                          onClick={() => {
                            setEditingServiceId(service.id);
                            setEditServiceBasePrice(
                              service.options.length ? '' : formatServicePrice(service.base_price),
                            );
                            void hydrateServiceEnglishOnEdit(
                              service.name,
                              service.name_en,
                              serviceOptionsToFormRows(service.options),
                            );
                          }}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className="admin-action neutral"
                          disabled={submitting}
                          onClick={() => toggleService(service.id, !service.active)}
                        >
                          {service.active ? '下架' : '上架'}
                        </button>
                        <button
                          type="button"
                          className="admin-action reject"
                          disabled={submitting}
                          onClick={() => removeService(service.id, service.name)}
                        >
                          刪除
                        </button>
                      </div>
                    </>
                  )}
                  </div>
                </article>
              ))}
            </div>

            <form
              className="admin-form admin-edit-box"
              onSubmit={(e) => {
                e.preventDefault();
                addService();
              }}
            >
              <h3>新增服務</h3>
              <div className="admin-grid-2">
                <label className="admin-field">
                  <span>服務名稱</span>
                  <input
                    value={newServiceName}
                    onFocus={() => {
                      if (!newServiceNameEn.trim()) {
                        const local = getLocalEnglishLabel(newServiceName);
                        if (local) setNewServiceNameEn(local);
                      }
                      queueServiceNameLookup(newServiceName, 'new', newServiceNameEnTouched);
                    }}
                    onChange={(e) =>
                      handleServiceNameChange(e.target.value, 'new', newServiceNameEnTouched)
                    }
                    onBlur={() => {
                      if (!newServiceNameEn.trim()) {
                        void fetchEnglishLabelSuggestion(newServiceName, 'service').then(
                          (suggested) => {
                            if (suggested) setNewServiceNameEn(suggested);
                          },
                        );
                      }
                    }}
                    placeholder="如：證件照"
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>英文名稱（選填）</span>
                  <input
                    value={newServiceNameEn}
                    onChange={(e) => {
                      setNewServiceNameEnTouched(true);
                      setNewServiceNameEn(e.target.value);
                    }}
                    placeholder="ID Photo"
                  />
                </label>
              </div>
              <label className="admin-field">
                <span>服務金額（新台幣，選填）</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newServiceBasePrice}
                  onChange={(e) => setNewServiceBasePrice(e.target.value)}
                  placeholder={newServiceOptionRows.length ? '僅無子方案時使用' : '例：800'}
                  disabled={newServiceOptionRows.length > 0}
                />
              </label>
              <AdminServiceOptionsEditor
                rows={newServiceOptionRows}
                onChange={(rows) => {
                  setNewServiceOptionRows(rows);
                  if (rows.length) setNewServiceBasePrice('');
                }}
              />
              <button type="submit" className="admin-button" disabled={submitting}>
                新增服務
              </button>
            </form>
          </div>
        ) : null}

        {tab === 'security' ? (
          <form className="admin-form admin-form-box" onSubmit={saveRecoveryKey}>
            <h3>主控復原金鑰</h3>
            <p className="admin-muted">
              離線妥善保存此金鑰。主控忘記密碼時，可在登入頁使用「復原金鑰」重設。
              {recoveryConfigured ? '（已設定）' : '（尚未設定）'}
            </p>
            <label className="admin-field">
              <span>復原金鑰</span>
              <input
                type="password"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="至少 16 字"
                required
              />
            </label>
            <label className="admin-field">
              <span>確認復原金鑰</span>
              <input
                type="password"
                value={recoveryConfirm}
                onChange={(e) => setRecoveryConfirm(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="admin-button" disabled={submitting}>
              儲存復原金鑰
            </button>
          </form>
        ) : null}
      </div>
    </AdminShell>
  );
}
