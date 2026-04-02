import { z } from "zod";
import { opaqueIdSchema, epochSecondsSchema } from "./common";

export const fleetVehicleStatusSchema = z.enum(["Ready", "Cleaning", "Maintenance", "Rented"]);

export const fleetVehicleSchema = z.object({
  id: opaqueIdSchema,
  plate: z.string().min(2).max(15),
  makeModel: z.string().min(2).max(100),
  status: fleetVehicleStatusSchema,
  locationDetail: z.string().max(255).optional(),
  keyLocationDetail: z.string().max(255).optional(),
  mileage: z.number().int().nonnegative(),
  lastServiceEpochS: epochSecondsSchema.nullable()
});

export const fleetShiftTypeSchema = z.enum(["Morning", "Evening", "Night"]);
export const fleetShiftStatusSchema = z.enum(["Pending", "Published", "Completed"]);

export const fleetShiftSchema = z.object({
  id: opaqueIdSchema,
  staffUserId: opaqueIdSchema.nullable(),
  stationId: opaqueIdSchema,
  dateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: fleetShiftTypeSchema,
  startTimeLocal: z.string(),
  endTimeLocal: z.string(),
  status: fleetShiftStatusSchema,
  requiredSkills: z.array(z.string())
});

export const fleetWashStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);
export const fleetWashPrioritySchema = z.enum(["low", "normal", "high", "critical"]);

export const fleetWashSchema = z.object({
  id: opaqueIdSchema,
  identifier: z.string().min(2).max(50),
  normalizedIdentifier: z.string(),
  method: z.enum(["manual", "ai_vision"]),
  confidence: z.number().min(0).max(1),
  stationId: opaqueIdSchema,
  operatorId: opaqueIdSchema,
  reservationId: opaqueIdSchema.nullable(),
  fleetVehicleId: opaqueIdSchema.nullable(),
  status: fleetWashStatusSchema,
  priority: fleetWashPrioritySchema,
  issueFlag: z.boolean(),
  duplicateFlag: z.boolean(),
  checkoutPhotoStorageKey: z.string().nullable(),
  checkinPhotoStorageKey: z.string().nullable(),
  completedEpochS: epochSecondsSchema.nullable(),
  createdAt: z.string()
});

export const createWashRequestSchema = z.object({
  identifier: z.string().min(2).max(50),
  stationId: opaqueIdSchema,
  operatorId: opaqueIdSchema,
  fleetVehicleId: opaqueIdSchema.optional(),
  priority: fleetWashPrioritySchema.default("normal")
});

export const generateShiftsRequestSchema = z.object({
  stationId: opaqueIdSchema,
  weekStartLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const resourceLevelsSchema = z.object({
  soap: z.number().min(0).max(100),
  wax: z.number().min(0).max(100),
  water: z.number().min(0).max(100)
});

export const demandForecastItemSchema = z.object({
  hour: z.string(),
  expectedVehicles: z.number().int().nonnegative(),
  scheduledStaff: z.number().int().nonnegative()
});