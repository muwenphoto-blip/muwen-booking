import { SignJWT, jwtVerify } from 'jose';

export type DeliveryGuestSession = {
  deliveryId: string;
  slug: string;
};

const COOKIE_NAME = 'muwen_delivery_session';
const MAX_AGE_SEC = 60 * 60 * 8;

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('缺少 ADMIN_SESSION_SECRET');
  }
  return new TextEncoder().encode(secret);
}

export function getDeliverySessionCookieName() {
  return COOKIE_NAME;
}

export function getDeliverySessionMaxAgeSec() {
  return MAX_AGE_SEC;
}

export async function signDeliverySession(session: DeliveryGuestSession): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(getSecret());
}

export async function verifyDeliverySessionToken(
  token: string,
): Promise<DeliveryGuestSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.deliveryId || !payload.slug) return null;
    return {
      deliveryId: String(payload.deliveryId),
      slug: String(payload.slug),
    };
  } catch {
    return null;
  }
}
