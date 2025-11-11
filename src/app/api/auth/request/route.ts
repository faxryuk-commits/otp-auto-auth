import { NextRequest, NextResponse } from 'next/server';
import { handleAuthRequest } from '@/server/routes/auth.request';
import { HttpError } from '@/server/routes/httpError';
import { getRequestIp, getUserAgent } from '@/server/routes/context';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleAuthRequest({
      body,
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

    console.error('POST /auth/request error', error);
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 },
    );
  }
}
