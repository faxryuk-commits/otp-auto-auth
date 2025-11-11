export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function toJsonResponse(error: HttpError) {
  return {
    status: error.status,
    body: { error: error.code },
  };
}
