import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError } from './httpError';
import { getConfig } from '../config';
import { OTP_TTL_SECONDS } from '../auth/otp';

const requestSchema = z.object({
  phone: z
    .string()
    .regex(/^\+\d{8,15}$/, 'Неверный формат номера телефона (ожидается E.164)')
    .optional(),
});

interface TelegramOtpParams {
  body: unknown;
}

export async function handleTelegramOtpRequest({ body }: TelegramOtpParams) {
  ensureProviderEnabled();

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_phone');
  }

  const { phone } = parsed.data;
  const sessionToken = crypto.randomBytes(12).toString('hex');

  const session = await prisma.authSession.create({
    data: {
      channel: 'tg-otp',
      phone,
      state: 'pending',
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      sessionToken,
    },
  });

  const botLink = buildBotLink(sessionToken);

  return {
    session_id: session.id,
    bot_link: botLink,
    expires_in: OTP_TTL_SECONDS,
  };
}

function buildBotLink(token: string) {
  const config = getConfig();
  const botName = config.TG_BOT_NAME;
  if (!botName) {
    throw new HttpError(500, 'server_error', 'TG_BOT_NAME не задан');
  }
  const normalized = botName.startsWith('@') ? botName.slice(1) : botName;
  return `https://t.me/${normalized}?start=${token}`;
}

function ensureProviderEnabled() {
  const config = getConfig();
  if (!config.AUTH_PROVIDERS.includes('tg-otp')) {
    throw new HttpError(404, 'not_found');
  }
}
