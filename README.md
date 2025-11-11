# OTP Auto Auth

Модуль авторизации для MVP веб-приложения с двумя каналами входа:

- Telegram Login Widget (SSO без OTP)
- WhatsApp OTP через Cloud API Meta

Репозиторий содержит бэкенд (Next.js Route Handlers, Prisma) и фронтенд (/login) с переключаемыми вкладками.

## Стек

- Next.js 16 (App Router, TypeScript)
- Prisma ORM + PostgreSQL
- JWT (подпись на сервере, cookie HttpOnly)
- Tailwind CSS 4 для UI

## Структура проекта

```
app/
  prisma/
    schema.prisma
  src/
    server/           # серверная логика, Prisma, конфиги
    web/              # UI и клиентские компоненты
    app/              # Next.js маршруты (API + /login)
  tests/
    e2e/
      auth_wa_otp.spec.ts
      auth_tg_sso.spec.ts
```

## Подготовка окружения

1. Установите зависимости:

   ```bash
   npm install
   ```

2. Создайте `.env` на основе `.env.example` и заполните секреты:

   - `DATABASE_URL` — строка подключения PostgreSQL
   - `JWT_SECRET` — длинный секрет (≥32 символов)
   - `TG_*` — параметры Telegram бота
   - `WA_*` — токен и шаблон WhatsApp Cloud API
   - `NEXT_PUBLIC_*` — значения, доступные на клиенте (бот, URL)

3. Настройте Prisma:

   ```bash
   npx prisma db push   # или prisma migrate dev
   npx prisma generate
   ```

## Запуск

```bash
npm run dev      # http://localhost:3000
npm run build
npm run start
```

## API эндпойнты

| Метод | Путь                 | Назначение                    |
|-------|----------------------|-------------------------------|
| POST  | `/api/auth/tg-login` | Вход по Telegram SSO          |
| POST  | `/api/auth/request`  | Запрос OTP (WhatsApp)         |
| POST  | `/api/auth/verify`   | Подтверждение OTP             |
| GET   | `/api/auth/status`   | Проверка статуса сессии OTP   |
| POST  | `/api/tg/webhook`    | Заглушка вебхука Telegram     |

Ответы соответствуют ТЗ (поле `error` с кодами `invalid_signature`, `expired`, `invalid_otp` и т.д.).

## Логика

- Telegram: проверка подписи HMAC, TTL ≤ 60 секунд, валидация `origin`, создания пользователя и JWT cookie.
- WhatsApp: генерация 6-значного OTP, шифрование Argon2, сессии `AuthSession`, лимиты попыток (≤5), rate-limit 5/номер и 10/IP в час.
- Ошибки отправки WhatsApp логируются в `AuditLog` и `console` (Sentry — TODO).
- Все логины пишутся в `LoginEvent` (канал, IP, user-agent).

### Переключение провайдеров

Задайте `AUTH_PROVIDERS` (сервер) и `NEXT_PUBLIC_AUTH_PROVIDERS` (клиент) списком через запятую (`tg`, `wa`), чтобы включать/выключать каналы.

## Тесты

Папка `tests/e2e` содержит заготовки сценариев (Playwright/Cypress). Для запуска заполните инструментарий под выбранный раннер.

Юнит-тесты для верификации подписи Telegram и OTP можно добавлять, подключив Jest/Vitest по необходимости.

## Деплой

- Railway/Vercel: настройте переменные окружения и подключение к PostgreSQL.
- Миграции: `npx prisma migrate deploy` на этапе запуска.
- Убедитесь, что домены Telegram (`TG_ALLOWED_ORIGIN`) и API совпадают с прод-конфигурацией.
