import { NextRequest, NextResponse } from 'next/server';
import { handleAuthStatus } from '@/server/routes/auth.status';
import { HttpError } from '@/server/routes/httpError';

export async function GET(req: NextRequest) {
  try {
    const result = await handleAuthStatus(Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      );
    }
    console.error('GET /auth/status error', error);
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 },
    );
  }
}
