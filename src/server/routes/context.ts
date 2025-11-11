import { NextRequest } from 'next/server';

export function getRequestIp(req: NextRequest): string | null {
  if (req.ip) return req.ip;
  const header = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  return header ? header.split(',')[0]?.trim() ?? null : null;
}

export function getUserAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent');
}

export function getOrigin(req: NextRequest): string | null {
  return req.headers.get('origin');
}
