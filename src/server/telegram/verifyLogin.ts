import crypto from 'node:crypto';

export interface TelegramLoginPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  [key: string]: unknown;
}

interface VerifyOptions {
  secret: string;
  now?: number;
  maxAgeSeconds?: number;
}

export function verifyTelegramLogin(
  payload: TelegramLoginPayload,
  options: VerifyOptions,
): boolean {
  const { secret, now = Date.now(), maxAgeSeconds = 60 } = options;

  if (!payload?.hash || !payload?.auth_date) {
    return false;
  }

  const receivedHash = payload.hash;
  const data = { ...payload } as Record<string, unknown>;
  delete data.hash;

  const dataCheckString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');

  const hmac = crypto
    .createHmac('sha256', resolveSecret(secret))
    .update(dataCheckString)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(receivedHash))) {
    return false;
  }

  const ageSeconds = Math.abs(now / 1000 - Number(payload.auth_date));
  if (ageSeconds > maxAgeSeconds) {
    return false;
  }

  return true;
}

function resolveSecret(secret: string) {
  if (secret.startsWith('-----')) {
    return secret;
  }

  if (secret.length === 64 && /^[0-9a-f]+$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  return crypto.createHash('sha256').update(secret).digest();
}
