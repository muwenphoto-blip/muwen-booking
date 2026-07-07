#!/usr/bin/env node
/**
 * 安全攻擊面測試：未授權存取、偽造 JWT、注入、路徑穿越、大量請求
 */
const BASE = process.env.TEST_BASE_URL || 'https://muwen-booking.vercel.app';

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

function assertStatus(name, status, expected) {
  const ok = Array.isArray(expected) ? expected.includes(status) : status === expected;
  if (ok) pass(`${name} → ${status}`);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${status}`);
}

async function fetchStatus(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: 'manual', ...init });
    return res.status;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const fakeJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoi5LiAIiwidXNlcm5hbWUiOiJoYWNrZXIifQ.invalid';

console.log(`\n═══ 安全攻擊測試 @ ${BASE} ═══\n`);

console.log('── 1. 未登入存取後台 API ──');
const adminEndpoints = [
  '/api/admin/bookings',
  '/api/admin/finance/summary',
  '/api/admin/finance/report',
  '/api/admin/finance/export?kind=full',
  '/api/admin/finance/transactions',
  '/api/admin/assets',
  '/api/admin/settings',
  '/api/admin/team',
  '/api/admin/logs',
  '/api/admin/availability',
];

for (const path of adminEndpoints) {
  const status = await fetchStatus(`${BASE}${path}`);
  if (typeof status === 'number') assertStatus(`GET ${path}`, status, [401, 403, 404]);
  else fail(`GET ${path}`, status);
}

console.log('\n── 2. 偽造 JWT Cookie ──');
const forgedHeaders = {
  headers: { Cookie: `admin_session=${fakeJwt}` },
};
for (const path of ['/api/admin/bookings', '/api/admin/finance/summary', '/api/admin/settings']) {
  const status = await fetchStatus(`${BASE}${path}`, forgedHeaders);
  if (typeof status === 'number') assertStatus(`偽造 JWT ${path}`, status, [401, 403, 404]);
  else fail(`偽造 JWT ${path}`, status);
}

console.log('\n── 3. 交片未授權 ──');
assertStatus(
  '未登入 delivery photos',
  await fetchStatus(`${BASE}/api/delivery/fake-slug/photos?mode=selection`),
  401,
);
assertStatus(
  '未登入 selection POST',
  await fetchStatus(`${BASE}/api/delivery/fake-slug/selection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'toggle', photoId: 'x' }),
  }),
  401,
);
assertStatus(
  '未登入 download-all',
  await fetchStatus(`${BASE}/api/delivery/fake-slug/download-all`),
  [401, 404],
);

console.log('\n── 4. 注入與惡意 payload ──');
const sqlPayload = "' OR 1=1 --";
const xssPayload = '<script>alert(1)</script>';
const slotsStatus = await fetchStatus(
  `${BASE}/api/booking/slots?date=${encodeURIComponent(sqlPayload)}&staff=${encodeURIComponent(xssPayload)}`,
);
if (typeof slotsStatus === 'number') {
  assert('slots 注入不 500', slotsStatus < 500, `status ${slotsStatus}`);
} else fail('slots 注入', slotsStatus);

const submitStatus = await fetchStatus(`${BASE}/api/booking/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: sqlPayload,
    time: '10:00',
    staff: xssPayload,
    name: xssPayload,
    email: 'not-an-email',
    phone: 'abc',
    service: 'test',
    people: -99,
    gender: 'x',
    note: 'x'.repeat(50000),
  }),
});
if (typeof submitStatus === 'number') {
  assert('submit 惡意 payload 不 500', submitStatus < 500, `status ${submitStatus}`);
  assert('submit 惡意 payload 拒絕', submitStatus === 400 || submitStatus === 429, `status ${submitStatus}`);
} else fail('submit 惡意 payload', submitStatus);

console.log('\n── 5. 路徑穿越 / 敏感檔案 ──');
const traversalPaths = [
  '/api/delivery/../../../etc/passwd/session',
  '/api/admin/finance/export?kind=../../../etc/passwd',
  '/.env',
  '/.env.local',
  '/api/admin/session',
];
for (const path of traversalPaths) {
  const status = await fetchStatus(`${BASE}${path}`);
  if (typeof status === 'number') {
    const ok =
      path === '/api/admin/session'
        ? status === 200 || status === 401
        : status === 404 || status === 400 || status === 401 || status === 403;
    assert(`${path} 不洩漏`, ok, `status ${status}`);
  } else fail(path, status);
}

console.log('\n── 6. 暴力請求（20 連發 submit）──');
let rateLimited = 0;
let serverErrors = 0;
const burst = await Promise.all(
  Array.from({ length: 20 }, () =>
    fetch(`${BASE}/api/booking/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garbage: true }),
    }).then((r) => r.status),
  ),
);
burst.forEach((status) => {
  if (status === 429) rateLimited += 1;
  if (status >= 500) serverErrors += 1;
});
assert('暴力 submit 無 500', serverErrors === 0, `${serverErrors} server errors`);
if (rateLimited > 0) pass(`rate limit 觸發 ${rateLimited}/20`);
else warn('rate limit 未觸發（可能未啟用或閾值較高）');

console.log('\n── 7. HTTP 方法濫用 ──');
assertStatus('DELETE /api/booking/config', await fetchStatus(`${BASE}/api/booking/config`, { method: 'DELETE' }), [404, 405]);
assertStatus('PUT /api/admin/session', await fetchStatus(`${BASE}/api/admin/session`, { method: 'PUT' }), [404, 405, 401]);

console.log('\n════════════════════════════════════');
console.log(`通過 ${passed} ｜ 失敗 ${failed} ｜ 警告 ${warned}`);
console.log('════════════════════════════════════\n');

if (failed > 0) process.exit(1);
