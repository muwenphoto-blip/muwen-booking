import { formatDateWithWeekday } from '@/lib/booking/time';
import { sendEmailSafe } from '@/lib/mail/send';

export type BookingEmailPayload = {
  date: string;
  time: string;
  staff: string;
  service: string;
  headcount: string;
  name: string;
  gender: string;
  phone: string;
  email: string;
  note?: string;
};

export type BookingEmailResult = {
  customer: boolean;
  shop: boolean;
  staff: boolean;
  errors: string[];
};

function buildBookingEmailLines(payload: BookingEmailPayload): string {
  const dateLabel = formatDateWithWeekday(payload.date);
  return [
    `【預約時間】${dateLabel} ${payload.time}`,
    `服務內容：${payload.service}`,
    `服務人員：${payload.staff}`,
    `人數：${payload.headcount} 人`,
    `姓名：${payload.name}`,
    `性別：${payload.gender}`,
    `電話：${payload.phone}`,
    `信箱：${payload.email}`,
    `備註：${payload.note || '（無）'}`,
  ].join('\n');
}

function formatSubjectTag(tag: string, payload: BookingEmailPayload): string {
  const dateLabel = formatDateWithWeekday(payload.date);
  return `【${tag}】${dateLabel} ${payload.time}｜${payload.name}`;
}

function buildShopNotifyEmail(
  payload: BookingEmailPayload,
  submittedAt: string,
  intro: string,
  footer?: string,
): string {
  const lines = buildBookingEmailLines(payload);
  return `${intro}\n\n送出時間：${submittedAt}\n\n${lines}${footer ? `\n\n${footer}` : ''}`;
}

function formatTimestamp(date = new Date()): string {
  return date.toLocaleString('zh-TW', { hour12: true, timeZone: 'Asia/Taipei' });
}

async function sendStaffEmail(
  staffEmail: string | null | undefined,
  subject: string,
  text: string,
  errors: string[],
): Promise<boolean> {
  if (!staffEmail) return false;
  const result = await sendEmailSafe({ to: staffEmail, subject, text });
  if (!result.sent && result.error) errors.push(result.error);
  return result.sent;
}

export async function sendPendingBookingEmails(
  shopName: string,
  shopEmail: string,
  payload: BookingEmailPayload,
  staffNotifyEmail?: string | null,
): Promise<BookingEmailResult> {
  const submittedAt = formatTimestamp();
  const errors: string[] = [];

  const customerResult = await sendEmailSafe({
    to: payload.email,
    subject: `【${shopName}】預約已送出（待確認）`,
    text: `${payload.name} 您好：\n\n已收到您的預約，待攝影師確認後會再寄信通知您：\n\n${buildBookingEmailLines(payload)}\n\n${shopName}`,
  });
  if (!customerResult.sent && customerResult.error) errors.push(customerResult.error);

  const shopResult = await sendEmailSafe({
    to: shopEmail,
    subject: formatSubjectTag('待確認', payload),
    text: buildShopNotifyEmail(payload, submittedAt, '有新的預約待確認：', '請至後台接受或拒絕。'),
  });
  if (!shopResult.sent && shopResult.error) errors.push(shopResult.error);

  const staffSent = await sendStaffEmail(
    staffNotifyEmail,
    formatSubjectTag('待確認', payload),
    `您有一筆新的預約待確認：\n\n${buildShopNotifyEmail(payload, submittedAt, '', '請至後台接受或拒絕。')}`,
    errors,
  );

  return {
    customer: customerResult.sent,
    shop: shopResult.sent,
    staff: staffSent,
    errors,
  };
}

