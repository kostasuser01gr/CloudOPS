import { create } from 'zustand';
import { 
  Employee, WeeklySchedule, Conflict, Shift, AuditLogEntry, User, 
  ChatMessage, WeekVisibility, FleetVehicle, ReservationData,
  ChatThread, MaintenanceRecord, KeyHandover, Permission
} from '../types';
import { MOCK_EMPLOYEES } from '../mockData';
import { SchedulingService } from '../services/SchedulingService';
import { ModelFusionService } from '../services/ModelFusionService';
import { startOfWeek, format, parseISO, addHours } from 'date-fns';

interface AppState {
  currentUser: User | null;
  employees: Employee[];
  currentSchedule: WeeklySchedule | null;
  conflicts: Conflict[];
  aiInsights: string[];
  isLoading: boolean;
  publishLock: boolean;
  selectedBranch: string;
  chatMessages: ChatMessage[];
  chatThreads: ChatThread[];
  blurredWeeks: WeekVisibility[];
  fleet: FleetVehicle[];
  activeReservations: ReservationData[];
  keyHandovers: KeyHandover[];
  
  // Auth & Permissions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  can: (permission: Permission) => boolean;

  // General Actions
  generateWeeklySchedule: (weekStart: Date) => Promise<void>;
  updateShift: (shiftId: string, employeeId: string | null) => void;
  publishSchedule: () => void;
  addAuditLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  getEmployeeMetrics: () => Record<string, { totalHours: number; overtimeRisk: boolean }>;
  setBranch: (branchId: string) => void;
  
  // Fleet & Reservation Actions
  updateVehicleStatus: (id: string, status: FleetVehicle['status']) => void;
  addMaintenanceRecord: (vehicleId: string, record: Omit<MaintenanceRecord, 'id'>) => void;
  logKeyHandover: (handover: Omit<KeyHandover, 'id' | 'timestamp'>) => void;
  processReservationExcel: (csvData: string) => Promise<void>;
  
  // Chat & AI Actions
  sendMessage: (content: string, channel?: string, threadId?: string) => Promise<void>;
  createThread: (title: string, incidentType: ChatThread['incidentType']) => string;
  blurWeek: (weekStart: string, branchId: string, isBlurred: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  employees: MOCK_EMPLOYEES,
  currentSchedule: null,
  conflicts: [],
  aiInsights: [],
  isLoading: false,
  publishLock: false,
  selectedBranch: 'LON-AIRPORT',
  chatMessages: [],
  chatThreads: [],
  blurredWeeks: [],
  activeReservations: [],
  keyHandovers: [],
  fleet: [
    { id: 'v1', plate: 'ABC-123', model: 'VW Golf', status: 'Ready', location: 'Zone A', keyLocation: 'Safe', mileage: 12000, lastService: '2026-01-15', maintenanceHistory: [] },
    { id: 'v2', plate: 'XYZ-789', model: 'BMW 320i', status: 'Cleaning', location: 'Bay 4', keyLocation: 'Cleaning Desk', mileage: 45000, lastService: '2025-11-20', maintenanceHistory: [] },
    { id: 'v3', plate: 'DEF-456', model: 'Mercedes C-Class', status: 'Maintenance', location: 'Workshop', keyLocation: 'Workshop Rack', mileage: 8000, lastService: '2026-03-01', maintenanceHistory: [] },
  ],

  can: (permission) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    return currentUser.permissions.includes(permission);
  },

