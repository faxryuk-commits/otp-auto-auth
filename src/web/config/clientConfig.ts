'use client';

const rawProviders = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? 'tg,wa')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

export const clientConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '/app',
  telegramBotName: process.env.NEXT_PUBLIC_TG_BOT_NAME ?? '',
  providers: rawProviders
    .map((provider) => (provider === 'tg-otp' ? 'tg' : provider))
    .filter((provider): provider is 'tg' | 'wa' => provider === 'tg' || provider === 'wa'),
};
