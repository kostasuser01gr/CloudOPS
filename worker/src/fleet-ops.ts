import { newOpaqueId, nowEpochS, ok, fail } from './utils';
import type { RuntimeEnv } from './env';

export interface FleetVehicle {
  id: string;
  plate: string;
  makeModel: string;
  status: 'Ready' | 'Cleaning' | 'Maintenance' | 'Rented';
  locationDetail?: string;
}

export async function staffFleetVehicles(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const result = await runtime.bindings.DB.prepare(
    "SELECT id, plate, make_model as makeModel, status, location_detail as locationDetail FROM fleet_vehicles ORDER BY plate ASC"
  ).all<FleetVehicle>();
  return ok(requestId, { vehicles: result.results || [] });
}

export async function staffFleetVehicleCreate(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const body = await request.json() as Partial<FleetVehicle>;
  if (!body.plate || !body.makeModel) return fail(requestId, 400, 'INVALID_REQUEST', 'Plate and Make/Model required');
  
  const id = newOpaqueId();
  await runtime.bindings.DB.prepare(
    "INSERT INTO fleet_vehicles (id, plate, make_model, status, location_detail) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, body.plate, body.makeModel, body.status || 'Ready', body.locationDetail || null).run();
  
  return ok(requestId, { id, plate: body.plate });
}
export async function staffFleetShifts(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const stationId = url.searchParams.get('stationId');
  
  let sql = 'SELECT * FROM fleet_shifts WHERE 1=1';
  const params: any[] = [];
  if (date) { sql += ' AND date_local = ?'; params.push(date); }
  if (stationId) { sql += ' AND station_id = ?'; params.push(stationId); }
  
  const result = await runtime.bindings.DB.prepare(sql).bind(...params).all();
  return ok(requestId, { shifts: result.results || [] });
}

export async function staffFleetWashes(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const result = await runtime.bindings.DB.prepare(
    'SELECT * FROM fleet_washes ORDER BY created_at DESC LIMIT 100'
  ).all();
  return ok(requestId, { washes: result.results || [] });
}

export async function staffFleetWashCreate(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const body = await request.json() as any;
  if (!body.identifier || !body.stationId || !body.operatorId) return fail(requestId, 400, 'INVALID_REQUEST', 'Identifier, Station, and Operator required');
  
  const id = newOpaqueId();
  const normalized = body.identifier.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  await runtime.bindings.DB.prepare(
    'INSERT INTO fleet_washes (id, identifier, normalized_identifier, method, station_id, operator_id, status, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.identifier, normalized, body.method || 'manual', body.stationId, body.operatorId, 'completed', 'normal').run();
  
  await runtime.bindings.DB.prepare(
    'UPDATE staff_employee_profiles SET wash_count = wash_count + 1 WHERE staff_user_id = ?'
  ).bind(body.operatorId).run();

  return ok(requestId, { id, identifier: body.identifier });
}
