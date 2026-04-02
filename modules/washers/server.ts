import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, startOfWeek, endOfWeek, isAfter, startOfDay, subHours, parseISO, isSameDay } from 'date-fns';

const app = express();
app.use(cors());
app.use(express.json());

// --- TYPES ---
interface Comment { id: string; userId: string; userName: string; content: string; severity: string; createdAt: string; }
interface AuditEntry { timestamp: string; userId: string; action: string; details: string; }

interface Registration {
  id: string; identifier: string; normalizedIdentifier: string;
  method: string; confidence: number; branchId: string; branchName: string;
  operatorId: string; operatorName: string; status: string; priority: string;
  issueFlag: boolean; duplicateFlag: boolean; comments: Comment[];
  auditTrail: AuditEntry[]; version: number; createdAt: string; updatedAt: string;
  completedAt?: string; fleetSyncStatus: string;
  checkoutPhotoUrl?: string; checkinPhotoUrl?: string; // AI Vision
}

interface Employee {
  id: string; name: string; role: string;
  contractType: string; maxWeeklyHours: number; branchId: string;
  washCount: number; qualityScore: number; // Performance
}

interface Shift {
  id: string; employeeId: string; branchId: string;
  date: string; type: 'Morning' | 'Evening' | 'Night';
  startTime: string; endTime: string; status: string;
}

// --- DB ---
let registrations: Registration[] = [];
let employees: Employee[] = [
  { id: 'W01', name: 'John Washer', role: 'washer', contractType: 'full-time', maxWeeklyHours: 40, branchId: 'B01', washCount: 142, qualityScore: 4.8 },
  { id: 'W02', name: 'Mike Washer', role: 'washer', contractType: 'part-time', maxWeeklyHours: 20, branchId: 'B01', washCount: 89, qualityScore: 4.5 },
  { id: 'S01', name: 'Sarah Staff', role: 'staff', contractType: 'full-time', maxWeeklyHours: 40, branchId: 'B01', washCount: 0, qualityScore: 5.0 }
];
let shifts: Shift[] = [];
let branches = [
  { id: 'B01', name: 'Central HQ', status: 'active', resources: { soap: 85, wax: 92, water: 98 } },
  { id: 'B02', name: 'North Point', status: 'active', resources: { soap: 42, wax: 15, water: 80 } }
];

// --- ENDPOINTS: INTELLIGENCE ---

app.get('/api/forecast/demand', (req, res) => {
  const { branchId } = req.query;
  // Mock demand curve (Hourly returns vs Scheduled staff)
  const data = [
    { hour: '08:00', vehicles: 5, staff: 2 }, { hour: '10:00', vehicles: 12, staff: 3 },
    { hour: '12:00', vehicles: 25, staff: 3 }, { hour: '14:00', vehicles: 18, staff: 4 },
    { hour: '16:00', vehicles: 45, staff: 4 }, { hour: '18:00', vehicles: 30, staff: 3 },
    { hour: '20:00', vehicles: 15, staff: 2 }
  ];
  res.json(data);
});

app.get('/api/workforce/leaderboard', (req, res) => {
  const top = [...employees]
    .filter(e => e.role === 'washer')
    .sort((a, b) => b.washCount - a.washCount)
    .slice(0, 5);
  res.json(top);
});

// --- REUSED ENDPOINTS (UPDATED) ---

app.post('/api/registrations', (req, res) => {
  const { identifier, method, branchId, branchName, operatorId, operatorName } = req.body;
  const normalized = identifier.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  const newReg: Registration = {
    id: uuidv4(), identifier, normalizedIdentifier: normalized, method: method || 'manual', confidence: 1.0,
    branchId: branchId || 'B01', branchName: branchName || 'Central HQ', operatorId: operatorId || 'W01', operatorName: operatorName || 'System',
    status: 'pending', priority: 'normal', issueFlag: false, duplicateFlag: false,
    comments: [], auditTrail: [], version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), fleetSyncStatus: 'not_required',
    checkoutPhotoUrl: 'https://placehold.co/600x400?text=Checkout+Baseline',
    checkinPhotoUrl: 'https://placehold.co/600x400?text=Current+Condition'
  };

  registrations.push(newReg);
  // Increment operator wash count
  const emp = employees.find(e => e.id === operatorId);
  if (emp) emp.washCount++;

  res.status(201).json(newReg);
});

app.get('/api/shifts', (req, res) => {
  const { branchId, date } = req.query;
  let filtered = shifts;
  if (branchId) filtered = filtered.filter(s => s.branchId === branchId);
  if (date) filtered = filtered.filter(s => s.date === date);
  res.json(filtered);
});

app.post('/api/shifts/generate', (req, res) => {
  const { branchId, weekStart } = req.body;
  const days = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(weekStart), i), 'yyyy-MM-dd'));
  const branchEmployees = employees.filter(e => e.branchId === branchId);
  const newShifts: Shift[] = [];

  days.forEach(day => {
    ['Morning', 'Evening', 'Night'].forEach(type => {
      const available = branchEmployees.filter(e => newShifts.filter(s => s.employeeId === e.id).length * 8 < e.maxWeeklyHours);
      if (available.length > 0) {
        const emp = available[Math.floor(Math.random() * available.length)];
        newShifts.push({
          id: uuidv4(), employeeId: emp.id, branchId, date: day, type: type as any,
          startTime: type === 'Morning' ? '06:00' : type === 'Evening' ? '14:00' : '22:00',
          endTime: type === 'Morning' ? '14:00' : type === 'Evening' ? '22:00' : '06:00',
          status: 'draft'
        });
      }
    });
  });
  shifts = [...shifts.filter(s => s.branchId !== branchId), ...newShifts];
  res.json(newShifts);
});

app.get('/api/employees', (req, res) => res.json(employees));
app.get('/api/registrations', (req, res) => res.json(registrations.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())));
app.get('/api/branches', (req, res) => res.json(branches));
app.get('/api/system/health', (req, res) => res.json({ status: 'OPTIMAL', apiLatency: '14ms', activeBranches: branches.length }));
app.get('/api/inspector/logic', (req, res) => res.json({ rules: {}, blockedAttempts: [], decisionPoints: [] }));

const PORT = 3001;
app.listen(PORT, () => console.log(`Internal Intelligence API on http://localhost:${PORT}`));
