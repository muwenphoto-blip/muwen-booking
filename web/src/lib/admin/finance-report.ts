import type {
  FinanceAccountingReport,
  FinanceCategoryBreakdown,
  FinancePeriod,
  FinanceSummary,
  FinanceTransactionRow,
  TransactionType,
} from '@/lib/admin/finance';
import {
  getFinancePeriodRange,
  loadFinanceSummary,
  loadFinanceTransactions,
} from '@/lib/admin/finance';
import {
  loadEquipmentDepreciation,
  monthKeyFromIsoDate,
  resolveCashFlow,
} from '@/lib/admin/finance-equipment';
import { loadAdminAssets, syncMonthDepreciationFromAssets } from '@/lib/admin/assets';
import { loadFinancePerformance, type FinancePerformanceReport } from '@/lib/admin/finance-performance';

export type FinanceReportKind = 'detail' | 'pl' | 'summary' | 'full' | 'performance';

function typeLabel(type: TransactionType): string {
  if (type === 'income') return '收入';
  if (type === 'refund') return '退款';
  return '支出';
}

function sourceLabel(source: string): string {
  if (source === 'document_payment') return '預約單收款';
  if (source === 'manual') return '手動登錄';
  return source;
}

export function buildCategoryBreakdown(
  transactions: FinanceTransactionRow[],
): FinanceCategoryBreakdown[] {
  const map = new Map<string, FinanceCategoryBreakdown>();
  transactions.forEach((row) => {
    const key = `${row.type}::${row.category}`;
    const current = map.get(key) || {
      category: row.category || '未分類',
      type: row.type,
      amount: 0,
      count: 0,
    };
    current.amount += row.amount;
    current.count += 1;
    map.set(key, current);
  });

  const order: Record<TransactionType, number> = { income: 0, expense: 1, refund: 2 };
  return Array.from(map.values()).sort((a, b) => {
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    return b.amount - a.amount;
  });
}

export function buildFinanceAccountingReport(
  summary: FinanceSummary,
  transactions: FinanceTransactionRow[],
  equipmentDepreciation = 0,
  performance: FinancePerformanceReport,
): FinanceAccountingReport {
  const categoryBreakdown = buildCategoryBreakdown(transactions);
  const incomeCategories = categoryBreakdown.filter((row) => row.type === 'income');
  const expenseCategories = categoryBreakdown.filter((row) => row.type === 'expense');
  const refundCategories = categoryBreakdown.filter((row) => row.type === 'refund');

  const grossRevenue = summary.income + summary.discountCost;
  const netRevenue = summary.income;
  const netProfitMargin =
    netRevenue > 0 ? Math.round((summary.netProfit / netRevenue) * 1000) / 10 : 0;
  const discountRate =
    grossRevenue > 0 ? Math.round((summary.discountCost / grossRevenue) * 1000) / 10 : 0;
  const monthKey = monthKeyFromIsoDate(summary.from);
  const cashFlowMetrics = resolveCashFlow(summary.netProfit, equipmentDepreciation);

  return {
    generatedAt: new Date().toISOString(),
    period: summary.period,
    rangeLabel: summary.rangeLabel,
    from: summary.from,
    to: summary.to,
    accounting: {
      grossRevenue,
      discountCost: summary.discountCost,
      netRevenue,
      totalExpense: summary.expense,
      totalRefund: summary.refund,
      netProfit: summary.netProfit,
      netProfitMargin,
      discountRate,
      transactionCount: summary.transactionCount,
      equipmentDepreciation,
      cashFlow: cashFlowMetrics.cashFlow,
      cashFlowDirection: cashFlowMetrics.direction,
      cashFlowLabel: cashFlowMetrics.label,
      monthKey,
    },
    categoryBreakdown,
    incomeCategories,
    expenseCategories,
    refundCategories,
    buckets: summary.buckets,
    transactions: [...transactions].sort((a, b) => {
      const dateCmp = a.transactionDate.localeCompare(b.transactionDate);
      if (dateCmp !== 0) return dateCmp;
      return a.createdAt.localeCompare(b.createdAt);
    }),
    performance,
  };
}

