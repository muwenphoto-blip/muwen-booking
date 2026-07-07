#!/usr/bin/env node
/**
 * 資料連線冒煙測試（讀取 .env.local，不寫入資料）
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');

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

function loadEnv() {
  if (!existsSync(envPath)) throw new Error('.env.local 不存在');
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  text.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return env;
}

console.log('\n═══ Supabase 資料連線測試 ═══\n');

try {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('NEXT_PUBLIC_SUPABASE_URL');
  else pass('NEXT_PUBLIC_SUPABASE_URL 已設定');
  if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY');
  else pass('SUPABASE_SERVICE_ROLE_KEY 已設定');

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const tables = [
    ['bookings', 'id'],
    ['settings', 'key'],
    ['admin_users', 'id'],
    ['transactions', 'id'],
    ['promotions', 'id'],
    ['assets', 'id'],
  ];

  for (const [table, col] of tables) {
    const { error, count } = await supabase.from(table).select(col, { count: 'exact', head: true });
    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
        fail(`表 ${table}`, '尚未建立（請執行對應 SQL migration）');
      } else {
        fail(`表 ${table}`, error.message);
      }
    } else {
      pass(`表 ${table} 可讀（${count ?? 0} 筆）`);
    }
  }

  const { data: settings, error: settingsError } = await supabase.from('settings').select('key, value').limit(5);
  if (settingsError) fail('settings 內容', settingsError.message);
  else pass(`settings 抽樣 ${settings?.length ?? 0} 筆`);

  const { error: bookingDocError } = await supabase
    .from('bookings')
    .select('id, document_data')
    .limit(1);
  if (bookingDocError && bookingDocError.message.includes('document_data')) {
    fail('bookings.document_data', '欄位不存在（執行 booking-document-data.sql）');
  } else if (bookingDocError) {
    fail('bookings.document_data', bookingDocError.message);
  } else {
    pass('bookings.document_data 欄位可讀');
  }
} catch (err) {
  fail('連線測試', err instanceof Error ? err.message : String(err));
}

console.log('\n════════════════════════════════════');
console.log(`通過 ${passed} ｜ 失敗 ${failed}`);
console.log('════════════════════════════════════\n');

if (failed > 0) process.exit(1);
