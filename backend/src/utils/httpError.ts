export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new HttpError(400, code, message);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new HttpError(401, code, message);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new HttpError(404, code, message);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new HttpError(409, code, message);
  }
}
