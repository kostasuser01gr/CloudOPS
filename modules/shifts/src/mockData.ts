import { Employee, ShiftType, ContractType, StaffSkill, FlightData, FleetMetrics } from './types';

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: 'emp1',
    name: 'Alice Johnson',
    role: 'Staff',
    branchId: 'LON-CENTRAL',
    skills: ['Front-Desk', 'Driver'],
    contractType: 'Full-Time',
    maxWeeklyHours: 40,
    availability: { 0: ['Morning', 'Evening'], 1: ['Morning', 'Evening'], 2: ['Morning', 'Evening'], 3: ['Morning', 'Evening'], 4: ['Morning', 'Evening'] },
    leaveRequests: [],
  },
  {
    id: 'emp2',
    name: 'Bob Smith',
    role: 'Staff',
    branchId: 'LON-CENTRAL',
    skills: ['Valeting', 'Driver'],
    contractType: 'Full-Time',
    maxWeeklyHours: 40,
    availability: { 0: ['Evening', 'Night'], 1: ['Evening', 'Night'], 2: ['Evening', 'Night'], 3: ['Evening', 'Night'], 4: ['Evening', 'Night'] },
    leaveRequests: [],
  },
  {
    id: 'emp3',
    name: 'Charlie Brown',
    role: 'Staff',
    branchId: 'LON-AIRPORT',
    skills: ['Driver', 'Mechanic'],
    contractType: 'Part-Time',
    maxWeeklyHours: 20,
    availability: { 0: ['Morning'], 1: ['Morning'], 2: ['Morning'], 3: ['Morning'], 4: ['Morning'] },
    leaveRequests: [],
  },
  // Adding more diverse roles...
  {
    id: 'emp4',
    name: 'David Wilson',
    role: 'Staff',
    branchId: 'LON-AIRPORT',
    skills: ['Front-Desk', 'Supervisor'],
    contractType: 'Full-Time',
    maxWeeklyHours: 40,
    availability: { 0: ['Morning', 'Evening', 'Night'], 1: ['Morning', 'Evening', 'Night'], 2: ['Morning', 'Evening', 'Night'], 3: ['Morning', 'Evening', 'Night'], 4: ['Morning', 'Evening', 'Night'] },
    leaveRequests: [],
  },
  {
    id: 'emp5',
    name: 'Eve Davis',
    role: 'Staff',
    branchId: 'LON-CENTRAL',
    skills: ['Valeting'],
    contractType: 'Full-Time',
    maxWeeklyHours: 40,
    availability: { 0: ['Morning', 'Evening'], 1: ['Morning', 'Evening'], 2: ['Morning', 'Evening'], 3: ['Morning', 'Evening'], 4: ['Morning', 'Evening'] },
    leaveRequests: ['2026-04-01'],
  },
];

export const MOCK_FLIGHTS: FlightData[] = [
  { flightNumber: 'BA123', scheduledTime: '2026-03-30T10:00:00Z', estimatedTime: '2026-03-30T12:30:00Z', status: 'Delayed', passengerCount: 180 },
  { flightNumber: 'LH456', scheduledTime: '2026-03-30T14:00:00Z', estimatedTime: '2026-03-30T14:00:00Z', status: 'On-Time', passengerCount: 120 },
  { flightNumber: 'AF789', scheduledTime: '2026-03-31T08:30:00Z', estimatedTime: '2026-03-31T09:15:00Z', status: 'Delayed', passengerCount: 210 },
];

export const MOCK_FLEET: FleetMetrics = {
  totalCars: 450,
  expectedReturns: 85,
  cleaningQueue: 12,
  maintenanceRequired: 4,
};

export const SHIFT_DETAILS = {
  Morning: { start: '08:00', end: '16:00', duration: 8 },
  Evening: { start: '16:00', end: '00:00', duration: 8 },
  Night: { start: '00:00', end: '08:00', duration: 8 },
};

export const SHIFT_DETAILS = {
  Morning: { start: '08:00', end: '16:00', duration: 8 },
  Evening: { start: '16:00', end: '00:00', duration: 8 },
  Night: { start: '00:00', end: '08:00', duration: 8 },
};
