import type { RuntimeEnv } from "./env";
import { ok, fail, newOpaqueId, nowEpochS, loadStaffSession, hasPermission, parseJsonBody } from "./utils";
import { z } from "zod";

// ── Types ────────────────────────────────────────────────────

interface EmployeeProfile {
  staffUserId: string;
  displayName: string;
  contractType: "Full-Time" | "Part-Time";
  maxWeeklyHours: number;
  skills: string[];
  availability: Record<string, string[]>; // dayOfWeek (0-6) → shift types
  qualityScore: number;
  nightShiftCount: number;
  weekendShiftCount: number;
}

interface GeneratedShift {
  id: string;
  staffUserId: string | null;
  stationId: string;
  dateLocal: string;
  shiftType: "Morning" | "Evening" | "Night";
  startTimeLocal: string;
  endTimeLocal: string;
  requiredSkills: string[];
}

interface Conflict {
  id: string;
  shiftDate: string;
  shiftType: string;
  reason: string;
  suggestions: string[];
}

const SHIFT_HOURS: Record<string, { start: string; end: string; hours: number }> = {
  Morning: { start: "08:00", end: "16:00", hours: 8 },
  Evening: { start: "16:00", end: "00:00", hours: 8 },
  Night: { start: "00:00", end: "08:00", hours: 8 }
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Request schemas ──────────────────────────────────────────

const generateScheduleSchema = z.object({
  stationId: z.string().min(1),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const updateShiftSchema = z.object({
  employeeId: z.string().nullable()
});

const publishScheduleSchema = z.object({
  scheduleId: z.string().min(1)
});

// ── Engine ───────────────────────────────────────────────────

function getDateDayIndex(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

function isOnLeave(leaves: Array<{ start_date: string; end_date: string }>, dateStr: string): boolean {
  for (const leave of leaves) {
    if (dateStr >= leave.start_date && dateStr <= leave.end_date) return true;
  }
  return false;
}

function generateScheduleForStation(
  employees: EmployeeProfile[],
  leaves: Array<{ staff_user_id: string; start_date: string; end_date: string }>,
  stationId: string,
  weekStartDate: string,
  demandForecast: Array<{ day_of_week: number; hour_of_day: number; expected_vehicles: number }>
): { shifts: GeneratedShift[]; conflicts: Conflict[] } {
  const shifts: GeneratedShift[] = [];
  const conflicts: Conflict[] = [];
  const hoursUsed: Record<string, number> = {};
  const shiftTypes: Array<"Morning" | "Evening" | "Night"> = ["Morning", "Evening", "Night"];

  for (const emp of employees) {
    hoursUsed[emp.staffUserId] = 0;
  }

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dateStr = addDays(weekStartDate, dayOffset);
    const dayIndex = getDateDayIndex(dateStr);
    const dayKey = dayIndex.toString();

    for (const shiftType of shiftTypes) {
      const shiftConfig = SHIFT_HOURS[shiftType]!;

      // Determine required staff count from demand forecast
      const peakHour = shiftType === "Morning" ? 12 : shiftType === "Evening" ? 20 : 4;
      const demandEntry = demandForecast.find(
        (d) => d.day_of_week === dayIndex && d.hour_of_day === peakHour
      );
      const expectedVehicles = demandEntry?.expected_vehicles ?? 5;
      const requiredStaff = Math.max(1, Math.min(4, Math.ceil(expectedVehicles / 5)));

      // Determine required skills
      const requiredSkills: string[] = ["Front-Desk"];
      if (expectedVehicles > 5) requiredSkills.push("Valeting");
      if (shiftType === "Night") requiredSkills.push("Driver");

      const assigned: string[] = [];

      // Sort candidates: night-shift fairness → contract priority → available hours
      const candidates = employees
        .filter((emp) => {
          // Check availability
          const dayAvailability = emp.availability[dayKey];
          if (!dayAvailability || !dayAvailability.includes(shiftType)) return false;

          // Check leave
          const empLeaves = leaves.filter((l) => l.staff_user_id === emp.staffUserId);
          if (isOnLeave(empLeaves, dateStr)) return false;

          // Check max weekly hours
          if ((hoursUsed[emp.staffUserId] ?? 0) + shiftConfig.hours > emp.maxWeeklyHours) return false;

          // Check if already assigned on this day (prevent double-shift)
          const alreadyToday = shifts.some(
            (s) => s.staffUserId === emp.staffUserId && s.dateLocal === dateStr
          );
          if (alreadyToday) return false;

          return true;
        })
        .sort((a, b) => {
          // Night shift fairness (fewest night shifts first)
          if (shiftType === "Night") {
            if (a.nightShiftCount !== b.nightShiftCount) return a.nightShiftCount - b.nightShiftCount;
          }
          // Full-time priority
          if (a.contractType !== b.contractType) {
            return a.contractType === "Full-Time" ? -1 : 1;
          }
          // Most available hours remaining
          const aRemaining = a.maxWeeklyHours - (hoursUsed[a.staffUserId] ?? 0);
          const bRemaining = b.maxWeeklyHours - (hoursUsed[b.staffUserId] ?? 0);
          return bRemaining - aRemaining;
        });

      for (let slot = 0; slot < requiredStaff; slot++) {
        const candidate = candidates.find((c) => !assigned.includes(c.staffUserId));

        const shiftId = newOpaqueId();

        if (candidate) {
          assigned.push(candidate.staffUserId);
          hoursUsed[candidate.staffUserId] = (hoursUsed[candidate.staffUserId] ?? 0) + shiftConfig.hours;

          shifts.push({
            id: shiftId,
            staffUserId: candidate.staffUserId,
            stationId,
            dateLocal: dateStr,
            shiftType,
            startTimeLocal: shiftConfig.start,
            endTimeLocal: shiftConfig.end,
            requiredSkills
          });
        } else {
          // Unfillable slot → conflict
          shifts.push({
            id: shiftId,
            staffUserId: null,
            stationId,
            dateLocal: dateStr,
            shiftType,
            startTimeLocal: shiftConfig.start,
            endTimeLocal: shiftConfig.end,
            requiredSkills
          });

          const suggestions: string[] = [];
          const partTimeAvailable = employees.filter(
            (e) => e.contractType === "Part-Time" && (hoursUsed[e.staffUserId] ?? 0) < e.maxWeeklyHours
          );
          if (partTimeAvailable.length > 0) {
            suggestions.push(`Call part-time staff: ${partTimeAvailable.map((e) => e.displayName).join(", ")}`);
          }
          suggestions.push("Consider overtime authorization");

          conflicts.push({
            id: newOpaqueId(),
            shiftDate: dateStr,
            shiftType,
            reason: `No available ${shiftType} staff for ${DAYS[dayIndex]} (slot ${slot + 1}/${requiredStaff})`,
            suggestions
          });
        }
      }
    }
  }

  return { shifts, conflicts };
}

// ── API Handlers ─────────────────────────────────────────────

export async function handleGenerateSchedule(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  if (!hasPermission(staff.session.permissions, "manage_schedule")) {
    return fail(requestId, 403, "FORBIDDEN", "Insufficient permissions");
  }

  const body = await parseJsonBody(request, generateScheduleSchema);
  if (!body.success) return fail(requestId, 400, "INVALID_REQUEST", "Invalid schedule request");

  const { stationId, weekStartDate } = body.data;

  // Verify station exists
  const station = await runtime.bindings.DB.prepare("SELECT id FROM stations WHERE id = ? AND is_active = 1")
    .bind(stationId).first<{ id: string }>();
  if (!station) return fail(requestId, 404, "NOT_FOUND", "Station not found");

  // Load employees for this station
  const empRows = await runtime.bindings.DB.prepare(
    `SELECT sep.staff_user_id, su.display_name, sep.contract_type, sep.max_weekly_hours,
            sep.skills_json, sep.availability_json, sep.quality_score,
            COALESCE(sfc.night_shift_count, 0) AS night_shift_count,
            COALESCE(sfc.weekend_shift_count, 0) AS weekend_shift_count
     FROM staff_employee_profiles sep
     INNER JOIN staff_users su ON su.id = sep.staff_user_id AND su.is_active = 1
     LEFT JOIN shift_fairness_counters sfc ON sfc.staff_user_id = sep.staff_user_id
     WHERE sep.preferred_station_id = ? OR sep.preferred_station_id IS NULL
     ORDER BY su.display_name ASC`
  ).bind(stationId).all<{
    staff_user_id: string;
    display_name: string;
    contract_type: string;
    max_weekly_hours: number;
    skills_json: string;
    availability_json: string;
    quality_score: number;
    night_shift_count: number;
    weekend_shift_count: number;
  }>();

  const employees: EmployeeProfile[] = (empRows.results ?? []).map((r) => ({
    staffUserId: r.staff_user_id,
    displayName: r.display_name,
    contractType: r.contract_type as "Full-Time" | "Part-Time",
    maxWeeklyHours: r.max_weekly_hours,
    skills: JSON.parse(r.skills_json || "[]"),
    availability: JSON.parse(r.availability_json || "{}"),
    qualityScore: r.quality_score,
    nightShiftCount: r.night_shift_count,
    weekendShiftCount: r.weekend_shift_count
  }));

  // Load leave requests for the week
  const weekEndDate = addDays(weekStartDate, 6);
  const leaveRows = await runtime.bindings.DB.prepare(
    `SELECT staff_user_id, start_date, end_date FROM leave_requests
     WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
  ).bind(weekEndDate, weekStartDate).all<{ staff_user_id: string; start_date: string; end_date: string }>();

  // Load demand forecast
  const demandRows = await runtime.bindings.DB.prepare(
    "SELECT day_of_week, hour_of_day, expected_vehicles FROM demand_forecast WHERE station_id = ?"
  ).bind(stationId).all<{ day_of_week: number; hour_of_day: number; expected_vehicles: number }>();

  // Generate
  const { shifts, conflicts } = generateScheduleForStation(
    employees,
    leaveRows.results ?? [],
    stationId,
    weekStartDate,
    demandRows.results ?? []
  );

  // Upsert weekly schedule
  const existingSchedule = await runtime.bindings.DB.prepare(
    "SELECT id FROM weekly_schedules WHERE station_id = ? AND week_start_date = ?"
  ).bind(stationId, weekStartDate).first<{ id: string }>();

  const scheduleId = existingSchedule?.id ?? newOpaqueId();
  const now = nowEpochS();

  if (existingSchedule) {
    // Clear old shifts and conflicts for regeneration
    await runtime.bindings.DB.batch([
      runtime.bindings.DB.prepare("DELETE FROM fleet_shifts WHERE schedule_id = ?").bind(scheduleId),
      runtime.bindings.DB.prepare("DELETE FROM schedule_conflicts WHERE schedule_id = ?").bind(scheduleId),
      runtime.bindings.DB.prepare(
        "UPDATE weekly_schedules SET status = 'draft', generated_at_epoch_s = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(now, scheduleId)
    ]);
  } else {
    await runtime.bindings.DB.prepare(
      `INSERT INTO weekly_schedules (id, station_id, week_start_date, status, generated_at_epoch_s)
       VALUES (?, ?, ?, 'draft', ?)`
    ).bind(scheduleId, stationId, weekStartDate, now).run();
  }

  // Insert shifts
  const shiftStatements = shifts.map((s) =>
    runtime.bindings.DB.prepare(
      `INSERT INTO fleet_shifts (id, staff_user_id, station_id, date_local, shift_type, start_time_local, end_time_local, status, required_skills_json, schedule_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`
    ).bind(s.id, s.staffUserId, s.stationId, s.dateLocal, s.shiftType, s.startTimeLocal, s.endTimeLocal, JSON.stringify(s.requiredSkills), scheduleId)
  );

  // Insert conflicts
  const conflictStatements = conflicts.map((c) =>
    runtime.bindings.DB.prepare(
      `INSERT INTO schedule_conflicts (id, schedule_id, shift_date, shift_type, reason, suggestions_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(c.id, scheduleId, c.shiftDate, c.shiftType, c.reason, JSON.stringify(c.suggestions))
  );

  // Audit log
  const auditStatement = runtime.bindings.DB.prepare(
    `INSERT INTO schedule_audit_log (id, schedule_id, actor_id, action, details_json, created_at_epoch_s)
     VALUES (?, ?, ?, 'generate', ?, ?)`
  ).bind(
    newOpaqueId(),
    scheduleId,
    staff.session.staffUserId,
    JSON.stringify({ totalShifts: shifts.length, filledShifts: shifts.filter((s) => s.staffUserId).length, conflicts: conflicts.length }),
    now
  );

  await runtime.bindings.DB.batch([...shiftStatements, ...conflictStatements, auditStatement]);

  return ok(requestId, {
    scheduleId,
    weekStartDate,
    stationId,
    totalShifts: shifts.length,
    filledShifts: shifts.filter((s) => s.staffUserId).length,
    unfilledShifts: shifts.filter((s) => !s.staffUserId).length,
    conflicts: conflicts.length,
    shifts: shifts.map((s) => ({
      id: s.id,
      employeeId: s.staffUserId,
      date: s.dateLocal,
      shiftType: s.shiftType,
      startTime: s.startTimeLocal,
      endTime: s.endTimeLocal,
      requiredSkills: s.requiredSkills
    })),
    conflictDetails: conflicts
  });
}

export async function handleGetSchedule(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");

  const url = new URL(request.url);
  const stationId = url.searchParams.get("stationId");
  const weekStartDate = url.searchParams.get("weekStartDate");

  if (!stationId || !weekStartDate) {
    return fail(requestId, 400, "INVALID_REQUEST", "stationId and weekStartDate required");
  }

  const schedule = await runtime.bindings.DB.prepare(
    "SELECT * FROM weekly_schedules WHERE station_id = ? AND week_start_date = ? LIMIT 1"
  ).bind(stationId, weekStartDate).first<{
    id: string; station_id: string; week_start_date: string; status: string;
    is_blurred: number; generated_at_epoch_s: number; published_at_epoch_s: number | null;
  }>();

  if (!schedule) {
    return ok(requestId, { schedule: null, shifts: [], conflicts: [], employees: [] });
  }

  const shifts = await runtime.bindings.DB.prepare(
    `SELECT fs.*, su.display_name AS employee_name
     FROM fleet_shifts fs
     LEFT JOIN staff_users su ON su.id = fs.staff_user_id
     WHERE fs.schedule_id = ?
     ORDER BY fs.date_local ASC, CASE fs.shift_type WHEN 'Morning' THEN 1 WHEN 'Evening' THEN 2 WHEN 'Night' THEN 3 END`
  ).bind(schedule.id).all();

  const conflictsResult = await runtime.bindings.DB.prepare(
    "SELECT * FROM schedule_conflicts WHERE schedule_id = ? AND resolved = 0 ORDER BY shift_date"
  ).bind(schedule.id).all();

  const employees = await runtime.bindings.DB.prepare(
    `SELECT sep.staff_user_id, su.display_name, sep.contract_type, sep.max_weekly_hours,
            sep.skills_json, sep.quality_score
     FROM staff_employee_profiles sep
     INNER JOIN staff_users su ON su.id = sep.staff_user_id AND su.is_active = 1
     WHERE sep.preferred_station_id = ? OR sep.preferred_station_id IS NULL`
  ).bind(stationId).all();

  return ok(requestId, {
    schedule: {
      id: schedule.id,
      stationId: schedule.station_id,
      weekStartDate: schedule.week_start_date,
      status: schedule.status,
      isBlurred: schedule.is_blurred === 1,
      generatedAtEpochS: schedule.generated_at_epoch_s,
      publishedAtEpochS: schedule.published_at_epoch_s
    },
    shifts: shifts.results ?? [],
    conflicts: conflictsResult.results ?? [],
    employees: employees.results ?? []
  });
}

export async function handleUpdateShift(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string,
  shiftId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  if (!hasPermission(staff.session.permissions, "manage_schedule")) {
    return fail(requestId, 403, "FORBIDDEN", "Insufficient permissions");
  }

  const body = await parseJsonBody(request, updateShiftSchema);
  if (!body.success) return fail(requestId, 400, "INVALID_REQUEST", "Invalid update");

  // Verify shift exists and belongs to a draft schedule
  const shift = await runtime.bindings.DB.prepare(
    `SELECT fs.id, fs.schedule_id, ws.status AS schedule_status
     FROM fleet_shifts fs
     INNER JOIN weekly_schedules ws ON ws.id = fs.schedule_id
     WHERE fs.id = ?`
  ).bind(shiftId).first<{ id: string; schedule_id: string; schedule_status: string }>();

  if (!shift) return fail(requestId, 404, "NOT_FOUND", "Shift not found");
  if (shift.schedule_status === "published") {
    return fail(requestId, 409, "CONFLICT", "Cannot edit a published schedule");
  }

  await runtime.bindings.DB.prepare(
    "UPDATE fleet_shifts SET staff_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(body.data.employeeId, shiftId).run();

  // Audit
  await runtime.bindings.DB.prepare(
    `INSERT INTO schedule_audit_log (id, schedule_id, actor_id, action, details_json, created_at_epoch_s)
     VALUES (?, ?, ?, 'update_shift', ?, ?)`
  ).bind(newOpaqueId(), shift.schedule_id, staff.session.staffUserId,
    JSON.stringify({ shiftId, newEmployeeId: body.data.employeeId }), nowEpochS()).run();

  return ok(requestId, { updated: true, shiftId });
}

export async function handlePublishSchedule(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, true);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");
  if (!hasPermission(staff.session.permissions, "manage_schedule")) {
    return fail(requestId, 403, "FORBIDDEN", "Insufficient permissions");
  }

  const body = await parseJsonBody(request, publishScheduleSchema);
  if (!body.success) return fail(requestId, 400, "INVALID_REQUEST", "scheduleId required");

  const schedule = await runtime.bindings.DB.prepare(
    "SELECT id, status FROM weekly_schedules WHERE id = ?"
  ).bind(body.data.scheduleId).first<{ id: string; status: string }>();

  if (!schedule) return fail(requestId, 404, "NOT_FOUND", "Schedule not found");
  if (schedule.status === "published") return fail(requestId, 409, "CONFLICT", "Already published");

  const now = nowEpochS();

  await runtime.bindings.DB.batch([
    runtime.bindings.DB.prepare(
      "UPDATE weekly_schedules SET status = 'published', published_at_epoch_s = ?, published_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(now, staff.session.staffUserId, body.data.scheduleId),
    runtime.bindings.DB.prepare(
      "UPDATE fleet_shifts SET status = 'Published', updated_at = CURRENT_TIMESTAMP WHERE schedule_id = ?"
    ).bind(body.data.scheduleId),
    runtime.bindings.DB.prepare(
      `INSERT INTO schedule_audit_log (id, schedule_id, actor_id, action, details_json, created_at_epoch_s)
       VALUES (?, ?, ?, 'publish', '{}', ?)`
    ).bind(newOpaqueId(), body.data.scheduleId, staff.session.staffUserId, now)
  ]);

  return ok(requestId, { published: true, scheduleId: body.data.scheduleId });
}

export async function handleGetEmployees(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");

  const url = new URL(request.url);
  const stationId = url.searchParams.get("stationId");

  let sql = `SELECT sep.staff_user_id, su.display_name, su.email, sep.contract_type,
                    sep.max_weekly_hours, sep.skills_json, sep.availability_json,
                    sep.quality_score, sep.wash_count, sep.preferred_station_id
             FROM staff_employee_profiles sep
             INNER JOIN staff_users su ON su.id = sep.staff_user_id AND su.is_active = 1`;
  const params: string[] = [];

  if (stationId) {
    sql += " WHERE sep.preferred_station_id = ?";
    params.push(stationId);
  }

  sql += " ORDER BY su.display_name ASC";

  const result = await runtime.bindings.DB.prepare(sql).bind(...params).all();

  const employees = (result.results ?? []).map((r: any) => ({
    staffUserId: r.staff_user_id,
    displayName: r.display_name,
    email: r.email,
    contractType: r.contract_type,
    maxWeeklyHours: r.max_weekly_hours,
    skills: JSON.parse(r.skills_json || "[]"),
    availability: JSON.parse(r.availability_json || "{}"),
    qualityScore: r.quality_score,
    washCount: r.wash_count,
    preferredStationId: r.preferred_station_id
  }));

  return ok(requestId, { employees });
}

export async function handleGetStations(
  runtime: RuntimeEnv,
  request: Request,
  requestId: string
): Promise<Response> {
  const staff = await loadStaffSession(runtime, request, false);
  if (!staff.ok) return fail(requestId, 401, "UNAUTHORIZED", "Unable to continue");

  const result = await runtime.bindings.DB.prepare(
    "SELECT id, code, name, timezone, address, is_active, soap_level, wax_level, water_level FROM stations WHERE is_active = 1 ORDER BY name"
  ).all();

  return ok(requestId, { stations: result.results ?? [] });
}
