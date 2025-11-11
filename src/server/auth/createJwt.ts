import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { getConfig } from '../config';

interface JwtPayload {
  sub: string;
  channel: 'tg' | 'wa';
}

export async function createJwt(
  payload: JwtPayload,
  options?: { setCookie?: boolean },
): Promise<string> {
  const config = getConfig();
  const token = jwt.sign(payload, config.JWT_SECRET, {
    issuer: config.API_URL ?? 'auth-service',
    audience: config.APP_URL ?? 'app',
    expiresIn: config.JWT_TTL ?? '7d',
  });

  if (options?.setCookie) {
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: parseJwtTtl(config.JWT_TTL ?? '7d'),
      path: '/',
    });
  }

  return token;
}

function parseJwtTtl(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 60 * 60 * 24 * 7;
  }
  const [, amountRaw, unit] = match;
  const amount = Number(amountRaw);
  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    default:
      return 60 * 60 * 24 * 7;
  }
}
