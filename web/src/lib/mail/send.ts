import nodemailer from 'nodemailer';

type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || user;

  if (!user || !pass) return null;
  return { host, port, user, pass, from };
}

export function isMailConfigured(): boolean {
  return Boolean(getSmtpConfig());
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const smtp = getSmtpConfig();
  if (!smtp) {
    throw new Error('尚未設定 SMTP（請在 .env.local 加入 SMTP_USER / SMTP_PASS）');
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
}

export async function sendEmailSafe(params: SendEmailParams): Promise<{ sent: boolean; error?: string }> {
  try {
    await sendEmail(params);
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '寄信失敗';
    console.error('[mail]', message, params.subject);
    return { sent: false, error: message };
  }
}