  login: (username, password) => {
    // Role-Based User Definitions
    const users: Record<string, User & { pw: string }> = {
      'Konstantina Tzanidaki': { 
        id: 'admin-1', username: 'Konstantina Tzanidaki', role: 'Super-Admin', pw: 'kz123456',
        permissions: ['VIEW_ALL_BRANCHES', 'MANAGE_SCHEDULE', 'BLUR_WEEKS', 'SYNC_RESERVATIONS', 'AI_COMMAND', 'MANAGE_FLEET_STRATEGY', 'UPDATE_FLEET_STATUS', 'LOG_KEY_HANDOVER']
      },
      'Lidia Marntogian': { 
        id: 'fleet-1', username: 'Lidia Marntogian', role: 'Fleet-Supervisor', level: 1, pw: 'lidia123',
        permissions: ['MANAGE_FLEET_STRATEGY', 'UPDATE_FLEET_STATUS', 'LOG_KEY_HANDOVER']
      },
      'Giannis Kastrinakis': { 
        id: 'fleet-2', username: 'Giannis Kastrinakis', role: 'Fleet-Supervisor', level: 2, pw: 'giannis123',
        permissions: ['UPDATE_FLEET_STATUS', 'LOG_KEY_HANDOVER']
      },
      'Staff Member': {
        id: 'staff-1', username: 'Staff Member', role: 'Staff', pw: 'staff123',
        permissions: []
      }
    };

    const user = users[username];
    if (user && user.pw === password) {
      const { pw, ...userProfile } = user;
      set({ currentUser: userProfile });
      return true;
    }
    return false;
  },

  logout: () => set({ currentUser: null, currentSchedule: null }),

  setBranch: (branchId) => {
    if (get().can('VIEW_ALL_BRANCHES')) set({ selectedBranch: branchId });
  },

  blurWeek: (weekStart, branchId, isBlurred) => {
    if (!get().can('BLUR_WEEKS')) return;
    const { blurredWeeks } = get();
    const updated = blurredWeeks.filter(b => !(b.weekStart === weekStart && b.branchId === branchId));
    if (isBlurred) updated.push({ weekStart, branchId, isBlurred: true });
    set({ blurredWeeks: updated });
  },

  updateVehicleStatus: (id, status) => {
    if (!get().can('UPDATE_FLEET_STATUS')) return;
    set(state => ({ fleet: state.fleet.map(v => v.id === id ? { ...v, status } : v) }));
  },

  addMaintenanceRecord: (vehicleId, record) => {
    if (!get().can('MANAGE_FLEET_STRATEGY')) return;
    const newRecord = { ...record, id: Math.random().toString(36).substr(2, 9) };
    set(state => ({
      fleet: state.fleet.map(v => v.id === vehicleId ? { ...v, maintenanceHistory: [newRecord, ...v.maintenanceHistory], status: 'Maintenance' } : v)
    }));
  },

  logKeyHandover: (handover) => {
    if (!get().can('LOG_KEY_HANDOVER')) return;
    const newHandover = { ...handover, id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString() };
    const staffName = get().employees.find(e => e.id === handover.toUserId)?.name || 'Unknown';
    set(state => ({
      keyHandovers: [newHandover, ...state.keyHandovers],
      fleet: state.fleet.map(v => v.id === handover.vehicleId ? { ...v, keyLocation: staffName } : v)
    }));
  },

  processReservationExcel: async (csvData) => {
    if (!get().can('SYNC_RESERVATIONS')) return;
    set({ isLoading: true });
    const reservations: ReservationData[] = [
      { id: 'res1', pickupTime: addHours(new Date(), 2).toISOString(), returnTime: addHours(new Date(), 48).toISOString(), carCategory: 'Economy', branchId: get().selectedBranch },
      { id: 'res2', pickupTime: addHours(new Date(), 4).toISOString(), returnTime: addHours(new Date(), 72).toISOString(), carCategory: 'Luxury', branchId: get().selectedBranch }
    ];
    set({ activeReservations: reservations, isLoading: false });
    await get().generateWeeklySchedule(startOfWeek(new Date(), { weekStartsOn: 1 }));
  },

  createThread: (title, incidentType) => {
    const threadId = Math.random().toString(36).substr(2, 9);
    set(state => ({ chatThreads: [...state.chatThreads, { id: threadId, title, incidentType, messages: [], status: 'Open' }] }));
    return threadId;
  },

