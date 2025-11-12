import { z } from 'zod';
import { prisma } from '../db';
import { HttpError } from './httpError';

const statusSchema = z.object({
  session_id: z.string(),
});

export async function handleAuthStatus(query: Record<string, string | string[] | undefined>) {
  const parsed = statusSchema.safeParse({
    session_id: Array.isArray(query.session_id)
      ? query.session_id[0]
      : query.session_id,
  });

  if (!parsed.success) {
    throw new HttpError(400, 'not_found');
  }

  const { session_id } = parsed.data;
  const session = await prisma.authSession.findUnique({
    where: { id: session_id },
  });

  if (!session) {
    throw new HttpError(404, 'not_found');
  }

  if (session.expiresAt.getTime() < Date.now() && session.state === 'pending') {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { state: 'expired' },
    });
    return { state: 'expired', channel: session.channel, phone: session.phone ?? undefined };
  }

  return {
    state: session.state,
    channel: session.channel,
    phone: session.phone ?? undefined,
  };
}
