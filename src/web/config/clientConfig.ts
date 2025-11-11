'use client';

export const clientConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '/app',
  telegramBotName: process.env.NEXT_PUBLIC_TG_BOT_NAME ?? '',
  providers: (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? 'tg,wa')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean) as Array<'tg' | 'wa'>,
};
