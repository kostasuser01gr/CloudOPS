import type { RuntimeEnv } from './env';
import { loadStaffSession, ok, fail, parseJsonBody, nowEpochS, newOpaqueId } from './utils';
import { z } from 'zod';
import { fleetShiftSchema, createWashRequestSchema } from '@shared/schemas/fleet';

export async function staffClockIn(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');
  
  const shiftId = newOpaqueId();
  try {
    await runtime.bindings.DB.prepare(
      'INSERT INTO shifts (id, staff_id, station_id, start_time_scheduled, status, clock_in_time) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(shiftId, staff.session.staffUserId, 'STATION_001', new Date().toISOString(), 'active', new Date().toISOString())
    .run();
    
    return ok(requestId, { status: 'active', shiftId, staffId: staff.session.staffUserId });
  } catch (e) {
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to clock in');
  }
}
export async function staffRegisterWash(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  
  const body = await parseJsonBody(request, createWashRequestSchema);
  if (!body.success) return fail(requestId, 400, "INVALID_REQUEST", "Invalid wash registration data");
  
  const washId = newOpaqueId();
  const isSimulatedDamage = Math.random() > 0.85; // 15% chance of simulated damage
  
  try {
    await runtime.bindings.DB.prepare(
      "INSERT INTO wash_registrations (id, reservation_id, operator_id, method, status, issue_flag) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(washId, body.data.identifier, staff.session.staffUserId, "manual", "completed", isSimulatedDamage ? 1 : 0)
    .run();
    
    // Mark reservation as having evidence
    await runtime.bindings.DB.prepare("UPDATE reservations SET has_uploaded_evidence = 1 WHERE reservation_number = ?")
    .bind(body.data.identifier)
    .run();

    // Inventory Deduction (Simulated: 1L of Soap per wash)
    await runtime.bindings.DB.prepare(
      "UPDATE inventory_items SET current_quantity = current_quantity - 1 WHERE name = 'Soap' AND station_id = 'STATION_001'"
    ).run();

    return ok(requestId, { washId, status: "completed", aiFlag: isSimulatedDamage });
  } catch (e) {
    return fail(requestId, 500, "INTERNAL_ERROR", "Failed to register wash");
  }
}

export async function staffExportEvidence(runtime: RuntimeEnv, request: Request, requestId: string, reservationId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');

  try {
    const reservation = await runtime.bindings.DB.prepare(
      'SELECT r.*, s.name as station_name FROM reservations r JOIN stations s ON r.station_id = s.id WHERE r.id = ?'
    ).bind(reservationId).first();

    if (!reservation) return fail(requestId, 404, 'NOT_FOUND', 'Reservation not found');

    const washData = await runtime.bindings.DB.prepare(
      'SELECT w.*, p.full_name as operator_name FROM wash_registrations w JOIN staff_profiles p ON w.operator_id = p.id WHERE w.reservation_id = ?'
    ).bind(reservationId).all();

    const auditLogs = await runtime.bindings.DB.prepare(
      'SELECT * FROM audit_logs WHERE reservation_id = ? ORDER BY created_epoch_s DESC'
    ).bind(reservationId).all();

    const bundle = {
      bundleId: newOpaqueId(),
      type: 'InsuranceEvidenceVault',
      generatedAt: new Date().toISOString(),
      reservation,
      washData: washData.results,
      auditLogs: auditLogs.results,
      integrityHash: 'sha256:signed_bundle_hash_placeholder'
    };

    return ok(requestId, bundle);
  } catch (e) {
    return fail(requestId, 500, 'INTERNAL_ERROR', 'Failed to generate evidence bundle');
  }
}

export async function getInventory(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');

  const items = await runtime.bindings.DB.prepare(
    'SELECT * FROM inventory_items WHERE station_id = ?'
  ).bind('STATION_001').all();

  return ok(requestId, { items: items.results });
}

export async function updateInventory(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, 'UNAUTHORIZED', 'Unable to continue');

  const body = await parseJsonBody(request, z.object({ itemId: z.string(), quantity: z.number() }));
  if (!body.success) return fail(requestId, 400, 'INVALID_REQUEST', 'Invalid data');

  await runtime.bindings.DB.prepare(
    'UPDATE inventory_items SET current_quantity = ? WHERE id = ?'
  ).bind(body.data.quantity, body.data.itemId).run();

  return ok(requestId, { updated: true });
}

export async function deptChatHandler(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const body = await parseJsonBody(request, z.object({ department: z.string(), message: z.string(), roomId: z.string().optional() }));
  if (!body.success) return fail(requestId, 400, 'INVALID_REQUEST', 'Invalid message data');
  
  // Gemini-powered response simulation (The platform 'knows' itself)
  const content = `Γεια σας από το τμήμα ${body.department}. Επεξεργάζομαι το αίτημά σας: ${body.message}. Η κλίμακα FleetOps είναι πλήρως ενεργή.`;
  
  await runtime.bindings.DB.prepare(
    'INSERT INTO ai_chat_history (id, department, content, role) VALUES (?, ?, ?, ?)'
  ).bind(newOpaqueId(), body.department, body.message, 'user').run();

  await runtime.bindings.DB.prepare(
    'INSERT INTO ai_chat_history (id, department, content, role) VALUES (?, ?, ?, ?)'
  ).bind(newOpaqueId(), body.department, content, 'assistant').run();

  return ok(requestId, { response: content });
}

export async function fileIngestHandler(runtime: RuntimeEnv, request: Request, requestId: string): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return fail(requestId, 400, 'INVALID_REQUEST', 'No file found');

  // Simulated Gemini parsing
  const analysis = { fileName: file.name, rowCount: 1500, type: 'Bookings', summary: 'Yearly bookings for 2026 extracted.' };
  
  await runtime.bindings.DB.prepare(
    'INSERT INTO data_ingestion_logs (id, file_name, file_type, analysis_json) VALUES (?, ?, ?, ?)'
  ).bind(newOpaqueId(), file.name, 'xlsx', JSON.stringify(analysis)).run();

  return ok(requestId, { analysis });
}
