import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramLogin } from '@/server/routes/auth.tgLogin';
import { HttpError } from '@/server/routes/httpError';
import { getOrigin, getRequestIp, getUserAgent } from '@/server/routes/context';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleTelegramLogin({
      body,
      origin: getOrigin(req),
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      );
    }

    console.error('POST /auth/tg-login error', error);
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 },
    );
  }
}
