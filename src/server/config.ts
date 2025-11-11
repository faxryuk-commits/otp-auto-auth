import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET должен быть не короче 32 символов'),
  JWT_TTL: z.string().default('7d'),
  TG_BOT_TOKEN: z.string().optional(),
  TG_BOT_NAME: z.string().optional(),
  TG_BOT_SECRET: z.string().optional(),
  TG_ALLOWED_ORIGIN: z.string().optional(),
  TG_WEBHOOK_URL: z.string().url().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_TEMPLATE_NAME: z.string().optional(),
  WA_TEMPLATE_LANG: z.string().optional(),
  APP_URL: z.string().optional(),
  API_URL: z.string().optional(),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default(process.env.NODE_ENV ?? 'development'),
  AUTH_PROVIDERS: z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(',').map((v) => v.trim()) : ['tg', 'wa'],
    ),
  RATE_LIMIT_PHONE_HOURLY: z.coerce.number().default(5),
  RATE_LIMIT_IP_HOURLY: z.coerce.number().default(10),
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = configSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_TTL: process.env.JWT_TTL,
    TG_BOT_TOKEN: process.env.TG_BOT_TOKEN,
    TG_BOT_NAME: process.env.TG_BOT_NAME,
    TG_BOT_SECRET: process.env.TG_BOT_SECRET,
    TG_ALLOWED_ORIGIN: process.env.TG_ALLOWED_ORIGIN,
    TG_WEBHOOK_URL: process.env.TG_WEBHOOK_URL,
    WA_ACCESS_TOKEN: process.env.WA_ACCESS_TOKEN,
    WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID,
    WA_TEMPLATE_NAME: process.env.WA_TEMPLATE_NAME,
    WA_TEMPLATE_LANG: process.env.WA_TEMPLATE_LANG,
    APP_URL: process.env.APP_URL,
    API_URL: process.env.API_URL,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_PROVIDERS: process.env.AUTH_PROVIDERS,
    RATE_LIMIT_PHONE_HOURLY: process.env.RATE_LIMIT_PHONE_HOURLY,
    RATE_LIMIT_IP_HOURLY: process.env.RATE_LIMIT_IP_HOURLY,
  });

  if (!parsed.success) {
    const error = parsed.error.flatten();
    throw new Error(
      `Некорректные переменные окружения: ${JSON.stringify(error.fieldErrors)}`,
    );
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
