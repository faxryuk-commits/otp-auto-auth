import { z } from 'zod';
import { prisma } from '../db';
import { hashToken } from '../auth/hash';
import { sendOtp } from '../whatsapp/sendOtp';
import { HttpError } from './httpError';
import { checkRateLimit } from '../auth/rateLimit';
import { getConfig } from '../config';
import { generateOtp, OTP_TTL_SECONDS } from '../auth/otp';

const requestSchema = z.object({
  phone: z
    .string()
    .regex(/^\+\d{8,15}$/, 'Неверный формат номера телефона (ожидается E.164)'),
});

interface RequestOtpParams {
  body: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function handleAuthRequest({
  body,
  ip,
  userAgent,
}: RequestOtpParams) {
  ensureProviderEnabled('wa');
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_phone');
  }

  const { phone } = parsed.data;
  if (!checkRateLimit(`phone:${phone}`)) {
    throw new HttpError(429, 'rate_limited');
  }
  if (ip && !checkRateLimit(`ip:${ip}`)) {
    throw new HttpError(429, 'rate_limited');
  }

  const otp = generateOtp();
  const tokenHash = await hashToken(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  const session = await prisma.authSession.create({
    data: {
      channel: 'wa',
      phone,
      tokenHash,
      expiresAt,
      state: 'pending',
    },
  });

  const { success } = await sendOtp(phone, otp);
  if (!success) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        state: 'expired',
      },
    });
    throw new HttpError(400, 'send_failed');
  }

  await prisma.loginEvent.create({
    data: {
      userId: session.userId ?? null,
      channel: 'wa',
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  return {
    session_id: session.id,
    expires_in: OTP_TTL_SECONDS,
  };
}

function ensureProviderEnabled(provider: 'tg' | 'wa' | 'tg-otp') {
  const config = getConfig();
  if (!config.AUTH_PROVIDERS.includes(provider)) {
    throw new HttpError(404, 'not_found');
  }
}
