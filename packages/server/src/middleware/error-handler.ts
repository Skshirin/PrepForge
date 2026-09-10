// ============================================================================
// Global Error Handler Middleware
// ============================================================================

import { Request, Response, NextFunction } from 'express';

export interface AppError {
  code: string;
  message: string;
  statusCode: number;
}

/**
 * Creates a structured application error.
 */
export function createAppError(
  statusCode: number,
  code: string,
  message: string
): AppError & Error {
  const error = new Error(message) as AppError & Error;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Global error handler — catches all unhandled errors and returns
 * a structured JSON response. Must be registered after all routes.
 */
export function globalErrorHandler(
  err: Error & Partial<AppError>,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    statusCode === 500
      ? 'An internal server error occurred.'
      : err.message || 'Something went wrong.';

  // Log the full error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error]', {
      statusCode,
      code,
      message: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}
