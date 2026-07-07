import { NextRequest, NextResponse } from 'next/server';
import { buildBookingSlots } from '@/lib/booking/availability';
import { loadBookingConfig } from '@/lib/booking/config';
import { assertBookingDateInWindow } from '@/lib/booking/time';
import { normalizePhone } from '@/lib/booking/phone';
import { getPhoneCountryRule } from '@/lib/booking/phone-countries';
import type { BookingPayload } from '@/lib/booking/types';
import { sendPendingBookingEmails } from '@/lib/mail/booking-emails';
import { getStaffNotifyEmailByName } from '@/lib/mail/staff-notify';
import { assertStaffCasePrefixReady } from '@/lib/admin/walk-in-booking';
import { createSupabaseClient } from '@/lib/supabase/client';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

function resolveStaff(staff: string, staffOptions: string[]): string {
  const name = String(staff || '').trim();
  if (staffOptions.includes(name)) return name;
  const photographers = staffOptions.filter((item) => item !== '不指定');
  if (photographers.length === 1) return photographers[0];
  throw new Error('請選擇服務人員');
}

async function assertBookingRateLimit(email: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc('count_recent_bookings_by_email', {
    p_email: email,
    p_since: since,
  });

  if (!error) {
    if (Number(data ?? 0) >= 5) {
      throw new Error('此信箱預約次數過多，請 1 小時後再試');
    }
    return;
  }

  const admin = createAdminSupabaseClient();
  const { count, error: countError } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', since);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= 5) {
    throw new Error('此信箱預約次數過多，請 1 小時後再試');
  }
}

function validatePayload(payload: BookingPayload, config: Awaited<ReturnType<typeof loadBookingConfig>>) {
  if (!payload || typeof payload !== 'object') throw new Error('資料格式錯誤');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) throw new Error('請選擇預約日期');
  assertBookingDateInWindow(String(payload.date), config.minDaysAhead, config.maxDaysAhead);
  if (!/^\d{2}:\d{2}$/.test(String(payload.time || ''))) throw new Error('請選擇預約時段');

  const staffNames = config.staff.map((item) => item.value);
  payload.staff = resolveStaff(payload.staff, staffNames);
  if (payload.staff === '不指定') {
    throw new Error('請選擇服務人員');
  }

  const serviceName = String(payload.service || '').trim();
  const service = config.services.find((item) => item.name === serviceName.split('／')[0]);
  if (!service) throw new Error('請選擇服務項目');
  payload.service = serviceName;

  if (!config.headcountOptions.some((item) => item.value === String(payload.headcount))) {
    throw new Error('請選擇人數');
  }

  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('請填寫姓名');

  if (!config.genderOptions.some((item) => item.value === payload.gender)) {
    throw new Error('請選擇性別');
  }

  const country = String(payload.phoneCountry || '+886').trim();
  const rule = getPhoneCountryRule(country);
  const fullPhone = normalizePhone(payload.phone, country);
  payload.phoneCountry = rule.code;
  payload.phone = fullPhone.slice(rule.code.length);

  const email = String(payload.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('請填寫正確電子信箱');

  payload.name = name;
  payload.email = email;
  payload.note = String(payload.note || '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as BookingPayload;
    const config = await loadBookingConfig();
    validatePayload(payload, config);

    const admin = createAdminSupabaseClient();
    await assertStaffCasePrefixReady(admin, payload.staff);

    const supabase = createSupabaseClient();
    await assertBookingRateLimit(payload.email);

    const [{ data: staffRows }, { data: counts }] = await Promise.all([
      supabase.from('staff_public').select('name, availability_schedule'),
      supabase.rpc('get_booking_slot_counts', { p_date: payload.date }),
    ]);

    const bookedCounts: Record<string, number> = {};
    (counts ?? []).forEach((row: { booking_time: string; booking_count: number }) => {
      bookedCounts[row.booking_time] = Number(row.booking_count) || 0;
    });

    const slots = buildBookingSlots({
      dateStr: payload.date,
      staff: payload.staff,
      openTime: config.openTime,
      closeTime: config.closeTime,
      slotMinutes: config.slotMinutes,
      maxPerSlot: config.maxPerSlot,
      openDays: config.openDays,
      bookedCounts,
      staffRows: staffRows ?? [],
    });

    const selected = slots.find((slot) => slot.time === payload.time);
    if (!selected?.available) {
      throw new Error('此時段已額滿或不可預約，請重新選擇');
    }

    const { error } = await supabase.from('bookings').insert({
      booking_date: payload.date,
      booking_time: payload.time,
      staff_name: payload.staff,
      service: payload.service,
      headcount: payload.headcount,
      customer_name: payload.name,
      gender: payload.gender,
      phone: payload.phone,
      phone_country: payload.phoneCountry || '+886',
      email: payload.email,
      note: payload.note || '',
      status: '待確認',
    });

    if (error) throw new Error(error.message);

    const phoneDisplay = `${payload.phoneCountry}${payload.phone}`;
    const staffNotifyEmail = await getStaffNotifyEmailByName(payload.staff);
    const mailResult = await sendPendingBookingEmails(
      config.shopName,
      config.shopEmail,
      {
        date: payload.date,
        time: payload.time,
        staff: payload.staff,
        service: payload.service,
        headcount: payload.headcount,
        name: payload.name,
        gender: payload.gender,
        phone: phoneDisplay,
        email: payload.email,
        note: payload.note,
      },
      staffNotifyEmail,
    );

    let message = '預約已送出！待攝影師確認後會寄信通知您。';
    if (!mailResult.customer && !mailResult.shop) {
      message = '預約已送出！（Email 尚未設定，請至 .env.local 設定 SMTP）';
    } else if (!mailResult.customer || !mailResult.shop) {
      message = '預約已送出！（部分通知信未能寄出，請檢查 SMTP 設定）';
    }

    return NextResponse.json({
      ok: true,
      message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '預約失敗' },
      { status: 400 },
    );
  }
}
