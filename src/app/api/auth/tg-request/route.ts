import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramOtpRequest } from '@/server/routes/auth.tgOtpRequest';
import { HttpError } from '@/server/routes/httpError';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleTelegramOtpRequest({ body });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      );
    }
    console.error('POST /auth/tg-request error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
