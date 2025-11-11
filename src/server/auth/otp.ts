import crypto from 'node:crypto';

export const OTP_TTL_SECONDS = 5 * 60;

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
