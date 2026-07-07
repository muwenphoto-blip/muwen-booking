'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAssetsSection } from '@/components/admin-assets-section';
import { AdminShell } from '@/components/admin-shell';
import {
  EXPENSE_CATEGORIES,
  formatCurrency,
  getFinanceNavigation,
  INCOME_CATEGORIES,
  REFUND_CATEGORIES,
  type FinanceAccountingReport,
  type FinancePeriod,
  type FinanceSummary,
  type FinanceTransactionRow,
  type TransactionType,
} from '@/lib/admin/finance';

type TransactionFormState = {
  transactionDate: string;
  type: TransactionType;
  category: string;
  amount: string;
  caseNumber: string;
  paymentMethod: string;
  receiver: string;
  note: string;
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyForm(): TransactionFormState {
  return {
    transactionDate: todayIso(),
    type: 'expense',
    category: EXPENSE_CATEGORIES[0],
    amount: '',
    caseNumber: '',
    paymentMethod: '',
    receiver: '',
    note: '',
  };
}

function categoriesForType(type: TransactionType): readonly string[] {
  if (type === 'income') return INCOME_CATEGORIES;
  if (type === 'refund') return REFUND_CATEGORIES;
  return EXPENSE_CATEGORIES;
}

function typeLabel(type: TransactionType): string {
  if (type === 'income') return '收入';
  if (type === 'refund') return '退款';
  return '支出';
}

function sourceLabel(source: string): string {
  if (source === 'document_payment') return '預約單收款';
  if (source === 'manual') return '手動';
  return source;
}

export function AdminFinancePanel() {
  const router = useRouter();
  const [period, setPeriod] = useState<FinancePeriod>('month');
  const [anchor, setAnchor] = useState(todayIso());
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [accountingReport, setAccountingReport] = useState<FinanceAccountingReport | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionFormState>(emptyForm);
  const [typeFilter, setTypeFilter] = useState<'' | TransactionType>('');
  const [depreciationInput, setDepreciationInput] = useState('');
  const [view, setView] = useState<'finance' | 'assets'>('finance');

  const navigation = useMemo(() => getFinanceNavigation(period, anchor), [period, anchor]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const summaryParams = new URLSearchParams({ period, anchor });
      const txParams = new URLSearchParams({
        from: navigation.from,
        to: navigation.to,
      });
      if (typeFilter) txParams.set('type', typeFilter);

      const [summaryRes, txRes, reportRes] = await Promise.all([
        fetch(`/api/admin/finance/summary?${summaryParams}`),
        fetch(`/api/admin/finance/transactions?${txParams}`),
        fetch(`/api/admin/finance/report?${summaryParams}`),
      ]);
      const summaryData = await summaryRes.json();
      const txData = await txRes.json();
      const reportData = await reportRes.json();

      if (summaryRes.status === 401 || txRes.status === 401 || reportRes.status === 401) {
        router.replace('/admin');
        return;
      }
      if (!summaryRes.ok) throw new Error(summaryData.error || '無法載入統計');
      if (!txRes.ok) throw new Error(txData.error || '無法載入收支紀錄');
      if (!reportRes.ok) throw new Error(reportData.error || '無法載入會計報表');

      setSummary(summaryData.summary);
      setAccountingReport(reportData.report);
      setTransactions(txData.transactions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
      setSummary(null);
      setAccountingReport(null);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [anchor, navigation.from, navigation.to, period, router, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!accountingReport) return;
    const amount = accountingReport.accounting.equipmentDepreciation;
    setDepreciationInput(amount > 0 ? String(amount) : '');
  }, [accountingReport]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(row: FinanceTransactionRow) {
    setEditingId(row.id);
    setForm({
      transactionDate: row.transactionDate,
      type: row.type,
      category: row.category,
      amount: String(row.amount),
      caseNumber: row.caseNumber,
      paymentMethod: row.paymentMethod,
      receiver: row.receiver,
      note: row.note,
    });
    setShowForm(true);
  }

  async function saveTransaction() {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        transactionDate: form.transactionDate,
        type: form.type,
        category: form.category,
        amount: Number(form.amount),
        caseNumber: form.caseNumber,
        paymentMethod: form.paymentMethod,
        receiver: form.receiver,
        note: form.note,
      };
      const res = await fetch(
        editingId ? `/api/admin/finance/transactions/${editingId}` : '/api/admin/finance/transactions',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setMessage(data.message || '已儲存');
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeTransaction(row: FinanceTransactionRow) {
    if (!window.confirm('確定刪除此筆收支紀錄？')) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/finance/transactions/${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      setMessage(data.message || '已刪除');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function exportReport(kind: 'detail' | 'pl' | 'summary' | 'full' | 'performance') {
    const params = new URLSearchParams({ period, anchor, kind });
    window.location.href = `/api/admin/finance/export?${params}`;
  }

  async function saveDepreciation() {
    if (!accountingReport) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/finance/depreciation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: accountingReport.accounting.monthKey,
          amount: Number(depreciationInput || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setMessage(data.message || '已儲存器材損耗');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function backfillFromBookings() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backfill' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同步失敗');
      setMessage(data.message || '同步完成');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell onRefresh={loadData}>
      <div className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>財務營運</h2>
            <p className="admin-muted">管理收支、器材折舊與週／月／年統計。預約單收款會自動同步。</p>
          </div>
          {view === 'finance' ? (
          <div className="admin-finance-head-actions">
            <button type="button" className="admin-button secondary" disabled={submitting} onClick={backfillFromBookings}>
              同步收款
            </button>
            <button type="button" className="admin-button secondary" onClick={() => exportReport('pl')}>
              損益表
            </button>
            <button type="button" className="admin-button secondary" onClick={() => exportReport('performance')}>
              績效統計
            </button>
            <button type="button" className="admin-button secondary" onClick={() => exportReport('full')}>
              完整報表
            </button>
            <button type="button" className="admin-button" onClick={openCreate}>
              新增收支
            </button>
          </div>
          ) : null}
        </div>

        <nav className="admin-config-nav admin-finance-view-nav">
          <button
            type="button"
            className={['admin-config-tab', view === 'finance' ? 'active' : ''].join(' ')}
            onClick={() => setView('finance')}
          >
            收支報表
          </button>
          <button
            type="button"
            className={['admin-config-tab', view === 'assets' ? 'active' : ''].join(' ')}
            onClick={() => setView('assets')}
          >
            器材管理
          </button>
        </nav>

        {view === 'assets' ? (
          <AdminAssetsSection
            anchor={anchor}
            onSynced={loadData}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {view === 'finance' ? (
          <>
        {error ? <p className="admin-error">{error}</p> : null}
        {message ? <p className="admin-success">{message}</p> : null}

        {accountingReport ? (
          <div
            className={[
              'admin-finance-cashflow-badge',
              accountingReport.accounting.cashFlowDirection === 'positive'
                ? 'positive'
                : accountingReport.accounting.cashFlowDirection === 'negative'
                  ? 'negative'
                  : 'even',
            ].join(' ')}
          >
            <strong>
              {accountingReport.accounting.monthKey} 本月{accountingReport.accounting.cashFlowLabel}
            </strong>
            <span>{formatCurrency(accountingReport.accounting.cashFlow)}</span>
            <em>流水 = 淨利 − 器材損耗</em>
          </div>
        ) : null}

        <div className="admin-finance-period-nav">
          {(
            [
              ['week', '週統計'],
              ['month', '月統計'],
              ['year', '年統計'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={['admin-config-tab', period === key ? 'active' : ''].join(' ')}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
          <div className="admin-finance-range-nav">
            <button type="button" className="admin-button secondary" onClick={() => setAnchor(navigation.prevAnchor)}>
              上一{period === 'week' ? '週' : period === 'month' ? '月' : '年'}
            </button>
            <strong>{summary?.rangeLabel || navigation.label}</strong>
            <button type="button" className="admin-button secondary" onClick={() => setAnchor(navigation.nextAnchor)}>
              下一{period === 'week' ? '週' : period === 'month' ? '月' : '年'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="admin-muted">載入中…</p>
        ) : summary ? (
          <>
            <div className="admin-stats admin-finance-stats">
              <div className="admin-stat">
                <span>收入</span>
                <strong>{formatCurrency(summary.income)}</strong>
              </div>
              <div className="admin-stat">
                <span>支出</span>
                <strong>{formatCurrency(summary.expense)}</strong>
              </div>
              <div className="admin-stat">
                <span>退款</span>
                <strong>{formatCurrency(summary.refund)}</strong>
              </div>
              <div className="admin-stat admin-stat-confirmed">
                <span>淨利</span>
                <strong>{formatCurrency(summary.netProfit)}</strong>
              </div>
              <div
                className={[
                  'admin-stat',
                  accountingReport?.accounting.cashFlowDirection === 'positive'
                    ? 'admin-stat-confirmed'
                    : accountingReport?.accounting.cashFlowDirection === 'negative'
                      ? 'admin-stat-pending'
                      : '',
                ].join(' ')}
              >
                <span>本期流水</span>
                <strong>{formatCurrency(accountingReport?.accounting.cashFlow ?? summary.netProfit)}</strong>
              </div>
              <div className="admin-stat admin-stat-pending">
                <span>折扣成本</span>
                <strong>{formatCurrency(summary.discountCost)}</strong>
              </div>
              <div className="admin-stat">
                <span>交易筆數</span>
                <strong>{summary.transactionCount}</strong>
              </div>
            </div>

            {accountingReport ? (
              <div className="admin-finance-accounting">
                <div className="admin-finance-accounting-head">
                  <h3>會計損益摘要</h3>
                  <button type="button" className="admin-button secondary" onClick={() => exportReport('summary')}>
                    匯出期間統計表
                  </button>
                </div>
                <div className="admin-finance-pl">
                  <div className="admin-finance-equipment-box">
                    <label className="admin-field">
                      <span>本月器材損耗（元）</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={depreciationInput}
                        placeholder="日後依器材價值換算後填入"
                        onChange={(e) => setDepreciationInput(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-button secondary"
                      disabled={submitting || !accountingReport.accounting.monthKey}
                      onClick={saveDepreciation}
                    >
                      儲存損耗
                    </button>
                    <p className="admin-muted">
                      若已登錄器材，請至「器材管理」依案量自動計算；此處可手動覆寫 {accountingReport.accounting.monthKey} 損耗。
                    </p>
                  </div>
                  <div className="admin-finance-pl-row">
                    <span>營業收入（毛額）</span>
                    <strong>{formatCurrency(accountingReport.accounting.grossRevenue)}</strong>
                  </div>
                  <div className="admin-finance-pl-row indent">
                    <span>減：折扣讓利</span>
                    <strong>{formatCurrency(accountingReport.accounting.discountCost)}</strong>
                    <em>{accountingReport.accounting.discountRate}%</em>
                  </div>
                  <div className="admin-finance-pl-row">
                    <span>營業收入（淨額）</span>
                    <strong>{formatCurrency(accountingReport.accounting.netRevenue)}</strong>
                  </div>
                  <div className="admin-finance-pl-row">
                    <span>減：營業費用</span>
                    <strong>{formatCurrency(accountingReport.accounting.totalExpense)}</strong>
                  </div>
                  <div className="admin-finance-pl-row">
                    <span>減：退款</span>
                    <strong>{formatCurrency(accountingReport.accounting.totalRefund)}</strong>
                  </div>
                  <div className="admin-finance-pl-row indent">
                    <span>減：器材損耗</span>
                    <strong>{formatCurrency(accountingReport.accounting.equipmentDepreciation)}</strong>
                  </div>
                  <div className="admin-finance-pl-row total">
                    <span>本期淨利</span>
                    <strong>{formatCurrency(accountingReport.accounting.netProfit)}</strong>
                    <em>淨利率 {accountingReport.accounting.netProfitMargin}%</em>
                  </div>
                  <div
                    className={[
                      'admin-finance-pl-row total cashflow',
                      accountingReport.accounting.cashFlowDirection,
                    ].join(' ')}
                  >
                    <span>本期流水</span>
                    <strong>{formatCurrency(accountingReport.accounting.cashFlow)}</strong>
                    <em>{accountingReport.accounting.cashFlowLabel}</em>
                  </div>
                </div>

                <div className="admin-grid-2 admin-finance-category-grid">
                  <div>
                    <h4>收入科目</h4>
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-finance-table">
                        <thead>
                          <tr>
                            <th>科目</th>
                            <th>金額</th>
                            <th>筆數</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountingReport.incomeCategories.length ? (
                            accountingReport.incomeCategories.map((row) => (
                              <tr key={`income-${row.category}`}>
                                <td>{row.category}</td>
                                <td>{formatCurrency(row.amount)}</td>
                                <td>{row.count}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="admin-muted">
                                尚無收入科目
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h4>費用與退款科目</h4>
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-finance-table">
                        <thead>
                          <tr>
                            <th>科目</th>
                            <th>類型</th>
                            <th>金額</th>
                            <th>筆數</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...accountingReport.expenseCategories, ...accountingReport.refundCategories].length ? (
                            [...accountingReport.expenseCategories, ...accountingReport.refundCategories].map(
                              (row) => (
                                <tr key={`${row.type}-${row.category}`}>
                                  <td>{row.category}</td>
                                  <td>{typeLabel(row.type)}</td>
                                  <td>{formatCurrency(row.amount)}</td>
                                  <td>{row.count}</td>
                                </tr>
                              ),
                            )
                          ) : (
                            <tr>
                              <td colSpan={4} className="admin-muted">
                                尚無費用或退款科目
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {accountingReport?.performance ? (
              <div className="admin-finance-performance">
                <div className="admin-finance-accounting-head">
                  <h3>成員績效統計</h3>
                  <button type="button" className="admin-button secondary" onClick={() => exportReport('performance')}>
                    匯出績效統計表
                  </button>
                </div>
                <p className="admin-muted">
                  依預約單開單資料統計（已接受／已確認／已結案），成員以開單攝影師為主，未填則用負責人員。
                </p>
                <div className="admin-table-wrap">
                  <table className="admin-table admin-finance-table">
                    <thead>
                      <tr>
                        <th>成員</th>
                        <th>案件數</th>
                        <th>服務金額</th>
                        <th>加價購數量</th>
                        <th>加價購金額</th>
                        <th>總收益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountingReport.performance.staff.length ? (
                        accountingReport.performance.staff.map((row) => (
                          <tr key={row.memberName}>
                            <td>{row.memberName}</td>
                            <td>{row.caseCount}</td>
                            <td>{formatCurrency(row.serviceAmount)}</td>
                            <td>{row.addonCount}</td>
                            <td>{formatCurrency(row.addonAmount)}</td>
                            <td>{formatCurrency(row.totalRevenue)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="admin-muted">
                            本期尚無可統計案件
                          </td>
                        </tr>
                      )}
                      <tr className="admin-finance-performance-total">
                        <td>
                          <strong>公司合計</strong>
                        </td>
                        <td>
                          <strong>{accountingReport.performance.company.caseCount}</strong>
                        </td>
                        <td>
                          <strong>{formatCurrency(accountingReport.performance.company.serviceAmount)}</strong>
                        </td>
                        <td>
                          <strong>{accountingReport.performance.company.addonCount}</strong>
                        </td>
                        <td>
                          <strong>{formatCurrency(accountingReport.performance.company.addonAmount)}</strong>
                        </td>
                        <td>
                          <strong>{formatCurrency(accountingReport.performance.company.totalRevenue)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="admin-finance-breakdown">
              <h3>期間明細</h3>
              <div className="admin-table-wrap">
                <table className="admin-table admin-finance-table">
                  <thead>
                    <tr>
                      <th>區間</th>
                      <th>收入</th>
                      <th>支出</th>
                      <th>退款</th>
                      <th>淨利</th>
                      <th>折扣成本</th>
                      <th>筆數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.buckets.map((bucket) => (
                      <tr key={bucket.key}>
                        <td>{bucket.label}</td>
                        <td>{formatCurrency(bucket.income)}</td>
                        <td>{formatCurrency(bucket.expense)}</td>
                        <td>{formatCurrency(bucket.refund)}</td>
                        <td>{formatCurrency(bucket.netProfit)}</td>
                        <td>{formatCurrency(bucket.discountCost)}</td>
                        <td>{bucket.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        <div className="admin-finance-transactions">
          <div className="admin-finance-transactions-head">
            <h3>收支單項</h3>
            <label className="admin-field admin-finance-filter">
              <span>篩選</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as '' | TransactionType)}
              >
                <option value="">全部</option>
                <option value="income">收入</option>
                <option value="expense">支出</option>
                <option value="refund">退款</option>
              </select>
            </label>
          </div>

          {showForm ? (
            <div className="admin-finance-form">
              <h4>{editingId ? '編輯收支' : '新增收支'}</h4>
              <div className="admin-grid-2">
                <label className="admin-field">
                  <span>日期</span>
                  <input
                    type="date"
                    value={form.transactionDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, transactionDate: e.target.value }))}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>類型</span>
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const type = e.target.value as TransactionType;
                      setForm((prev) => ({
                        ...prev,
                        type,
                        category: categoriesForType(type)[0],
                      }));
                    }}
                  >
                    <option value="income">收入</option>
                    <option value="expense">支出</option>
                    <option value="refund">退款</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>類別</span>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    {categoriesForType(form.type).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>金額</span>
                  <input
                    type="number"
                    min={1}
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>案件編號（選填）</span>
                  <input
                    value={form.caseNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, caseNumber: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  <span>付款方式（選填）</span>
                  <input
                    value={form.paymentMethod}
                    onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  />
                </label>
                <label className="admin-field">
                  <span>經手人（選填）</span>
                  <input
                    value={form.receiver}
                    onChange={(e) => setForm((prev) => ({ ...prev, receiver: e.target.value }))}
                  />
                </label>
                <label className="admin-field admin-field--full">
                  <span>備註（選填）</span>
                  <input
                    value={form.note}
                    onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  />
                </label>
              </div>
              <div className="admin-finance-form-actions">
                <button type="button" className="admin-button" disabled={submitting} onClick={saveTransaction}>
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

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>類型</th>
                  <th>類別</th>
                  <th>金額</th>
                  <th>案件</th>
                  <th>來源</th>
                  <th>備註</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length ? (
                  transactions.map((row) => (
                    <tr key={row.id}>
                      <td>{row.transactionDate}</td>
                      <td>{typeLabel(row.type)}</td>
                      <td>{row.category}</td>
                      <td>{formatCurrency(row.amount)}</td>
                      <td>{row.caseNumber || '—'}</td>
                      <td>{sourceLabel(row.source)}</td>
                      <td>{row.note || row.receiver || '—'}</td>
                      <td>
                        <div className="admin-inline-actions">
                          {row.source === 'manual' ? (
                            <>
                              <button
                                type="button"
                                className="admin-button secondary"
                                disabled={submitting}
                                onClick={() => openEdit(row)}
                              >
                                編輯
                              </button>
                              <button
                                type="button"
                                className="admin-button reject"
                                disabled={submitting}
                                onClick={() => removeTransaction(row)}
                              >
                                刪除
                              </button>
                            </>
                          ) : (
                            <span className="admin-muted">預約單同步</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="admin-muted">
                      此期間尚無收支紀錄。可先按「從預約單同步收款」，或手動新增支出。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
