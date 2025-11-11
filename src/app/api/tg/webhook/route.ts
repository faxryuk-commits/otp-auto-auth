import { NextRequest } from 'next/server';
import { handleTelegramWebhook } from '@/server/telegram/webhook';

export async function POST(req: NextRequest) {
  return handleTelegramWebhook(req);
}
