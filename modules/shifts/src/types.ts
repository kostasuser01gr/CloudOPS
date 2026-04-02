export type ContractType = 'Full-Time' | 'Part-Time';
export type ShiftType = 'Morning' | 'Evening' | 'Night';
export type ShiftStatus = 'Pending' | 'Published' | 'Completed';
export type StaffSkill = 'Front-Desk' | 'Driver' | 'Valeting' | 'Mechanic' | 'Supervisor';
export type AIModelSource = 'Local' | 'Cloud' | 'Fusion';

export interface Employee {
  id: string;
  name: string;
  role: string;
  branchId: string;
  skills: StaffSkill[];
  contractType: ContractType;
  maxWeeklyHours: number;
  availability: Record<number, string[]>;
  leaveRequests: string[];
  lastNightShift?: string;
  location?: { lat: number; lng: number }; // For geofencing
}

export interface FlightData {
  flightNumber: string;
  scheduledTime: string;
  estimatedTime: string;
  status: 'On-Time' | 'Delayed' | 'Cancelled';
  passengerCount: number;
}

export interface FleetMetrics {
  totalCars: number;
  expectedReturns: number;
  cleaningQueue: number;
  maintenanceRequired: number;
}

export interface RuleViolation {
  level: 'error' | 'warning';
  message: string;
}

export interface Shift {
  id: string;
  employeeId: string | null;
  branchId: string;
  startTime: string;
  endTime: string;
  type: ShiftType;
  requiredSkills: StaffSkill[];
  status: ShiftStatus;
  ruleViolations: RuleViolation[];
}

export interface AIResponse {
  content: string;
  modelUsed: string;
  confidence: number;
  latency: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  details: string;
}

export type UserRole = 'Super-Admin' | 'Supervisor' | 'Fleet-Supervisor' | 'Staff';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  branchId?: string;
  level?: number; // 1 for Primary, 2 for Secondary
  permissions: Permission[];
}

export type Permission = 
  | 'VIEW_ALL_BRANCHES' 
  | 'MANAGE_SCHEDULE' 
  | 'BLUR_WEEKS' 
  | 'SYNC_RESERVATIONS' 
  | 'AI_COMMAND' 
  | 'MANAGE_FLEET_STRATEGY' 
  | 'UPDATE_FLEET_STATUS' 
  | 'LOG_KEY_HANDOVER';

export interface FleetVehicle {
  id: string;
  plate: string;
  model: string;
  status: 'Ready' | 'Cleaning' | 'Maintenance' | 'Rented';
  location: string;
  keyLocation: string;
  mileage: number;
  lastService: string; // ISO Date
  maintenanceHistory: MaintenanceRecord[];
}

export interface MaintenanceRecord {
  id: string;
  type: 'Oil Change' | 'Tires' | 'Brakes' | 'Damage Repair';
  date: string;
  cost: number;
  technician: string;
}

export interface KeyHandover {
  id: string;
  vehicleId: string;
  fromUserId: string;
  toUserId: string;
  timestamp: string;
}

export interface ChatThread {
  id: string;
  title: string;
  incidentType: 'Damage' | 'Delay' | 'Fleet-Shortage';
  messages: ChatMessage[];
  status: 'Open' | 'Resolved';
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  channel: string;
  isAiResponse?: boolean;
  threadId?: string;
  tags?: string[]; // e.g. ["@Drivers", "@Supervisor"]
}

export interface WeekVisibility {
  weekStart: string; // ISO date
  isBlurred: boolean;
  branchId: string;
}

export interface WeeklySchedule {
  id: string;
  weekStart: string; // ISO date
  isPublished: boolean;
  shifts: Shift[];
  auditLog: AuditLogEntry[];
}

export interface Conflict {
  shiftId: string;
  reason: string;
  suggestions: string[];
}

export interface ImportMapping {
  csvColumn: string;
  internalField: keyof Employee;
}
