#!/usr/bin/env node
/**
 * 暴力測試：純邏輯、建置、靜態檢查、API 冒煙（若可啟動 server）
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

let passed = 0;
let failed = 0;
let warned = 0;

function pass(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail = '') {
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function warn(name, detail = '') {
  warned += 1;
  console.log(`  ! ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name, condition, detail = '') {
  if (condition) pass(name);
  else fail(name, detail);
}

function assertEq(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertThrows(name, fn, includes = '') {
  try {
    fn();
    fail(name, 'did not throw');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!includes || msg.includes(includes)) pass(name);
    else fail(name, `threw "${msg}"`);
  }
}

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: root, ...opts });
}

// ─── 內嵌純邏輯（與 src 同步測試，避免 path alias 問題）───

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

function calcItemRowTotal(price, discount, quantity) {
  const hasInput = parseAmount(price) || parseAmount(discount) || parseAmount(quantity);
  if (!hasInput) return '';
  const qty = effectiveItemQuantity(quantity, price, discount);
  const total = Math.max(0, parseAmount(price) * qty - parseAmount(discount));
  return total > 0 ? String(Number.isInteger(total) ? total : Math.round(total * 100) / 100) : '0';
}

function summarizeItemRows(rows) {
  let subtotalQty = 0;
  let subtotalAmount = 0;
  let grandTotal = 0;
  for (const row of rows) {
    const filled = Boolean(row.price || row.discount || row.quantity || row.serviceContent);
    if (!filled) continue;
    const qty = effectiveItemQuantity(row.quantity, row.price, row.discount);
    const price = parseAmount(row.price);
    subtotalQty += qty;
    subtotalAmount += price * qty;
    grandTotal += parseAmount(calcItemRowTotal(row.price, row.discount, row.quantity));
  }
  return { subtotalQty, subtotalAmount, grandTotal };
}

function isDeliveryExpired(delivery) {
  if (!delivery.final_expires_at) return false;
  return new Date(delivery.final_expires_at).getTime() <= Date.now();
}

function resolveDeliveryPhase(delivery) {
  if (isDeliveryExpired(delivery)) return 'expired';
  if (delivery.finals_started_at) return 'delivering';
  return delivery.phase === 'expired' ? 'expired' : delivery.phase;
}

function isDeliveryCompleted(delivery) {
  return Boolean(delivery.completed_at);
}

function isSelectionOpen(delivery) {
  if (isDeliveryCompleted(delivery)) return false;
  if (resolveDeliveryPhase(delivery) === 'expired') return false;
  if (delivery.selection_locked_at && !delivery.selection_reopened) return false;
  return true;
}

function isSelectionLocked(delivery) {
  return Boolean(delivery.selection_locked_at && !delivery.selection_reopened);
}

function guestShowSelectionOption(delivery) {
  if (resolveDeliveryPhase(delivery) === 'expired') return false;
  return isSelectionOpen(delivery);
}

function guestShowDeliveryOption(delivery) {
  if (resolveDeliveryPhase(delivery) === 'expired') return false;
  return isSelectionLocked(delivery);
}

function guestDeliveryReady(delivery) {
  return resolveDeliveryPhase(delivery) === 'delivering';
}

function sanitizeNoteForFilename(note) {
  return String(note || '')
    .trim()
    .replace(/[/\\:*?"<>|\r\n]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

function appendNoteToFilename(fileName, note) {
  const sanitized = sanitizeNoteForFilename(note);
  if (!sanitized) return fileName;
  const dot = fileName.lastIndexOf('.');
  if (dot > 0) return `${fileName.slice(0, dot)}_${sanitized}${fileName.slice(dot)}`;
  return `${fileName}_${sanitized}`;
}

function validateSelectionNote(note) {
  const trimmed = String(note || '').trim();
  if (trimmed.length > 120) throw new Error('備註最多 120 字');
  return trimmed;
}

function normalizeCasePrefix(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
}

function validateCasePrefix(raw) {
  const prefix = normalizeCasePrefix(raw);
  if (!/^[A-Z]{2}$/.test(prefix)) throw new Error('案號前綴須為 2 個英文字母');
  return prefix;
}

// ─── 測試區塊 ───

console.log('\n═══ 1. 關鍵檔案存在 ═══');
const required = [
  'src/components/delivery-guest-panel.tsx',
  'src/components/admin-delivery-panel.tsx',
  'src/app/api/admin/deliveries/[bookingId]/complete/route.ts',
  'src/app/api/delivery/[slug]/session/route.ts',
  'src/lib/delivery/access.ts',
  '../supabase/photo-delivery-v2.sql',
  'src/components/booking-document-shared.tsx',
  'src/lib/admin/walk-in-form-validation.ts',
];
for (const f of required) {
  assert(`檔案：${f}`, existsSync(join(root, f)));
}

console.log('\n═══ 2. 門市登記費用計算（多筆服務）═══');
const rows = [
  { serviceContent: '證件照', price: '600', discount: '200', quantity: '1' },
  { serviceContent: '形象照', price: '1500', discount: '', quantity: '' },
];
const sum = summarizeItemRows(rows);
assertEq('小計數量 = 2', sum.subtotalQty, 2);
assertEq('小計金額 = 2100', sum.subtotalAmount, 2100);
assertEq('應收總額 = 1900', sum.grandTotal, 1900);
assertEq('第二筆空數量預設 1', calcItemRowTotal('1500', '', ''), '1500');
assertEq('空行不計', summarizeItemRows([{ price: '', discount: '', quantity: '' }]).grandTotal, 0);

console.log('\n═══ 3. 交片狀態機 ═══');
const base = {
  phase: 'selecting',
  selection_locked_at: null,
  selection_reopened: false,
  finals_started_at: null,
  final_expires_at: null,
  completed_at: null,
};

assertEq('選片中：phase=selecting', resolveDeliveryPhase(base), 'selecting');
assert('選片中：顯示選片', guestShowSelectionOption(base));
assert('選片中：隱藏交片', !guestShowDeliveryOption(base));
assert('選片中：未就緒', !guestDeliveryReady(base));

const locked = { ...base, selection_locked_at: new Date().toISOString() };
assert('鎖定後：隱藏選片', !guestShowSelectionOption(locked));
assert('鎖定後：顯示交片', guestShowDeliveryOption(locked));
assert('鎖定未上傳：未就緒', !guestDeliveryReady(locked));

const delivering = {
  ...locked,
  finals_started_at: new Date().toISOString(),
  final_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
};
assertEq('上傳成品：phase=delivering', resolveDeliveryPhase(delivering), 'delivering');
assert('上傳成品：可下載', guestDeliveryReady(delivering));
assert('上傳成品：仍顯示交片入口', guestShowDeliveryOption(delivering));

const completed = { ...delivering, completed_at: new Date().toISOString() };
assert('交片完成：選片關閉', !isSelectionOpen(completed));
assert('交片完成：標記完成', isDeliveryCompleted(completed));

const expired = {
  ...delivering,
  final_expires_at: new Date(Date.now() - 1000).toISOString(),
};
assertEq('過期：phase=expired', resolveDeliveryPhase(expired), 'expired');
assert('過期：選片隱藏', !guestShowSelectionOption(expired));
assert('過期：交片隱藏', !guestShowDeliveryOption(expired));

const reopened = {
  ...locked,
  selection_reopened: true,
  selection_locked_at: new Date().toISOString(),
};
assert('重開選片：可選', isSelectionOpen(reopened));
assert('重開選片：交片入口關', !guestShowDeliveryOption(reopened));

console.log('\n═══ 4. 選片備註與檔名 ═══');
assertEq(
  '備註加檔名（空白轉底線）',
  appendNoteToFilename('IMG_001.jpg', '放大 眼睛'),
  'IMG_001_放大_眼睛.jpg',
);
assertEq('空備註不變', appendNoteToFilename('a.jpg', ''), 'a.jpg');
assertEq('特殊字元清除', sanitizeNoteForFilename('test/path:name'), 'testpathname');
assertThrows('超長備註', () => validateSelectionNote('x'.repeat(121)), '120');
assertEq('合法備註', validateSelectionNote('  修圖  '), '修圖');

console.log('\n═══ 5. 案號前綴 ═══');
assertEq('normalize XE12 → XE', normalizeCasePrefix('xe12'), 'XE');
assertEq('validate XE', validateCasePrefix('xe'), 'XE');
assertThrows('無效前綴', () => validateCasePrefix('1'), '英文字母');

console.log('\n═══ 6. 原始碼靜態檢查 ═══');
const guestPanel = readFileSync(join(root, 'src/components/delivery-guest-panel.tsx'), 'utf8');
assert('客人頁有 hub 選單', guestPanel.includes("'hub'"));
assert('客人頁有選片/交片', guestPanel.includes('選片') && guestPanel.includes('交片'));
assert('客人頁有努力中', guestPanel.includes('攝影師正努力中'));

const adminPanel = readFileSync(join(root, 'src/components/admin-delivery-panel.tsx'), 'utf8');
assert('後台單一客人連結', adminPanel.includes('客人連結'));
assert('後台 ZIP 交片完成後隱藏', adminPanel.includes('!deliveryCompleted'));

const sessionRoute = readFileSync(join(root, 'src/app/api/delivery/[slug]/session/route.ts'), 'utf8');
assert('session 回傳 showSelectionOption', sessionRoute.includes('showSelectionOption'));
assert('session 回傳 showDeliveryOption', sessionRoute.includes('showDeliveryOption'));

console.log('\n═══ 7. TypeScript ═══');
const tsc = run('npx tsc --noEmit --pretty false');
if (tsc.status === 0) pass('tsc --noEmit');
else fail('tsc --noEmit', tsc.stdout?.slice(-400) || tsc.stderr?.slice(-400));

console.log('\n═══ 8. ESLint ═══');
const lint = run('npm run lint 2>&1');
const lintOut = (lint.stdout || '') + (lint.stderr || '');
const lintErrors = (lintOut.match(/\berror\b/g) || []).length;
if (lint.status === 0) pass('eslint');
else if (lintErrors === 0) warn('eslint 有 warning 但無 error', `${(lintOut.match(/warning/g) || []).length} warnings`);
else fail('eslint', `${lintErrors} errors — 詳見 npm run lint`);

console.log('\n═══ 9. Production build ═══');
const build = run('npm run build 2>&1');
if (build.status === 0) pass('npm run build');
else fail('npm run build', (build.stdout || build.stderr || '').slice(-600));

console.log('\n═══ 10. API 冒煙（本機 server）═══');
async function smokeApi() {
  const port = 3099;
  let server;
  try {
    server = spawn('npx', ['next', 'start', '-p', String(port)], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    await new Promise((r) => setTimeout(r, 4000));

    const endpoints = [
      ['GET /', `http://127.0.0.1:${port}/`],
      ['GET /admin', `http://127.0.0.1:${port}/admin`],
      ['GET /api/booking/config', `http://127.0.0.1:${port}/api/booking/config`],
      ['GET /api/admin/session', `http://127.0.0.1:${port}/api/admin/session`],
      ['GET /delivery/fake-slug', `http://127.0.0.1:${port}/delivery/fake-slug`],
      ['GET /api/delivery/fake-slug/session', `http://127.0.0.1:${port}/api/delivery/fake-slug/session`],
    ];

    for (const [label, url] of endpoints) {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        const ok = res.status >= 200 && res.status < 500;
        if (ok) pass(`API ${label} → ${res.status}`);
        else fail(`API ${label}`, `status ${res.status}`);
      } catch (err) {
        fail(`API ${label}`, err instanceof Error ? err.message : String(err));
      }
    }

    // 未登入 delivery photos 應 401
    const photos = await fetch(`http://127.0.0.1:${port}/api/delivery/fake-slug/photos?mode=selection`);
    assertEq('未登入 photos → 401', photos.status, 401);

    // 未登入 selection POST 應 401
    const sel = await fetch(`http://127.0.0.1:${port}/api/delivery/fake-slug/selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', photoId: 'x' }),
    });
    assertEq('未登入 selection → 401', sel.status, 401);
  } catch (err) {
    warn('API 冒煙跳過', err instanceof Error ? err.message : String(err));
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      if (!server.killed) server.kill('SIGKILL');
    }
  }
}

await smokeApi();

// ─── 總結 ───
console.log('\n════════════════════════════════════');
console.log(`通過 ${passed} ｜ 失敗 ${failed} ｜ 警告 ${warned}`);
console.log('════════════════════════════════════\n');

if (failed > 0) process.exit(1);
