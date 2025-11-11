import { NextRequest, NextResponse } from 'next/server';

export async function handleTelegramWebhook(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.log('TG webhook event', JSON.stringify(body));
  // TODO: Обработка Telegram webhook по мере необходимости

  return NextResponse.json({ ok: true });
}
