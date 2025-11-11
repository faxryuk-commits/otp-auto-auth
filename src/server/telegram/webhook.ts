import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '../config';
import { prisma } from '../db';
import { generateOtp, OTP_TTL_SECONDS } from '../auth/otp';
import { hashToken } from '../auth/hash';

interface TelegramChat {
  id: number | string;
}

interface TelegramFrom {
  id: number | string;
  first_name?: string;
  username?: string;
}

interface TelegramContact {
  phone_number: string;
}

interface TelegramMessage {
  chat?: TelegramChat;
  from?: TelegramFrom;
  text?: string;
  contact?: TelegramContact;
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

export async function handleTelegramWebhook(req: NextRequest) {
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error('Telegram webhook handler error', error);
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(message: TelegramMessage) {
  const text = message.text?.trim();

  if (text?.startsWith('/start')) {
    const [, token] = text.split(' ');
    await handleStartCommand(token, message);
    return;
  }

  if (message.contact) {
    await handleContact(message);
    return;
  }

  if (text && /^\+?\d{5,}$/.test(text)) {
    await handlePhoneText(message, text);
    return;
  }

  // На прочие сообщения просто напоминаем о правилах.
  if (message.chat?.id) {
    await sendMessage(
      String(message.chat.id),
      'Используйте ссылку авторизации на сайте и поделитесь номером телефона через кнопку, чтобы получить код.',
    );
  }
}

async function handleStartCommand(token: string | undefined, message: TelegramMessage) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  if (!token) {
    await sendMessage(
      String(chatId),
      'Не удалось найти сессию. Запросите авторизацию на сайте и перейдите по ссылке повторно.',
    );
    return;
  }

  const session = await prisma.authSession.findUnique({
    where: { sessionToken: token },
  });

  if (!session || session.channel !== 'tg-otp' || session.state !== 'pending') {
    await sendMessage(
      String(chatId),
      'Сессия не найдена или уже использована. Запросите код заново на сайте OTPA UTO.',
    );
    return;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      telegramChatId: String(chatId),
      telegramUserId: message.from?.id ? String(message.from.id) : session.telegramUserId,
    },
  });

  await sendMessage(
    String(chatId),
    'Нажмите кнопку «Поделиться номером» или отправьте номер вручную, чтобы получить код подтверждения.',
    {
      keyboard: [
        [
          {
            text: 'Поделиться номером',
            request_contact: true,
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  );
}

async function handleContact(message: TelegramMessage) {
  const chatId = message.chat?.id;
  if (!chatId || !message.contact) return;

  const session = await prisma.authSession.findFirst({
    where: {
      channel: 'tg-otp',
      state: 'pending',
      telegramChatId: String(chatId),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    await sendMessage(
      String(chatId),
      'Не удалось найти активную сессию. Запросите код заново на сайте.',
    );
    return;
  }

  const phone = formatPhone(`+${message.contact.phone_number.replace(/[^\d]/g, '')}`);
  if (!phone) {
    await sendMessage(String(chatId), 'Не удалось прочитать номер телефона. Попробуйте ещё раз.');
    return;
  }

  await issueOtpForSession(session.id, {
    chatId: String(chatId),
    telegramUserId: session.telegramUserId ?? (message.from?.id ? String(message.from.id) : undefined),
    phone,
  });
}

async function handlePhoneText(message: TelegramMessage, text: string) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const session = await prisma.authSession.findFirst({
    where: {
      channel: 'tg-otp',
      state: 'pending',
      telegramChatId: String(chatId),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    await sendMessage(
      String(chatId),
      'Не удалось найти активную сессию. Запросите код заново на сайте.',
    );
    return;
  }

  const phoneCandidate = text.startsWith('+') ? text : `+${text}`;
  const phone = formatPhone(phoneCandidate);
  if (!phone) {
    await sendMessage(String(chatId), 'Пожалуйста, отправьте номер в международном формате, например +9715XXXXXX.');
    return;
  }

  await issueOtpForSession(session.id, {
    chatId: String(chatId),
    telegramUserId: session.telegramUserId ?? (message.from?.id ? String(message.from.id) : undefined),
    phone,
  });
}

async function issueOtpForSession(
  sessionId: string,
  {
    chatId,
    telegramUserId,
    phone,
  }: { chatId: string; telegramUserId?: string; phone: string },
) {
  const otp = generateOtp();

  await prisma.authSession.update({
    where: { id: sessionId },
    data: {
      phone,
      telegramChatId: chatId,
      telegramUserId,
      tokenHash: await hashToken(otp),
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    },
  });

  await sendMessage(
    chatId,
    `Ваш код для входа: ${otp}\nОн будет действителен ${OTP_TTL_SECONDS / 60} минут. Введите его на сайте OTPA UTO.`,
  );
}

async function sendMessage(chatId: string, text: string, replyMarkup?: unknown) {
  const config = getConfig();
  const token = config.TG_BOT_TOKEN;
  if (!token) {
    console.warn('TG_BOT_TOKEN is not configured; skip sendMessage');
    return;
  }

  const url = new URL(`https://api.telegram.org/bot${token}/sendMessage`);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  }).catch((error) => {
    console.error('Failed to send Telegram message', error);
  });
}

function formatPhone(input: string) {
  const sanitized = input.replace(/\s+/g, '');
  if (!/^\+\d{8,15}$/.test(sanitized)) {
    return null;
  }
  return sanitized;
}
