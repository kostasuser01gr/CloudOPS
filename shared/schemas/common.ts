import { z } from "zod";

export const opaqueIdSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u, "Invalid opaque id format");

export const reservationNumberSchema = z
  .string()
  .trim()
  .min(4)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/u, "Invalid reservation number format");

export const epochSecondsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(4102444800, "Epoch out of expected range");

export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

export const requestIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/u);

export const localeSchema = z.string().min(2).max(16);

export const booleanStringSchema = z.enum(["true", "false"]);

export const positiveIntStringSchema = z
  .string()
  .regex(/^[0-9]+$/u)
  .transform((raw) => Number.parseInt(raw, 10))
  .pipe(z.number().int().positive());

export const httpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD"
]);

export const paginationSchema = z.object({
  limit: z.number().int().positive().max(200).default(50),
  cursor: z.string().min(1).max(255).optional()
});
