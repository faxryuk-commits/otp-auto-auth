import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../db';
import { getConfig } from '../config';
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
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
  };
}

export async function handleTelegramWebhook(req: NextRequest) {
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (update.callback_query) {
      await answerCallback(update.callback_query.id);
      return NextResponse.json({ ok: true });
    }

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
      'Не удалось найти сессию. Запросите авторизацию на сайте и откройте ссылку снова.',
    );
    return;
  }

  const session = await prisma.authSession.findUnique({
    where: { sessionToken: token },
  });

  if (!session || session.channel !== 'tg-otp' || session.state !== 'pending') {
    await sendMessage(
      String(chatId),
      'Сессия не найдена или уже подтверждена. Запросите код заново на сайте OTPA UTO.',
    );
    return;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      telegramChatId: String(chatId),
      telegramUserId: session.telegramUserId ?? (message.from?.id ? String(message.from.id) : null),
    },
  });

  await sendMessage(
    String(chatId),
    'Нажмите «Поделиться номером» или отправьте его вручную, чтобы получить код подтверждения.',
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
    await sendMessage(String(chatId), 'Не удалось определить номер телефона. Попробуйте ещё раз.');
    return;
  }

  await issueOtpForSession(session.id, {
    chatId: String(chatId),
    phone,
    telegramUserId: session.telegramUserId ?? (message.from?.id ? String(message.from.id) : undefined),
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

  const candidate = text.startsWith('+') ? text : `+${text}`;
  const phone = formatPhone(candidate);
  if (!phone) {
    await sendMessage(String(chatId), 'Укажите номер в международном формате, например +9715XXXXXX.');
    return;
  }

  await issueOtpForSession(session.id, {
    chatId: String(chatId),
    phone,
    telegramUserId: session.telegramUserId ?? (message.from?.id ? String(message.from.id) : undefined),
  });
}

async function issueOtpForSession(
  sessionId: string,
  {
    chatId,
    phone,
    telegramUserId,
  }: { chatId: string; phone: string; telegramUserId?: string },
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

  const config = getConfig();
  const appUrl = config.APP_URL || config.API_URL || 'https://otp-auto-auth.vercel.app';

  await sendMessage(
    chatId,
    `${otp} — ваш код для входа в OTPA UTO. Он будет действителен ${OTP_TTL_SECONDS / 60} минут.`,
    {
      inline_keyboard: [
        [
          {
            text: `Скопировать ${otp}`,
            url: `tg://copy?text=${otp}`,
          },
          {
            text: 'Открыть OTPA UTO',
            url: appUrl,
          },
        ],
      ],
    },
  );
}

async function sendMessage(
  chatId: string,
  text: string,
  replyMarkup?: unknown,
) {
  const config = getConfig();
  if (!config.TG_BOT_TOKEN) {
    console.warn('TG_BOT_TOKEN не задан, сообщение не отправлено');
    return;
  }

  const url = new URL(`https://api.telegram.org/bot${config.TG_BOT_TOKEN}/sendMessage`);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    }),
  }).catch((error) => {
    console.error('Не удалось отправить сообщение Telegram', error);
  });
}

async function answerCallback(callbackId: string) {
  const config = getConfig();
  if (!config.TG_BOT_TOKEN) return;

  const url = new URL(`https://api.telegram.org/bot${config.TG_BOT_TOKEN}/answerCallbackQuery`);
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  }).catch((error) => console.error('answerCallbackQuery error', error));
}

function formatPhone(input: string) {
  const sanitized = input.replace(/\s+/g, '');
  if (!/^\+\d{8,15}$/.test(sanitized)) {
    return null;
  }
  return sanitized;
}