export async function sendBookingDecisionEmails(
  shopName: string,
  shopEmail: string,
  payload: BookingEmailPayload,
  decision: 'accept' | 'reject',
  staffNotifyEmail?: string | null,
  options?: { assignedOnAccept?: boolean },
): Promise<BookingEmailResult> {
  const lines = buildBookingEmailLines(payload);
  const subjectDate = `${formatDateWithWeekday(payload.date)} ${payload.time}`;
  const errors: string[] = [];

  if (decision === 'accept') {
    const customerResult = await sendEmailSafe({
      to: payload.email,
      subject: `【${shopName}】預約已確認`,
      text: `${payload.name} 您好：\n\n您的預約已由攝影師確認：\n\n${lines}\n\n如有異動請來電聯繫。\n${shopName}`,
    });
    if (!customerResult.sent && customerResult.error) errors.push(customerResult.error);

    const shopResult = await sendEmailSafe({
      to: shopEmail,
      subject: `【已接受】${subjectDate}｜${payload.name}`,
      text: `已接受以下預約：\n\n${lines}`,
    });
    if (!shopResult.sent && shopResult.error) errors.push(shopResult.error);

    const staffIntro = options?.assignedOnAccept
      ? '您已被指派以下預約：'
      : '您已確認以下預約：';
    const staffSent = await sendStaffEmail(
      staffNotifyEmail,
      `【已接受】${subjectDate}｜${payload.name}`,
      `${staffIntro}\n\n${lines}`,
      errors,
    );

    return {
      customer: customerResult.sent,
      shop: shopResult.sent,
      staff: staffSent,
      errors,
    };
  }

  const customerResult = await sendEmailSafe({
    to: payload.email,
    subject: `【${shopName}】預約未成立`,
    text: `${payload.name} 您好：\n\n很抱歉，您的以下預約未能安排：\n\n${lines}\n\n歡迎改選其他時段，謝謝。\n${shopName}`,
  });
  if (!customerResult.sent && customerResult.error) errors.push(customerResult.error);

  const shopResult = await sendEmailSafe({
    to: shopEmail,
    subject: `【已拒絕】${subjectDate}｜${payload.name}`,
    text: `已拒絕以下預約：\n\n${lines}`,
  });
  if (!shopResult.sent && shopResult.error) errors.push(shopResult.error);

  return {
    customer: customerResult.sent,
    shop: shopResult.sent,
    staff: false,
    errors,
  };
}

export async function sendBookingTransferEmail(
  shopName: string,
  payload: BookingEmailPayload,
  oldStaff: string,
  staffNotifyEmail?: string | null,
): Promise<BookingEmailResult> {
  const lines = buildBookingEmailLines(payload);
  const subjectDate = `${formatDateWithWeekday(payload.date)} ${payload.time}`;
  const errors: string[] = [];

  const staffSent = await sendStaffEmail(
    staffNotifyEmail,
    `【轉單】${subjectDate}｜${payload.name}`,
    `以下預約已由「${oldStaff}」轉給您：\n\n${lines}\n\n${shopName}`,
    errors,
  );

  return {
    customer: false,
    shop: false,
    staff: staffSent,
    errors,
  };
}

export async function sendBookingCancelledEmails(
  shopName: string,
  shopEmail: string,
  payload: BookingEmailPayload,
): Promise<BookingEmailResult> {
  const lines = buildBookingEmailLines(payload);
  const subjectDate = `${formatDateWithWeekday(payload.date)} ${payload.time}`;
  const errors: string[] = [];

  const customerResult = await sendEmailSafe({
    to: payload.email,
    subject: `【${shopName}】預約已取消`,
    text: `${payload.name} 您好：\n\n您的以下預約已取消：\n\n${lines}\n\n如有疑問請來電聯繫，謝謝。\n${shopName}`,
  });
  if (!customerResult.sent && customerResult.error) errors.push(customerResult.error);

  const shopResult = await sendEmailSafe({
    to: shopEmail,
    subject: `【已取消】${subjectDate}｜${payload.name}`,
    text: `以下預約已取消：\n\n${lines}`,
  });
  if (!shopResult.sent && shopResult.error) errors.push(shopResult.error);

  return {
    customer: customerResult.sent,
    shop: shopResult.sent,
    staff: false,
    errors,
  };
}
