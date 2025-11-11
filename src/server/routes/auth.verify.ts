import { z } from 'zod';
import { prisma } from '../db';
import { verifyToken } from '../auth/hash';
import { HttpError } from './httpError';
import { createJwt } from '../auth/createJwt';
import { getConfig } from '../config';

const verifySchema = z.object({
  phone: z.string().optional(),
  otp: z.string().length(6),
  session_id: z.string().optional(),
  channel: z.enum(['wa', 'tg-otp']).default('wa'),
});

interface VerifyParams {
  body: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function handleAuthVerify({ body, ip, userAgent }: VerifyParams) {
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_otp');
  }

  const { phone, otp, session_id, channel } = parsed.data;
  ensureProviderEnabled(channel);

  if (!phone && !session_id) {
    throw new HttpError(400, 'not_found');
  }

  const session = await prisma.authSession.findFirst({
    where: {
      channel,
      state: 'pending',
      ...(phone ? { phone } : {}),
      ...(session_id ? { id: session_id } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!session || !session.tokenHash) {
    throw new HttpError(400, 'not_found');
  }

  if (session.attempts >= 5) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { state: 'expired' },
    });
    throw new HttpError(400, 'invalid_otp');
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { state: 'expired' },
    });
    throw new HttpError(400, 'expired');
  }

  const isValid = await verifyToken(session.tokenHash, otp);
  if (!isValid) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        attempts: { increment: 1 },
      },
    });
    throw new HttpError(400, 'invalid_otp');
  }

  let user;
  if (channel === 'wa') {
    user = await prisma.user.upsert({
      where: { waPhone: phone ?? session.phone ?? undefined },
      update: {
        updatedAt: new Date(),
      },
      create: {
        waPhone: phone ?? session.phone ?? undefined,
      },
    });
  } else {
    if (!session.telegramUserId) {
      throw new HttpError(400, 'not_ready');
    }
    user = await prisma.user.upsert({
      where: { telegramUserId: session.telegramUserId },
      update: {
        phone: session.phone ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        telegramUserId: session.telegramUserId,
        phone: session.phone ?? undefined,
      },
    });
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      state: 'confirmed',
      userId: user.id,
      tokenHash: null,
    },
  });

  await prisma.loginEvent.create({
    data: {
      userId: user.id,
      channel: channel === 'wa' ? 'wa' : 'tg',
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  const token = await createJwt({ sub: user.id, channel: channel === 'wa' ? 'wa' : 'tg' }, { setCookie: true });

  return {
    token,
    user: {
      id: user.id,
      waPhone: channel === 'wa' ? user.waPhone : undefined,
      phone: channel === 'tg-otp' ? user.phone : undefined,
      telegramUserId: channel === 'tg-otp' ? user.telegramUserId : undefined,
    },
  };
}

function ensureProviderEnabled(channel: 'wa' | 'tg-otp') {
  const config = getConfig();
  if (!config.AUTH_PROVIDERS.includes(channel)) {
    throw new HttpError(404, 'not_found');
  }
}