  sendMessage: async (content, channel = 'general', threadId) => {
    const { currentUser, selectedBranch } = get();
    if (!currentUser) return;

    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: currentUser.id,
      senderName: currentUser.username,
      content,
      timestamp: new Date().toISOString(),
      channel,
      threadId,
      tags: content.match(/@\w+/g) || undefined
    };

    if (threadId) {
      set(state => ({ chatThreads: state.chatThreads.map(t => t.id === threadId ? { ...t, messages: [...t.messages, newMessage] } : t) }));
    } else {
      set(state => ({ chatMessages: [...state.chatMessages, newMessage] }));
    }

    // AI COMMAND parsing restricted to Super-Admin
    if (get().can('AI_COMMAND') && content.toLowerCase().startsWith('/ai')) {
      const command = content.substring(4).trim();
      set({ isLoading: true });
      const aiResponse = await ModelFusionService.processTask(`Super-Admin Command: ${command}`, 'Fusion');
      const aiMsg: ChatMessage = { id: Math.random().toString(36).substr(2, 9), senderId: 'ai-fusion', senderName: 'ShiftWise-AI', content: aiResponse.content, timestamp: new Date().toISOString(), channel, threadId, isAiResponse: true };
      
      if (threadId) {
        set(state => ({ chatThreads: state.chatThreads.map(t => t.id === threadId ? { ...t, messages: [...t.messages, aiMsg] } : t) }));
      } else {
        set(state => ({ chatMessages: [...state.chatMessages, aiMsg] }));
      }
      set({ isLoading: false });

      // Action routing
      const lowCmd = command.toLowerCase();
      if (lowCmd.includes('blur')) get().blurWeek(startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(), selectedBranch, true);
      if (lowCmd.includes('unblur')) get().blurWeek(startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(), selectedBranch, false);
      if (lowCmd.includes('optimize')) await get().generateWeeklySchedule(startOfWeek(new Date(), { weekStartsOn: 1 }));
    }
  },

  generateWeeklySchedule: async (weekStart: Date) => {
    if (!get().can('MANAGE_SCHEDULE')) return;
    set({ isLoading: true, aiInsights: [] });
    try {
      const { shifts, conflicts, aiInsights } = await SchedulingService.generateSchedule(weekStart, get().employees, get().activeReservations);
      set({ currentSchedule: { id: `schedule-${format(weekStart, 'yyyy-MM-dd')}`, weekStart: weekStart.toISOString(), isPublished: false, shifts, auditLog: [] }, conflicts, aiInsights, isLoading: false, publishLock: false });
    } catch (e) { set({ isLoading: false }); }
  },

  updateShift: (shiftId, employeeId) => {
    if (!get().can('MANAGE_SCHEDULE')) return;
    const { currentSchedule } = get();
    if (!currentSchedule || currentSchedule.isPublished) return;
    set({ currentSchedule: { ...currentSchedule, shifts: currentSchedule.shifts.map(s => s.id === shiftId ? { ...s, employeeId } : s) } });
  },

  publishSchedule: () => {
    if (get().can('MANAGE_SCHEDULE') && get().currentSchedule) set({ publishLock: true });
  },

  addAuditLog: (entry) => {
    const { currentSchedule } = get();
    if (!currentSchedule) return;
    const logEntry = { ...entry, id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString() };
    set({ currentSchedule: { ...currentSchedule, auditLog: [logEntry, ...currentSchedule.auditLog] } });
  },

  getEmployeeMetrics: () => {
    const { currentSchedule, employees } = get();
    if (!currentSchedule) return {};
    const metrics: Record<string, { totalHours: number; overtimeRisk: boolean }> = {};
    employees.forEach(e => {
      const hours = currentSchedule.shifts.filter(s => s.employeeId === e.id).length * 8;
      metrics[e.id] = { totalHours: hours, overtimeRisk: hours >= e.maxWeeklyHours };
    });
    return metrics;
  }
}));
