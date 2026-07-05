import { SignJWT, jwtVerify } from 'jose';

export type AdminRole = '主' | '副主' | '副';

export type AdminSession = {
  userId: string;
  account: string;
  role: AdminRole;
  photographerName: string;
  sessionId: string;
};

const COOKIE_NAME = 'muwen_admin_session';
const MAX_AGE_SEC = 60 * 60 * 12;

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('缺少 ADMIN_SESSION_SECRET');
  }
  return new TextEncoder().encode(secret);
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function getSessionMaxAgeSec() {
  return MAX_AGE_SEC;
}

export async function signSession(session: AdminSession): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.userId || !payload.account || !payload.role) {
      return null;
    }
    return {
      userId: String(payload.userId),
      account: String(payload.account),
      role: payload.role as AdminRole,
      photographerName: String(payload.photographerName || ''),
      sessionId: String(payload.sessionId || ''),
    };
  } catch {
    return null;
  }
}

export function formatRoleLabel(role: AdminRole): string {
  if (role === '主') return '主控';
  if (role === '副主') return '副主控';
  return '攝影師';
}

export function isManagerRole(role: AdminRole): boolean {
  return role === '主' || role === '副主';
}
