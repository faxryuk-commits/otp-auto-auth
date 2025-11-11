import { z } from 'zod';
import { prisma } from '../db';
import { HttpError } from './httpError';
import { getConfig } from '../config';
import {
  TelegramLoginPayload,
  verifyTelegramLogin,
} from '../telegram/verifyLogin';
import { createJwt } from '../auth/createJwt';

const telegramLoginSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

interface TgLoginParams {
  body: unknown;
  origin?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function handleTelegramLogin({
  body,
  origin,
  ip,
  userAgent,
}: TgLoginParams) {
  ensureProviderEnabled('tg');
  const config = getConfig();

  if (config.TG_ALLOWED_ORIGIN && config.TG_ALLOWED_ORIGIN !== origin) {
    throw new HttpError(400, 'origin');
  }

  const parsed = telegramLoginSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_signature');
  }

  const payload = parsed.data as TelegramLoginPayload;
  const secret = config.TG_BOT_SECRET ?? config.TG_BOT_TOKEN;
  if (!secret) {
    throw new HttpError(500, 'server_error', 'Telegram secret не задан');
  }

  const isValid = verifyTelegramLogin(payload, { secret });
  if (!isValid) {
    throw new HttpError(400, 'invalid_signature');
  }

  const user = await prisma.user.upsert({
    where: { telegramUserId: String(payload.id) },
    update: {
      name: payload.first_name
        ? [payload.first_name, payload.last_name ?? ''].join(' ').trim()
        : undefined,
      username: payload.username ?? undefined,
    },
    create: {
      telegramUserId: String(payload.id),
      name: payload.first_name
        ? [payload.first_name, payload.last_name ?? ''].join(' ').trim()
        : undefined,
      username: payload.username ?? undefined,
    },
  });

  await prisma.loginEvent.create({
    data: {
      userId: user.id,
      channel: 'tg',
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  const token = await createJwt({ sub: user.id, channel: 'tg' }, { setCookie: true });

  return {
    token,
    user: {
      id: user.id,
      telegramUserId: user.telegramUserId,
      name: user.name,
      username: user.username,
    },
  };
}

function ensureProviderEnabled(provider: 'tg' | 'wa') {
  const config = getConfig();
  if (!config.AUTH_PROVIDERS.includes(provider)) {
    throw new HttpError(404, 'not_found');
  }
}
