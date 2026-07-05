import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password: string) {
  const text = String(password || '').trim();
  if (text.length < 8) {
    throw new Error('密碼至少 8 字');
  }
}
