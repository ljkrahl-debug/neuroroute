import { z } from 'zod';

/** Parses req.body; ZodError is translated to a 400 by the error handler. */
export function body(schema, req) {
  return schema.parse(req.body ?? {});
}

/** Parses req.query the same way. */
export function queryParams(schema, req) {
  return schema.parse(req.query ?? {});
}

export const uuid = z.string().uuid('Must be a UUID');

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .max(320);

export const transportMode = z.enum(['road', 'rail', 'sea', 'air', 'multimodal']);

export const companyType = z.enum(['shipper', 'carrier', 'both']);

export const shortText = (max = 200) => z.string().trim().min(1).max(max);

/** Money arrives as a decimal amount and is stored as integer cents. */
export const priceToCents = z
  .number()
  .positive('Price must be greater than zero')
  .max(100_000_000, 'Price is implausibly large')
  .transform((value) => Math.round(value * 100));

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD form')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date');

export { z };
