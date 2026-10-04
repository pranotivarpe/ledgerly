import type { Request } from 'express';
import type { z } from 'zod';

/** Parses and returns a typed request body; ZodErrors become 400s in the error handler. */
export function parseBody<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.body);
}
