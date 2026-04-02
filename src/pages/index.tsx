import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Shared Layout ────────────────────────────────────────────

export function PageShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main style={{ margin: "0 auto", maxWidth: "1200px", padding: "1rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.45 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {actions}
      </div>
      {children}
    </main>
  );
}

export function Card({ title, children, style }: { title: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ border: "1px solid #d1d5db", borderRadius: "0.5rem", padding: "1rem", marginBottom: "1rem", background: "#fff", ...style }}>
      <h2 style={{ fontSize: "1rem", marginBottom: "0.6rem", fontWeight: 600 }}>{title}</h2>
      {children}
    </section>
  );
}

// ── API Helpers ──────────────────────────────────────────────

async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

// ── Dashboard Page ───────────────────────────────────────────

interface DashboardStats {
  activeShifts: number;
  vehiclesReady: number;
  todayWashes: number;
  openConflicts: number;
}

export function DashboardPage() {
  const { data: stations } = useQuery({ queryKey: ["stations"], queryFn: () => api<{ stations: any[] }>("/api/staff/stations") });
  const { data: vehicles } = useQuery({ queryKey: ["fleet-vehicles"], queryFn: () => api<{ vehicles: any[] }>("/api/staff/fleet/vehicles") });
  const { data: washes } = useQuery({ queryKey: ["fleet-washes"], queryFn: () => api<{ washes: any[] }>("/api/staff/fleet/washes") });

  const stats: DashboardStats = useMemo(() => ({
    activeShifts: 0,
    vehiclesReady: (vehicles?.vehicles ?? []).filter((v: any) => v.status === "Ready").length,
    todayWashes: (washes?.washes ?? []).length,
    openConflicts: 0
  }), [vehicles, washes]);

  return (
    <PageShell title="FleetOPS Dashboard">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Active Shifts" value={stats.activeShifts} color="#2563eb" />
        <StatCard label="Vehicles Ready" value={stats.vehiclesReady} color="#059669" />
        <StatCard label="Today's Washes" value={stats.todayWashes} color="#7c3aed" />
        <StatCard label="Open Conflicts" value={stats.openConflicts} color="#dc2626" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card title="Stations">
          {(stations?.stations ?? []).length === 0 ? <p style={{ color: "#6b7280" }}>No stations found</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(stations?.stations ?? []).map((s: any) => (
                <li key={s.id} style={{ padding: "0.4rem 0", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between" }}>
                  <span><strong>{s.code}</strong> — {s.name}</span>
                  <span style={{ color: s.is_active ? "#059669" : "#dc2626", fontSize: "0.85rem" }}>{s.is_active ? "Active" : "Inactive"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent Washes">
          {(washes?.washes ?? []).length === 0 ? <p style={{ color: "#6b7280" }}>No washes recorded</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {(washes?.washes ?? []).slice(0, 8).map((w: any) => (
                <li key={w.id} style={{ padding: "0.4rem 0", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between" }}>
                  <span>{w.identifier}</span>
                  <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>{w.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: "2rem", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>{label}</div>
    </div>
  );
}

// ── Scheduling Page ──────────────────────────────────────────

const SHIFT_COLORS: Record<string, string> = { Morning: "#fef3c7", Evening: "#dbeafe", Night: "#e0e7ff" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split("T")[0]!;
}

export function SchedulingPage() {
  const queryClient = useQueryClient();
  const [selectedStation, setSelectedStation] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const { data: stations } = useQuery({ queryKey: ["stations"], queryFn: () => api<{ stations: any[] }>("/api/staff/stations") });

  useEffect(() => {
    if (!selectedStation && stations?.stations?.length) {
      setSelectedStation(stations.stations[0].id);
    }
  }, [stations, selectedStation]);

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule", selectedStation, weekStart],
    queryFn: () => api<{ schedule: any; shifts: any[]; conflicts: any[]; employees: any[] }>(
      `/api/staff/schedules?stationId=${selectedStation}&weekStartDate=${weekStart}`
    ),
    enabled: !!selectedStation
  });

  const generateMutation = useMutation({
    mutationFn: () => api("/api/staff/schedules/generate", {
      method: "POST",
      body: JSON.stringify({ stationId: selectedStation, weekStartDate: weekStart })
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedule"] })
  });

  const publishMutation = useMutation({
    mutationFn: () => api("/api/staff/schedules/publish", {
      method: "POST",
      body: JSON.stringify({ scheduleId: scheduleData?.schedule?.id })
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedule"] })
  });

  const schedule = scheduleData?.schedule;
  const shifts = scheduleData?.shifts ?? [];
  const conflicts = scheduleData?.conflicts ?? [];
  const employees = scheduleData?.employees ?? [];

  // Organize shifts into a grid: employee → day → shift
  const shiftGrid = useMemo(() => {
    const grid: Record<string, Record<string, any>> = {};
    for (const shift of shifts) {
      const empKey = shift.staff_user_id ?? "_unassigned";
      if (!grid[empKey]) grid[empKey] = {};
      const dayOffset = Math.floor((new Date(shift.date_local + "T12:00:00Z").getTime() - new Date(weekStart + "T12:00:00Z").getTime()) / 86400000);
      if (dayOffset >= 0 && dayOffset < 7) {
        grid[empKey][`${dayOffset}-${shift.shift_type}`] = shift;
      }
    }
    return grid;
  }, [shifts, weekStart]);

  const displayEmployees = useMemo(() => {
    const empMap = new Map<string, string>();
    for (const emp of employees) {
      empMap.set(emp.staff_user_id, emp.display_name);
    }
    for (const shift of shifts) {
      if (shift.staff_user_id && !empMap.has(shift.staff_user_id)) {
        empMap.set(shift.staff_user_id, shift.employee_name ?? "Unknown");
      }
    }
    return Array.from(empMap.entries());
  }, [employees, shifts]);

  const changeWeek = useCallback((delta: number) => {
    const d = new Date(weekStart + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(d.toISOString().split("T")[0]!);
  }, [weekStart]);

  return (
    <PageShell
      title="Scheduling"
      actions={
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || !selectedStation}
            style={{ padding: "0.5rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.4rem", cursor: "pointer" }}>
            {generateMutation.isPending ? "Generating..." : "Generate Schedule"}
          </button>
          {schedule?.status === "draft" && (
            <button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}
              style={{ padding: "0.5rem 1rem", background: "#059669", color: "#fff", border: "none", borderRadius: "0.4rem", cursor: "pointer" }}>
              {publishMutation.isPending ? "Publishing..." : "Publish"}
            </button>
          )}
        </div>
      }
    >
      {/* Controls */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value)}
          style={{ padding: "0.4rem", borderRadius: "0.3rem", border: "1px solid #d1d5db" }}>
          <option value="">Select Station</option>
          {(stations?.stations ?? []).map((s: any) => (
            <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
          <button onClick={() => changeWeek(-1)} style={{ padding: "0.3rem 0.6rem", border: "1px solid #d1d5db", borderRadius: "0.3rem", cursor: "pointer", background: "#fff" }}>&larr;</button>
          <span style={{ fontWeight: 500 }}>Week of {weekStart}</span>
          <button onClick={() => changeWeek(1)} style={{ padding: "0.3rem 0.6rem", border: "1px solid #d1d5db", borderRadius: "0.3rem", cursor: "pointer", background: "#fff" }}>&rarr;</button>
        </div>

        {schedule && (
          <span style={{ padding: "0.25rem 0.6rem", borderRadius: "1rem", fontSize: "0.8rem", fontWeight: 600,
            background: schedule.status === "published" ? "#d1fae5" : schedule.status === "draft" ? "#fef3c7" : "#e5e7eb",
            color: schedule.status === "published" ? "#065f46" : schedule.status === "draft" ? "#92400e" : "#374151" }}>
            {schedule.status.toUpperCase()}
          </span>
        )}
      </div>

      {isLoading ? <p>Loading schedule...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1rem" }}>
          {/* Calendar Grid */}
          <Card title="Weekly Calendar">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ border: "1px solid #e5e7eb", padding: "0.5rem", textAlign: "left", minWidth: "120px" }}>Employee</th>
                    {DAYS.map((day, i) => (
                      <th key={day} style={{ border: "1px solid #e5e7eb", padding: "0.5rem", textAlign: "center", minWidth: "100px" }}>{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayEmployees.map(([empId, empName]) => (
                    <tr key={empId}>
                      <td style={{ border: "1px solid #e5e7eb", padding: "0.4rem", fontWeight: 500 }}>{empName}</td>
                      {DAYS.map((_, dayIdx) => {
                        const cellShifts = ["Morning", "Evening", "Night"]
                          .map((type) => shiftGrid[empId]?.[`${dayIdx}-${type}`])
                          .filter(Boolean);
                        return (
                          <td key={dayIdx} style={{ border: "1px solid #e5e7eb", padding: "0.2rem", verticalAlign: "top" }}>
                            {cellShifts.length === 0 ? (
                              <span style={{ color: "#d1d5db", fontSize: "0.8rem" }}>—</span>
                            ) : (
                              cellShifts.map((s: any) => (
                                <div key={s.id} style={{ background: SHIFT_COLORS[s.shift_type] ?? "#f3f4f6", padding: "0.2rem 0.3rem", borderRadius: "0.2rem", marginBottom: "0.15rem", fontSize: "0.75rem" }}>
                                  {s.shift_type}: {s.start_time_local}–{s.end_time_local}
                                </div>
                              ))
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {displayEmployees.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#9ca3af" }}>No schedule generated yet. Click "Generate Schedule" to begin.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Conflict Panel */}
          <Card title={`Conflicts (${conflicts.length})`}>
            {conflicts.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: "0.85rem" }}>No conflicts detected</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {conflicts.map((c: any) => (
                  <li key={c.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "#dc2626" }}>{c.shift_date} — {c.shift_type}</div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{c.reason}</div>
                    {c.suggestions_json && (
                      <ul style={{ margin: "0.3rem 0 0 1rem", fontSize: "0.75rem", color: "#4b5563" }}>
                        {JSON.parse(c.suggestions_json).map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </PageShell>
  );
}

// ── Fleet Management Page ────────────────────────────────────

export function FleetPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newMakeModel, setNewMakeModel] = useState("");

  const { data: vehicleData, isLoading } = useQuery({
    queryKey: ["fleet-vehicles"],
    queryFn: () => api<{ vehicles: any[] }>("/api/staff/fleet/vehicles")
  });

  const addMutation = useMutation({
    mutationFn: () => api("/api/staff/fleet/vehicles", {
      method: "POST",
      body: JSON.stringify({ plate: newPlate, makeModel: newMakeModel })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fleet-vehicles"] });
      setShowAdd(false);
      setNewPlate("");
      setNewMakeModel("");
    }
  });

  const vehicles = vehicleData?.vehicles ?? [];
  const statusGroups = useMemo(() => {
    const groups: Record<string, any[]> = { Ready: [], Cleaning: [], Maintenance: [], Rented: [] };
    for (const v of vehicles) {
      (groups[v.status] ?? (groups[v.status] = [])).push(v);
    }
    return groups;
  }, [vehicles]);

  return (
    <PageShell
      title="Fleet Management"
      actions={
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "0.5rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.4rem", cursor: "pointer" }}>
          + Add Vehicle
        </button>
      }
    >
      {showAdd && (
        <Card title="New Vehicle">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#6b7280" }}>Plate</label>
              <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)}
                style={{ padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.3rem" }} placeholder="ABC-1234" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#6b7280" }}>Make/Model</label>
              <input value={newMakeModel} onChange={(e) => setNewMakeModel(e.target.value)}
                style={{ padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.3rem" }} placeholder="Toyota Yaris" />
            </div>
            <button onClick={() => addMutation.mutate()} disabled={!newPlate || !newMakeModel || addMutation.isPending}
              style={{ padding: "0.4rem 1rem", background: "#059669", color: "#fff", border: "none", borderRadius: "0.3rem", cursor: "pointer" }}>
              {addMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </Card>
      )}

      {isLoading ? <p>Loading fleet...</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {Object.entries(statusGroups).map(([status, items]) => (
            <Card key={status} title={`${status} (${items.length})`}>
              {items.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: "0.85rem" }}>No vehicles</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {items.map((v: any) => (
                    <li key={v.id} style={{ padding: "0.4rem 0", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 500 }}>{v.plate}</span>
                      <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{v.makeModel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ── Washer Workspace Page ────────────────────────────────────

export function WasherWorkspacePage() {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);

  const washMutation = useMutation({
    mutationFn: (id: string) => api<{ id: string; identifier: string }>("/api/staff/fleet/washes", {
      method: "POST",
      body: JSON.stringify({ identifier: id, stationId: "STATION_001", operatorId: "self" })
    }),
    onSuccess: (data) => {
      setFeedback({ type: "success", message: `Wash ${data.identifier} completed` });
      setIdentifier("");
      queryClient.invalidateQueries({ queryKey: ["fleet-washes"] });
    },
    onError: (err: Error) => {
      setFeedback({ type: "error", message: err.message });
    }
  });

  const { data: recentWashes } = useQuery({
    queryKey: ["fleet-washes"],
    queryFn: () => api<{ washes: any[] }>("/api/staff/fleet/washes"),
    refetchInterval: 30000
  });

  const clockInMutation = useMutation({
    mutationFn: () => api("/api/staff/shifts/clock-in", { method: "POST" })
  });

  return (
    <PageShell title="Washer Workspace">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Quick Actions */}
        <div>
          <Card title="Clock In">
            <button onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending || clockInMutation.isSuccess}
              style={{ padding: "0.6rem 1.5rem", background: clockInMutation.isSuccess ? "#059669" : "#2563eb",
                color: "#fff", border: "none", borderRadius: "0.4rem", cursor: "pointer", width: "100%" }}>
              {clockInMutation.isSuccess ? "Clocked In" : clockInMutation.isPending ? "Clocking in..." : "Clock In"}
            </button>
          </Card>

          <Card title="Register Wash">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.3rem", fontSize: "1.1rem" }}
                placeholder="Scan or type plate/reservation #" autoFocus />
              <button onClick={() => washMutation.mutate(identifier)} disabled={!identifier || washMutation.isPending}
                style={{ padding: "0.6rem", background: "#059669", color: "#fff", border: "none", borderRadius: "0.4rem", cursor: "pointer", fontSize: "1rem" }}>
                {washMutation.isPending ? "Registering..." : "Complete Wash"}
              </button>
            </div>

            {feedback && (
              <div style={{
                marginTop: "0.5rem", padding: "0.6rem", borderRadius: "0.4rem",
                background: feedback.type === "success" ? "#d1fae5" : feedback.type === "warning" ? "#fef3c7" : "#fee2e2",
                color: feedback.type === "success" ? "#065f46" : feedback.type === "warning" ? "#92400e" : "#991b1b"
              }}>
                {feedback.message}
              </div>
            )}
          </Card>
        </div>

        {/* Recent Washes */}
        <Card title="Recent Washes">
          {(recentWashes?.washes ?? []).length === 0 ? (
            <p style={{ color: "#9ca3af" }}>No washes recorded today</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "400px", overflowY: "auto" }}>
              {(recentWashes?.washes ?? []).slice(0, 20).map((w: any) => (
                <li key={w.id} style={{ padding: "0.4rem 0", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 500 }}>{w.identifier}</span>
                  <span style={{ color: w.status === "completed" ? "#059669" : "#6b7280", fontSize: "0.85rem" }}>{w.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
