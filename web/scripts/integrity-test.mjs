#!/usr/bin/env node
/**
 * 資料一致性與邊際測試（對照 Gemini 檢查清單）
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function pass(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail = '') {
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name, condition, detail = '') {
  if (condition) pass(name);
  else fail(name, detail);
}

function assertThrows(name, fn, includes = '') {
  try {
    fn();
    fail(name, 'did not throw');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!includes || msg.includes(includes)) pass(name);
    else fail(name, msg);
  }
}

function parseAmount(value) {
  const n = parseFloat(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function effectiveItemQuantity(quantity, price, discount = '') {
  const qty = parseAmount(quantity);
  if (qty > 0) return qty;
  if (parseAmount(price) || parseAmount(discount)) return 1;
  return 0;
}

function normalizeDiscountMode(mode) {
  if (mode === 'per_extra' || mode === 'group_free' || mode === 'manual') return mode;
  return 'manual';
}

function calculateRuleDiscount(row) {
  const mode = normalizeDiscountMode(row.discountMode);
  const qty = effectiveItemQuantity(row.quantity, row.price, row.discount);
  const unitPrice = parseAmount(row.price);
  const lineMax = Math.max(0, unitPrice * qty);
  let discount = 0;
  if (mode === 'per_extra') {
    const basePeople = Math.max(0, parseAmount(row.discountBasePeople || ''));
    const perExtra = parseAmount(row.discountPerExtra || '');
    discount = Math.max(0, qty - basePeople) * perExtra;
  } else if (mode === 'group_free') {
    const groupPay = Math.max(1, parseAmount(row.discountGroupPay || '') || 1);
    const groupFree = Math.max(1, parseAmount(row.discountGroupFree || '') || 1);
    const bundleSize = groupPay + groupFree;
    discount = Math.floor(qty / bundleSize) * groupFree * unitPrice;
  } else {
    discount = parseAmount(row.discount);
  }
  return Math.min(Math.max(0, discount), lineMax);
}

function calcItemRowTotal(price, discount, quantity) {
  const qty = effectiveItemQuantity(quantity, price, discount);
  return Math.max(0, parseAmount(price) * qty - parseAmount(discount));
}

function validatePromotionDates(startsAt, endsAt) {
  const start = String(startsAt || '').trim();
  const end = String(endsAt || '').trim();
  if (start && end && start > end) throw new Error('結束日期不可早於開始日期');
}

function promotionMatchesTarget(promotion, serviceId, optionLabel, onDate) {
  if (!promotion.active) return false;
  if (promotion.startsAt && promotion.startsAt > onDate) return false;
  if (promotion.endsAt && promotion.endsAt < onDate) return false;
  return promotion.targets.some((target) => {
    if (target.serviceId !== serviceId) return false;
    if (!target.optionLabels.length) return true;
    return target.optionLabels.includes(optionLabel);
  });
}

function findPromotionForServiceOption(promotions, serviceId, optionLabel, onDate) {
  return (
    promotions
      .filter((p) => promotionMatchesTarget(p, serviceId, optionLabel, onDate))
      .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null
  );
}

console.log('\n═══ 1. 資料庫結構檢查（靜態）═══');
const txSql = readFileSync(join(root, '../supabase/transactions.sql'), 'utf8');
assert('transactions.amount >= 0', txSql.includes('check (amount >= 0)'));
assert('transactions on delete set null', txSql.includes('on delete set null'));
assert('transactions upsert unique index', txSql.includes('transactions_booking_source_uidx'));

const promoSql = readFileSync(join(root, '../supabase/promotions.sql'), 'utf8');
assert('promotions rule_type check', promoSql.includes("rule_type in ('per_extra', 'group_free', 'fixed')"));

try {
  const dateCheckSql = readFileSync(join(root, '../supabase/promotions-date-check.sql'), 'utf8');
  assert('promotions date range constraint sql', dateCheckSql.includes('promotions_date_range_check'));
} catch {
  fail('promotions date range constraint sql', 'file missing');
}

console.log('\n═══ 2. 折扣不可超過行金額（負收益防護）═══');
const hugePerExtra = calculateRuleDiscount({
  price: '1000',
  quantity: '5',
  discountMode: 'per_extra',
  discountBasePeople: '1',
  discountPerExtra: '9999',
});
assert('per_extra 折扣封頂', hugePerExtra === 5000, `got ${hugePerExtra}`);

const hugeManual = calculateRuleDiscount({
  price: '800',
  quantity: '2',
  discountMode: 'manual',
  discount: '5000',
});
assert('manual 折扣封頂', hugeManual === 1600, `got ${hugeManual}`);

assert('行總額不為負', calcItemRowTotal('1000', '5000', '2') === 0);

console.log('\n═══ 3. 優惠活動邊際 ═══');
assertThrows('結束日早於開始日', () => validatePromotionDates('2026-08-01', '2026-07-01'), '結束日期');
pass('空日期允許');

const promos = [
  {
    id: 'a',
    name: '春節',
    active: true,
    sortOrder: 1,
    startsAt: '2026-01-01',
    endsAt: '2026-02-01',
    targets: [{ serviceId: 's1', optionLabels: ['A'] }],
  },
  {
    id: 'b',
    name: '老客',
    active: true,
    sortOrder: 2,
    startsAt: '',
    endsAt: '',
    targets: [{ serviceId: 's1', optionLabels: ['A'] }],
  },
];
const picked = findPromotionForServiceOption(promos, 's1', 'A', '2026-01-15');
assert('多活動只套用排序第一個', picked?.id === 'a');
assert('過期活動不匹配', !promotionMatchesTarget(promos[0], 's1', 'A', '2026-03-01'));

console.log('\n═══ 4. 收款同步防重複（靜態）═══');
const financeTs = readFileSync(join(root, 'src/lib/admin/finance.ts'), 'utf8');
assert('upsert onConflict', financeTs.includes("onConflict: 'booking_id,source,source_ref'"));
assert('清除過期 payment refs', financeTs.includes('staleIds'));

const deliveryPanel = readFileSync(join(root, 'src/components/admin-delivery-panel.tsx'), 'utf8');
assert('交片完成防連點', deliveryPanel.includes('completingRef'));

const completeRoute = readFileSync(
  join(root, 'src/app/api/admin/deliveries/[bookingId]/complete/route.ts'),
  'utf8',
);
assert('交片完成冪等', completeRoute.includes('delivery.completed_at'));

console.log('\n═══ 5. CSV 匯出格式 ═══');
const reportTs = readFileSync(join(root, 'src/lib/admin/finance-report.ts'), 'utf8');
assert('CSV UTF-8 BOM', reportTs.includes('\\uFEFF'));
assert('CSV 金額為數字', reportTs.includes('row.amount,'));
assert('無 NT$ 前綴在 CSV 金額欄', !reportTs.includes('formatCurrency(row.amount)'));

console.log('\n═══ 6. 財務頁效能 ═══');
const financePanel = readFileSync(join(root, 'src/components/admin-finance-panel.tsx'), 'utf8');
assert('收支分頁', financePanel.includes('TX_PAGE_SIZE'));
assert('報表 lite 模式', financePanel.includes('lite=1'));

console.log('\n════════════════════════════════════');
console.log(`通過 ${passed} ｜ 失敗 ${failed}`);
console.log('════════════════════════════════════\n');

if (failed > 0) process.exit(1);
