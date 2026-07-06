import { SignJWT, jwtVerify } from 'jose';

export type PhotoAccessScope = 'admin' | 'guest';

export type PhotoAccessClaims = {
  scope: PhotoAccessScope;
  photoId: string;
  deliveryId: string;
  bookingId?: string;
  slug?: string;
};

const TTL_SEC = 60 * 30;

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('缺少 ADMIN_SESSION_SECRET');
  }
  return new TextEncoder().encode(secret);
}

export async function signPhotoAccessToken(claims: PhotoAccessClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEC}s`)
    .sign(getSecret());
}

export async function verifyPhotoAccessToken(token: string): Promise<PhotoAccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.scope || !payload.photoId || !payload.deliveryId) return null;
    return {
      scope: payload.scope as PhotoAccessScope,
      photoId: String(payload.photoId),
      deliveryId: String(payload.deliveryId),
      bookingId: payload.bookingId ? String(payload.bookingId) : undefined,
      slug: payload.slug ? String(payload.slug) : undefined,
    };
  } catch {
    return null;
  }
}
