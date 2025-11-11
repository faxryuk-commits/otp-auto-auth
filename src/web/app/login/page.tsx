'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientConfig } from '@/web/config/clientConfig';

type Tab = 'tg' | 'wa';

type ProviderConfig = 'tg' | 'wa' | 'tg-otp';

interface ErrorResponse {
  error?: string;
  phone?: string;
}

const STORAGE_KEYS = {
  tgPhone: 'otp-auth:tg-phone',
  waPhone: 'otp-auth:wa-phone',
  waConsent: 'otp-auth:wa-consent',
};

const TELEGRAM_POLL_INTERVAL = 4000;

export default function LoginPage() {
  const router = useRouter();
  const availableTabs = useMemo<Tab[]>(() => {
    const providers = clientConfig.providers.length
      ? clientConfig.providers
      : (['tg', 'wa'] as ProviderConfig[]);
    const normalized = providers.map((provider) => (provider === 'tg-otp' ? 'tg' : provider));
    const unique = Array.from(new Set(normalized));
    return unique.filter((tab) => tab === 'tg' || tab === 'wa');
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>(availableTabs[0] ?? 'tg');

  const [tgPhone, setTgPhone] = useState('');
  const [tgSessionId, setTgSessionId] = useState<string | null>(null);
  const [tgBotLink, setTgBotLink] = useState<string | null>(null);
  const [tgOtp, setTgOtp] = useState('');
  const [tgStep, setTgStep] = useState<'intro' | 'verify'>('intro');
  const [tgLoading, setTgLoading] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);
  const [tgExpiresAt, setTgExpiresAt] = useState<number | null>(null);
  const [tgTimeLeft, setTgTimeLeft] = useState(0);
  const [tgStatusHint, setTgStatusHint] = useState<string | null>(null);

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
    if (typeof window === 'undefined') return;
    const savedTgPhone = window.localStorage.getItem(STORAGE_KEYS.tgPhone);
    const savedWaPhone = window.localStorage.getItem(STORAGE_KEYS.waPhone);
    const savedWaConsent = window.localStorage.getItem(STORAGE_KEYS.waConsent);

    if (savedTgPhone) {
      setTgPhone(savedTgPhone);
    }
    if (savedWaPhone) {
      setPhone(savedWaPhone);
    }
    if (savedWaConsent) {
      setConsent(savedWaConsent === 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.tgPhone, tgPhone);
  }, [tgPhone]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.waPhone, phone);
  }, [phone]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.waConsent, String(consent));
  }, [consent]);

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

  useEffect(() => {
    if (!tgExpiresAt) {
      setTgTimeLeft(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, tgExpiresAt - Date.now());
      setTgTimeLeft(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tgExpiresAt]);

  useEffect(() => {
    if (!tgSessionId) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/auth/status?session_id=${tgSessionId}`);
        if (!response.ok) return;
        const data = (await response.json()) as { state: string; phone?: string };
        if (data.phone) {
          setTgPhone((prev) => (prev && prev !== '+971' ? prev : data.phone));
          setTgStatusHint('Мы получили ваш номер. Введите код из Telegram.');
        }
        if (data.state === 'expired') {
          setTgError('Сессия истекла. Запросите код заново.');
          resetTelegramFlow();
        }
      } catch (error) {
        console.error('Polling telegram status error', error);
      }
    }, TELEGRAM_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [tgSessionId]);

  const formatWaTimeLeft = () => {
    const totalSeconds = Math.floor(timeLeft / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(1, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const formatTgTimeLeft = () => {
    const totalSeconds = Math.floor(tgTimeLeft / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(1, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const requestTelegramOtp = async () => {
    if (tgLoading) return;
    setTgError(null);
    let normalizedPhone: string | undefined;
    if (tgPhone) {
      const formatted = formatPhone(tgPhone);
      if (!formatted) {
        setTgError('Укажите корректный номер телефона в формате +XXXXXXXXXXX.');
        return;
      }
      normalizedPhone = formatted;
    }

    try {
      setTgLoading(true);
      const response = await fetch('/api/auth/tg-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | { session_id: string; bot_link: string; expires_in: number }
        | ErrorResponse;

      if (!response.ok || 'error' in data) {
        setTgError(mapErrorCode((data as ErrorResponse).error));
        return;
      }

      setTgSessionId(data.session_id);
      setTgBotLink(data.bot_link);
      setTgStep('verify');
      setTgOtp('');
      setTgStatusHint('Откройте Telegram-бота и поделитесь номером, чтобы получить код.');
      setTgExpiresAt(Date.now() + data.expires_in * 1000);
      window.open(data.bot_link, '_blank', 'noopener');
    } catch (error) {
      console.error('Telegram request error', error);
      setTgError('Не удалось подготовить ссылку. Попробуйте ещё раз.');
    } finally {
      setTgLoading(false);
    }
  };

  const submitTelegramOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tgLoading || !tgSessionId) return;
    setTgError(null);

    if (tgOtp.length !== 6) {
      setTgError('Введите 6-значный код из Telegram.');
      return;
    }

    const formattedPhone = tgPhone ? formatPhone(tgPhone) : undefined;

    try {
      setTgLoading(true);
      const payload: Record<string, unknown> = {
        session_id: tgSessionId,
        otp: tgOtp,
        channel: 'tg-otp',
      };
      if (formattedPhone) {
        payload.phone = formattedPhone;
      }

      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as ErrorResponse;
      if (!response.ok) {
        setTgError(mapErrorCode(data.error));
        return;
      }

      router.push(clientConfig.appUrl);
    } catch (error) {
      console.error('Telegram verify error', error);
      setTgError('Не удалось подтвердить код. Попробуйте ещё раз.');
    } finally {
      setTgLoading(false);
    }
  };

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

  const resendOtp = () => {
    if (resendAvailableAt && Date.now() < resendAvailableAt) return;
    setWaStep('request');
    setSessionId(null);
    setExpiresAt(null);
    setOtp('');
  };

  const resetTelegramFlow = () => {
    setTgStep('intro');
    setTgSessionId(null);
    setTgBotLink(null);
    setTgOtp('');
    setTgExpiresAt(null);
    setTgTimeLeft(0);
    setTgStatusHint(null);
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
            <section aria-live="polite" className="space-y-6">
              <h2 className="text-lg font-medium text-slate-900">
                Получить код через Telegram-бота
              </h2>
              <p className="text-sm text-slate-500">
                Мы отправим OTP в официальном боте. Поделитесь номером телефона в Telegram — код появится в чате, затем введите его на сайте.
              </p>

              {tgStep === 'intro' && (
                <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Номер телефона (по желанию)
                    </label>
                    <input
                      type="tel"
                      value={tgPhone}
                      onChange={(event) => setTgPhone(sanitizePhoneInput(event.target.value))}
                      placeholder="+9715XXXXXXXX"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Номер запоминается только в вашем браузере. Телеграм всё равно попросит подтвердить его при переходе к боту.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    onClick={requestTelegramOtp}
                    disabled={tgLoading}
                  >
                    {tgLoading ? 'Готовим ссылку...' : 'Открыть Telegram-бота'}
                  </button>
                  <div className="rounded-lg bg-white/70 p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Что произойдёт дальше:</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4">
                      <li>Откроется бот OTPA UTO в Telegram.</li>
                      <li>Нажмите «Поделиться номером» или отправьте номер вручную.</li>
                      <li>Получите шестизначный код в чате и введите его здесь.</li>
                    </ol>
                  </div>
                </div>
              )}

              {tgStep === 'verify' && (
                <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="space-y-3 rounded-lg border border-sky-100 bg-white p-4 text-sm text-slate-600">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>Код отправлен в Telegram-бот.</span>
                      {tgBotLink && (
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                          onClick={() => window.open(tgBotLink, '_blank', 'noopener')}
                        >
                          Открыть бота ещё раз
                        </button>
                      )}
                    </div>
                    <p>Сессия истекает через: <span className="font-medium text-slate-800">{formatTgTimeLeft()}</span></p>
                    {tgPhone && (
                      <p className="text-xs text-slate-500">Текущий номер: {tgPhone}</p>
                    )}
                    {tgStatusHint && <p className="text-xs text-slate-500">{tgStatusHint}</p>}
                  </div>
                  <form className="space-y-4" onSubmit={submitTelegramOtp}>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Код из Telegram
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={tgOtp}
                        onChange={(event) => setTgOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-widest shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                        required
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={resetTelegramFlow}
                        className="flex-1 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        Запросить заново
                      </button>
                      <button
                        type="submit"
                        className="flex-1 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={tgLoading}
                      >
                        {tgLoading ? 'Проверяем...' : 'Подтвердить'}
                      </button>
                    </div>
                  </form>
                </div>
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
                      onChange={(event) => setPhone(sanitizePhoneInput(event.target.value))}
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
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-widest shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Таймер: {formatWaTimeLeft()}</span>
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
                      onClick={() => {
                        setWaStep('request');
                        setSessionId(null);
                        setExpiresAt(null);
                      }}
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

function sanitizePhoneInput(value: string) {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) {
    return `+${digits.replace(/\+/g, '')}`;
  }
  return `+${digits.slice(1).replace(/\+/g, '')}`;
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
    case 'not_ready':
      return 'Код ещё не готов. Убедитесь, что поделились номером в Telegram.';
    default:
      return 'Произошла ошибка. Попробуйте ещё раз.';
  }
}
