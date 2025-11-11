'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramLoginButton } from '@/web/components/TelegramLoginButton';
import { clientConfig } from '@/web/config/clientConfig';

type Tab = 'tg' | 'wa';

interface ErrorResponse {
  error?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const availableTabs = useMemo<Tab[]>(() => {
    const providers = clientConfig.providers.length
      ? clientConfig.providers
      : (['tg', 'wa'] as Tab[]);
    const unique = Array.from(new Set(providers));
    return unique.filter((tab) => tab === 'tg' || tab === 'wa');
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>(availableTabs[0] ?? 'tg');

  const [tgLoading, setTgLoading] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);
  const [tgPhone, setTgPhone] = useState('');

  const [phone, setPhone] = useState('+971');
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState('');
  const [waStep, setWaStep] = useState<'request' | 'verify'>('request');
  const [waError, setWaError] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, expiresAt - Date.now());
      setTimeLeft(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTimeLeft = () => {
    const totalSeconds = Math.floor(timeLeft / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(1, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleTelegramAuth = useCallback(
    async (payload: Record<string, unknown>) => {
      setTgLoading(true);
      setTgError(null);
      try {
        const normalizedPhone = tgPhone ? formatPhone(tgPhone) : null;
        if (tgPhone && !normalizedPhone) {
          setTgError('Укажите корректный номер телефона в формате +XXXXXXXXXXX.');
          return;
        }

        const response = await fetch('/api/auth/tg-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            normalizedPhone
              ? { ...payload, phone: normalizedPhone }
              : payload,
          ),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as ErrorResponse;
          setTgError(mapErrorCode(data.error));
          return;
        }

        router.push(clientConfig.appUrl);
      } catch (error) {
        console.error('Telegram login error', error);
        setTgError('Не удалось выполнить вход. Попробуйте ещё раз.');
      } finally {
        setTgLoading(false);
      }
    },
    [router, tgPhone],
  );

  const submitPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (waLoading) return;
    setWaError(null);

    if (!consent) {
      setWaError('Необходимо согласие на получение кода в WhatsApp.');
      return;
    }

    const normalizedPhone = formatPhone(phone);
    if (!normalizedPhone) {
      setWaError('Укажите корректный номер в формате +XXXXXXXXXXX.');
      return;
    }

    try {
      setWaLoading(true);
      const response = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | { session_id: string; expires_in: number }
        | ErrorResponse;

      if (!response.ok || !('session_id' in data)) {
        setWaError(mapErrorCode((data as ErrorResponse)?.error));
        return;
      }

      setSessionId(data.session_id);
      setExpiresAt(Date.now() + data.expires_in * 1000);
      setResendAvailableAt(Date.now() + 30_000);
      setWaStep('verify');
      setOtp('');
    } catch (error) {
      console.error('WA request error', error);
      setWaError('Не удалось отправить код. Повторите попытку.');
    } finally {
      setWaLoading(false);
    }
  };

  const submitOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (waLoading || !sessionId) return;
    setWaError(null);

    if (otp.length !== 6) {
      setWaError('Введите 6-значный код из WhatsApp.');
      return;
    }

    const normalizedPhone = formatPhone(phone);
    if (!normalizedPhone) {
      setWaError('Сессия устарела. Запросите код заново.');
      return;
    }

    try {
      setWaLoading(true);
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, otp }),
      });

      const data = (await response.json().catch(() => ({}))) as ErrorResponse;
      if (!response.ok) {
        setWaError(mapErrorCode(data.error));
        return;
      }

      router.push(clientConfig.appUrl);
    } catch (error) {
      console.error('WA verify error', error);
      setWaError('Не удалось подтвердить код. Попробуйте ещё раз.');
    } finally {
      setWaLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendAvailableAt && Date.now() < resendAvailableAt) return;
    setWaStep('request');
    setSessionId(null);
    setExpiresAt(null);
    setOtp('');
  };

  const onPhoneChange = (value: string) => {
    const sanitized = value.replace(/[^\d+]/g, '');
    if (!sanitized.startsWith('+')) {
      setPhone(`+${sanitized.replace(/\+/g, '')}`);
    } else {
      setPhone(`+${sanitized.slice(1).replace(/\+/g, '')}`);
    }
  };

  const onOtpChange = (value: string) => {
    const onlyDigits = value.replace(/\D/g, '').slice(0, 6);
    setOtp(onlyDigits);
  };

  const onTgPhoneChange = (value: string) => {
    const sanitized = value.replace(/[^\d+]/g, '');
    if (!sanitized.startsWith('+')) {
      setTgPhone(`+${sanitized.replace(/\+/g, '')}`);
    } else {
      setTgPhone(`+${sanitized.slice(1).replace(/\+/g, '')}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-12 px-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-xl">
        <h1 className="text-3xl font-semibold text-slate-900">Вход в приложение</h1>
        <p className="mt-2 text-sm text-slate-500">
          Выберите удобный способ авторизации: Telegram или WhatsApp.
        </p>

        <div className="mt-8 flex gap-2">
          {availableTabs.includes('tg') && (
            <button
              type="button"
              className={`flex-1 rounded-full px-5 py-2 text-sm font-medium transition ${
                activeTab === 'tg'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setActiveTab('tg')}
            >
              Telegram
            </button>
          )}
          {availableTabs.includes('wa') && (
            <button
              type="button"
              className={`flex-1 rounded-full px-5 py-2 text-sm font-medium transition ${
                activeTab === 'wa'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setActiveTab('wa')}
            >
              WhatsApp
            </button>
          )}
        </div>

        <div className="mt-10">
          {activeTab === 'tg' && (
            <section aria-live="polite" className="space-y-4">
              <h2 className="text-lg font-medium text-slate-900">
                Войти через Telegram
              </h2>
              <p className="text-sm text-slate-500">
                Мы не запрашиваем ваш номер телефона. Telegram подтверждает вашу личность
                автоматически.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Номер телефона (по желанию)
                  </label>
                  <input
                    type="tel"
                    value={tgPhone}
                    onChange={(event) => onTgPhoneChange(event.target.value)}
                    placeholder="+9715XXXXXXXX"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Укажите номер, чтобы мы могли связаться с вами позже. Поле необязательное.
                  </p>
                </div>
                {clientConfig.telegramBotName ? (
                  <TelegramLoginButton
                    botName={clientConfig.telegramBotName}
                    onAuth={handleTelegramAuth}
                    disabled={tgLoading}
                  />
                ) : (
                  <p className="text-sm text-amber-600">
                    Укажите переменную NEXT_PUBLIC_TG_BOT_NAME, чтобы отобразить виджет входа.
                  </p>
                )}
              </div>
              {tgLoading && (
                <p className="text-sm text-slate-500">Проверяем данные Telegram...</p>
              )}
              {tgError && <p className="text-sm text-rose-600">{tgError}</p>}
            </section>
          )}

          {activeTab === 'wa' && (
            <section aria-live="polite" className="space-y-6">
              <h2 className="text-lg font-medium text-slate-900">
                Получить код в WhatsApp
              </h2>
              <p className="text-sm text-slate-500">
                Мы отправим 6-значный OTP на ваш номер. Срок действия кода — 5 минут.
              </p>

              {waStep === 'request' && (
                <form className="space-y-5" onSubmit={submitPhone}>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Номер телефона
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => onPhoneChange(event.target.value)}
                      placeholder="+9715XXXXXXXX"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Поддерживаются номера в формате E.164.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    Согласен получать код в WhatsApp
                  </label>
                  <button
                    type="submit"
                    className="w-full rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    disabled={waLoading}
                  >
                    {waLoading ? 'Отправляем...' : 'Получить код'}
                  </button>
                </form>
              )}

              {waStep === 'verify' && (
                <form className="space-y-5" onSubmit={submitOtp}>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
                    Код отправлен на {formatPhone(phone) ?? phone}. Срок действия — 5 минут.
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Код из WhatsApp
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otp}
                      onChange={(event) => onOtpChange(event.target.value)}
                      placeholder="123456"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-widest shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Таймер: {formatTimeLeft()}</span>
                    <button
                      type="button"
                      onClick={resendOtp}
                      disabled={resendAvailableAt ? Date.now() < resendAvailableAt : false}
                      className="font-medium text-emerald-600 disabled:text-slate-300"
                    >
                      Отправить снова
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => resendOtp()}
                      className="flex-1 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={waLoading}
                    >
                      Изменить номер
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                      disabled={waLoading}
                    >
                      {waLoading ? 'Проверяем...' : 'Подтвердить'}
                    </button>
                  </div>
                </form>
              )}

              {waError && <p className="text-sm text-rose-600">{waError}</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPhone(input: string): string | null {
  const sanitized = input.replace(/\s+/g, '');
  if (!/^\+\d{8,15}$/.test(sanitized)) {
    return null;
  }
  return sanitized;
}

function mapErrorCode(code?: string) {
  switch (code) {
    case 'invalid_signature':
      return 'Подпись Telegram не прошла проверку.';
    case 'expired':
      return 'Сессия истекла. Запросите код снова.';
    case 'origin':
      return 'Запрос отклонён из-за некорректного домена.';
    case 'rate_limited':
      return 'Слишком много запросов. Попробуйте позже.';
    case 'invalid_phone':
      return 'Укажите корректный номер телефона.';
    case 'send_failed':
      return 'Не удалось отправить код. Попробуйте позже.';
    case 'invalid_otp':
      return 'Неверный код. Проверьте и попробуйте снова.';
    case 'not_found':
      return 'Сессия не найдена или уже подтверждена.';
    default:
      return 'Произошла ошибка. Попробуйте ещё раз.';
  }
}
