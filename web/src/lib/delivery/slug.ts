import { randomBytes } from 'node:crypto';

export function generateDeliverySlug(): string {
  return randomBytes(12).toString('base64url');
}
