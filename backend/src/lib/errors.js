import { ZodError } from 'zod';
import { config } from '../config.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'Not allowed') {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message, details) {
    return new ApiError(409, 'conflict', message, details);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, 'too_many_requests', message);
  }
}

/** Wraps an async route handler so rejections reach the error middleware. */
export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'Request body is invalid',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // Anything unrecognised is a bug. Log it in full, tell the client nothing.
  console.error('[error]', req.method, req.path, err);
  return res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong',
      ...(config.isProduction ? {} : { debug: err?.message }),
    },
  });
}
