import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors';

/**
 * Express has no built-in schema validation — every route body passes through
 * this. Parsed (and stripped) values land in res.locals.body.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return next(new AppError(400, 'VALIDATION', detail));
    }
    res.locals.body = result.data;
    next();
  };
}
