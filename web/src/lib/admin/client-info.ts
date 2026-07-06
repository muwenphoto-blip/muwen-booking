import type { NextRequest } from 'next/server';

export type AdminClientInfo = {
  userAgent: string;
  clientIp: string;
  deviceLabel: string;
  locationLabel: string;
};

function decodeHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDeviceLabel(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) return '未知裝置';

  let os = '未知系統';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = /Mobile/i.test(ua) ? 'Android 手機' : 'Android 平板';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '瀏覽器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  return `${os} · ${browser}`;
}

function readClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    ''
  );
}

function formatLocationLabel(request: NextRequest, clientIp: string): string {
  const city = decodeHeader(request.headers.get('x-vercel-ip-city'));
  const region = decodeHeader(request.headers.get('x-vercel-ip-country-region'));
  const country = decodeHeader(request.headers.get('x-vercel-ip-country'));
  const parts = [city, region, country].filter(Boolean);
  if (parts.length) return parts.join(' · ');

  if (!clientIp || clientIp === '::1' || clientIp.startsWith('127.')) return '本機';
  return clientIp;
}

export function readAdminClientInfo(request: NextRequest): AdminClientInfo {
  const userAgent = request.headers.get('user-agent') || '';
  const clientIp = readClientIp(request);
  return {
    userAgent,
    clientIp,
    deviceLabel: parseDeviceLabel(userAgent),
    locationLabel: formatLocationLabel(request, clientIp),
  };
}
