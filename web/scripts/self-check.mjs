#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const lines = [];
const ok = (msg) => lines.push(`✓ ${msg}`);
const fail = (msg) => lines.push(`✗ ${msg}`);
const warn = (msg) => lines.push(`! ${msg}`);

function run(cmd) {
  return spawnSync(cmd, { shell: true, encoding: 'utf8' });
}

console.log('=== Muwen Booking 排班系統自檢 ===\n');

// 1. 關鍵檔案
const requiredFiles = [
  'src/app/api/admin/availability/route.ts',
  'src/lib/admin/availability-payload.ts',
  'src/components/admin-schedule-panel.tsx',
  'src/lib/booking/availability.ts',
  'src/lib/admin/schedule-access.ts',
  '../supabase/staff-schedule-workflow.sql',
  '../supabase/rls-security-hardening.sql',
];

requiredFiles.forEach((file) => {
  if (existsSync(join(root, file))) ok(`檔案存在：${file}`);
  else fail(`缺少檔案：${file}`);
});

// 2. route.ts 不應含損壞的 top-level return
const routeText = readFileSync(join(root, 'src/app/api/admin/availability/route.ts'), 'utf8');
if (routeText.includes('function normalizeDayOffDates')) {
  fail('route.ts 仍含 normalizeDayOffDates（應已移到 availability-payload.ts）');
} else if (routeText.includes("from '@/lib/admin/availability-payload'")) {
  ok('route.ts 已改為 import availability-payload');
} else {
  fail('route.ts 未 import availability-payload');
}

// 3. 語法檢查（TypeScript 用 tsc，JS 用 node --check）
const tscResult = run('npx tsc --noEmit --pretty false 2>&1');
if (tscResult.status === 0) ok('TypeScript 檢查通過');
else {
  fail('TypeScript 檢查失敗');
  console.log(tscResult.stdout.slice(-800));
}

// 4. TypeScript / build
try {
  execSync('npm run build', { stdio: 'pipe', encoding: 'utf8' });
  ok('npm run build 通過');
} catch (err) {
  fail('npm run build 失敗');
  if (err.stdout) console.log(err.stdout.slice(-1200));
  if (err.stderr) console.log(err.stderr.slice(-1200));
}

// 5. Port 3000 狀態
const portCheck = run('lsof -ti :3000');
if (portCheck.stdout.trim()) {
  warn(`port 3000 已被 PID ${portCheck.stdout.trim()} 佔用（可能是舊 dev server）`);
  const curl = run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/schedule');
  const code = curl.stdout.trim();
  if (code === '200') ok('/admin/schedule 在 port 3000 回傳 200');
  else fail(`/admin/schedule 在 port 3000 回傳 ${code || '無回應'}（Internal Server Error 通常是舊 server）`);
  warn('請執行：npm run dev:clean');
} else {
  warn('port 3000 未啟動 dev server');
}

// 6. 環境變數
if (existsSync('.env.local')) ok('.env.local 存在');
else warn('.env.local 不存在（Supabase 連線可能失敗）');

console.log('\n' + lines.join('\n'));
console.log('\n--- 建議操作 ---');
console.log('1. 關閉所有 terminal 裡的 npm run dev');
console.log('2. cd web && npm run dev:clean');
console.log('3. 瀏覽器開 http://localhost:3000/admin/schedule');
console.log('4. 若排休送審失敗，到 Supabase SQL Editor 執行 supabase/staff-schedule-workflow.sql');
console.log('5. 安全加固請執行 supabase/rls-security-hardening.sql');

const failed = lines.filter((line) => line.startsWith('✗')).length;
process.exit(failed > 0 ? 1 : 0);
