import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '../config';

interface TelegramMessage {
  chat?: {
    id: number | string;
  };
  text?: string;
}

export async function handleTelegramWebhook(req: NextRequest) {
  const update = await req.json().catch(() => null);
  if (!update) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (update.message) {
      await handleMessage(update.message as TelegramMessage);
    }
  } catch (error) {
    console.error('Telegram webhook handler error', error);
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: TelegramMessage) {
  const config = getConfig();
  const token = config.TG_BOT_TOKEN;
  if (!token) {
    console.warn('TG_BOT_TOKEN is not configured, skip webhook reply');
    return;
  }

  const chatId = message.chat?.id;
  if (!chatId) return;

  const text: string | undefined = message.text;
  const normalizedText = text?.trim().toLowerCase();

  if (normalizedText === '/start') {
    await sendMessage(
      token,
      chatId,
      'Привет! Я бот авторизации OTPA UTO. Я используюсь только для подтверждения входа и не храню личную информацию. '
        + 'Если вы видите это сообщение, вернитесь в браузер и завершите авторизацию.\n\n'
        + 'Если это были не вы, проигнорируйте запрос.',
    );
    return;
  }

  // На любые другие сообщения отправляем краткое пояснение.
  await sendMessage(
    token,
    chatId,
    'Этот бот работает только как инструмент авторизации и не поддерживает переписку. '
      + 'При необходимости свяжитесь с поддержкой сервиса напрямую.',
  );
}

async function sendMessage(token: string, chatId: number | string, text: string) {
  const url = new URL(`https://api.telegram.org/bot${token}/sendMessage`);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((error) => {
    console.error('Failed to send Telegram message', error);
  });
}
