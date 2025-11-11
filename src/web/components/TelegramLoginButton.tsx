'use client';

import { useCallback, useEffect, useRef } from 'react';

interface TelegramLoginButtonProps {
  botName: string;
  onAuth: (payload: Record<string, unknown>) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    TelegramLoginWidget?: unknown;
    __onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

export function TelegramLoginButton({
  botName,
  onAuth,
  disabled,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleAuth = useCallback(
    (user: Record<string, unknown>) => {
      if (!disabled) {
        onAuth(user);
      }
    },
    [disabled, onAuth],
  );

  useEffect(() => {
    if (!botName || !containerRef.current) return;

    const holder = containerRef.current;
    window.__onTelegramAuth = handleAuth;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?21';
    script.async = true;
    script.setAttribute('data-telegram-login', botName.replace('@', ''));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', '__onTelegramAuth');
    script.setAttribute('data-request-access', 'write');

    holder.innerHTML = '';
    holder.appendChild(script);

    return () => {
      holder.innerHTML = '';
      if (window.__onTelegramAuth === handleAuth) {
        delete window.__onTelegramAuth;
      }
    };
  }, [botName, handleAuth]);

  return (
    <div
      ref={containerRef}
      aria-disabled={disabled}
      className={disabled ? 'opacity-50 pointer-events-none' : undefined}
    />
  );
}
