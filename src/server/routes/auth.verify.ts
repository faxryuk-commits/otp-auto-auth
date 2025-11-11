import { z } from 'zod';
import { prisma } from '../db';
import { verifyToken } from '../auth/hash';
import { HttpError } from './httpError';
import { createJwt } from '../auth/createJwt';
import { getConfig } from '../config';

const verifySchema = z.object({
  phone: z.string(),
  otp: z.string().length(6),
});

interface VerifyParams {
  body: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function handleAuthVerify({ body, ip, userAgent }: VerifyParams) {
  ensureProviderEnabled('wa');
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_otp');
  }

  const { phone, otp } = parsed.data;

  const session = await prisma.authSession.findFirst({
    where: {
      phone,
      channel: 'wa',
      state: 'pending',
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

  const user = await prisma.user.upsert({
    where: { waPhone: phone },
    update: {
      updatedAt: new Date(),
    },
    create: {
      waPhone: phone,
    },
  });

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
      channel: 'wa',
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  const token = await createJwt({ sub: user.id, channel: 'wa' }, { setCookie: true });

  return {
    token,
    user: {
      id: user.id,
      waPhone: user.waPhone,
    },
  };
}

function ensureProviderEnabled(provider: 'tg' | 'wa') {
  const config = getConfig();
  if (!config.AUTH_PROVIDERS.includes(provider)) {
    throw new HttpError(404, 'not_found');
  }
}