export async function loadFinanceAccountingReport(
  period: FinancePeriod,
  anchor: string,
  options?: { transactionLimit?: number },
): Promise<FinanceAccountingReport> {
  const range = getFinancePeriodRange(period, anchor);
  const monthKey = monthKeyFromIsoDate(range.from);
  const txLimit = options?.transactionLimit ?? 5000;
  const assets = await loadAdminAssets();
  if (assets.length) {
    await syncMonthDepreciationFromAssets(monthKey);
  }
  const [summary, transactions, equipmentDepreciation, performance] = await Promise.all([
    loadFinanceSummary(period, anchor),
    loadFinanceTransactions({ from: range.from, to: range.to, limit: txLimit }),
    loadEquipmentDepreciation(monthKey),
    loadFinancePerformance(range.from, range.to),
  ]);
  return buildFinanceAccountingReport(summary, transactions, equipmentDepreciation, performance);
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

function withBom(content: string): string {
  return `\uFEFF${content}`;
}

function formatReportGeneratedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function reportMetaRows(report: FinanceAccountingReport): string[] {
  return [
    csvRow(['沐紋映像攝影工作室']),
    csvRow([
      `統計月份：${report.accounting.monthKey || monthKeyFromIsoDate(report.from)}`,
      `報表期間：${report.rangeLabel}`,
      `計算日期：${formatReportGeneratedAt(report.generatedAt)}`,
    ]),
    csvRow([
      `本期流水：${report.accounting.cashFlowLabel}`,
      `流水金額：${report.accounting.cashFlow}`,
    ]),
    '',
  ];
}

function periodFileToken(report: FinanceAccountingReport): string {
  if (report.period === 'year') {
    const year = String(report.from).slice(0, 4);
    return year || monthKeyFromIsoDate(report.from).slice(0, 4);
  }
  return report.accounting.monthKey || monthKeyFromIsoDate(report.from);
}

export function buildFinanceDetailCsv(report: FinanceAccountingReport): string {
  const lines = [
    ...reportMetaRows(report),
    csvRow(['收支明細帳']),
    csvRow([
      '日期',
      '類型',
      '會計科目',
      '金額',
      '案件編號',
      '付款方式',
      '經手人',
      '來源',
      '備註',
    ]),
  ];

  report.transactions.forEach((row) => {
    lines.push(
      csvRow([
        row.transactionDate,
        typeLabel(row.type),
        row.category,
        row.amount,
        row.caseNumber,
        row.paymentMethod,
        row.receiver,
        sourceLabel(row.source),
        row.note,
      ]),
    );
  });

  lines.push('');
  lines.push(csvRow(['合計收入', report.accounting.netRevenue]));
  lines.push(csvRow(['合計支出', report.accounting.totalExpense]));
  lines.push(csvRow(['器材損耗', report.accounting.equipmentDepreciation]));
  lines.push(csvRow(['合計退款', report.accounting.totalRefund]));
  lines.push(csvRow(['本期淨利', report.accounting.netProfit]));
  lines.push(csvRow(['本期流水', report.accounting.cashFlow, report.accounting.cashFlowLabel]));

  return withBom(lines.join('\n'));
}

export function buildFinanceProfitLossCsv(report: FinanceAccountingReport): string {
  const lines = [
    ...reportMetaRows(report),
    csvRow(['損益表']),
    csvRow(['項目', '金額', '筆數', '說明']),
    csvRow(['一、營業收入（毛額）', report.accounting.grossRevenue, '', '含折扣前應計營收']),
    csvRow(['減：折扣讓利', report.accounting.discountCost, '', `折扣率 ${report.accounting.discountRate}%`]),
    csvRow(['營業收入（淨額）', report.accounting.netRevenue, '', '實際入帳收入合計']),
    '',
    csvRow(['二、營業收入科目明細', '', '', '']),
  ];

  report.incomeCategories.forEach((row) => {
    lines.push(csvRow([`  ${row.category}`, row.amount, row.count, '收入科目']));
  });
  lines.push(csvRow(['營業收入小計', report.accounting.netRevenue, '', '']));

  lines.push('');
  lines.push(csvRow(['三、營業費用', '', '', '']));
  report.expenseCategories.forEach((row) => {
    lines.push(csvRow([`  ${row.category}`, row.amount, row.count, '費用科目']));
  });
  lines.push(csvRow(['營業費用小計', report.accounting.totalExpense, '', '']));

  lines.push('');
  lines.push(csvRow(['減：器材損耗', report.accounting.equipmentDepreciation, '', '依器材價值換算']));
  lines.push('');
  lines.push(csvRow(['四、退款', report.accounting.totalRefund, '', '']));
  report.refundCategories.forEach((row) => {
    lines.push(csvRow([`  ${row.category}`, row.amount, row.count, '退款科目']));
  });

  lines.push('');
  lines.push(csvRow(['五、本期淨利', report.accounting.netProfit, '', `淨利率 ${report.accounting.netProfitMargin}%`]));
  lines.push(csvRow(['六、本期流水', report.accounting.cashFlow, '', report.accounting.cashFlowLabel]));

  return withBom(lines.join('\n'));
}

export function buildFinanceSummaryCsv(report: FinanceAccountingReport): string {
  const lines = [
    ...reportMetaRows(report),
    csvRow(['期間統計表']),
    csvRow(['區間', '收入', '支出', '退款', '淨利', '折扣成本', '交易筆數']),
  ];

  report.buckets.forEach((bucket) => {
    lines.push(
      csvRow([
        bucket.label,
        bucket.income,
        bucket.expense,
        bucket.refund,
        bucket.netProfit,
        bucket.discountCost,
        bucket.transactionCount,
      ]),
    );
  });

  lines.push('');
  lines.push(
    csvRow([
      '本月合計',
      report.accounting.netRevenue,
      report.accounting.totalExpense,
      report.accounting.totalRefund,
      report.accounting.netProfit,
      report.accounting.discountCost,
      report.accounting.transactionCount,
    ]),
  );
  lines.push(csvRow(['器材損耗', report.accounting.equipmentDepreciation]));
  lines.push(csvRow(['本期流水', report.accounting.cashFlow, report.accounting.cashFlowLabel]));

  return withBom(lines.join('\n'));
}

export function buildFinancePerformanceCsv(report: FinanceAccountingReport): string {
  const performance = report.performance;
  const lines = [
    ...reportMetaRows(report),
    csvRow(['績效統計表']),
    '',
    csvRow(['成員', '案件數', '服務金額', '加價購數量', '加價購金額', '總收益']),
  ];

  performance.staff.forEach((row) => {
    lines.push(
      csvRow([
        row.memberName,
        row.caseCount,
        row.serviceAmount,
        row.addonCount,
        row.addonAmount,
        row.totalRevenue,
      ]),
    );
  });

  lines.push('');
  lines.push(
    csvRow([
      '公司合計',
      performance.company.caseCount,
      performance.company.serviceAmount,
      performance.company.addonCount,
      performance.company.addonAmount,
      performance.company.totalRevenue,
    ]),
  );

  return withBom(lines.join('\n'));
}

export function buildFinanceFullReportCsv(report: FinanceAccountingReport): string {
  const content = [
    buildFinanceProfitLossCsv(report).replace(/^\uFEFF/, ''),
    '',
    buildFinancePerformanceCsv(report).replace(/^\uFEFF/, ''),
    '',
    buildFinanceSummaryCsv(report).replace(/^\uFEFF/, ''),
    '',
    buildFinanceDetailCsv(report).replace(/^\uFEFF/, ''),
  ].join('\n');
  return withBom(content);
}

export function buildFinanceReportCsv(
  report: FinanceAccountingReport,
  kind: FinanceReportKind,
): string {
  if (kind === 'detail') return buildFinanceDetailCsv(report);
  if (kind === 'pl') return buildFinanceProfitLossCsv(report);
  if (kind === 'summary') return buildFinanceSummaryCsv(report);
  if (kind === 'performance') return buildFinancePerformanceCsv(report);
  return buildFinanceFullReportCsv(report);
}

export function financeReportFilename(report: FinanceAccountingReport): string {
  return `${periodFileToken(report)}.csv`;
}
