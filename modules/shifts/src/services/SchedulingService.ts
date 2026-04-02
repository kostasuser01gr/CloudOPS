import { Employee, Shift, ShiftType, WeeklySchedule, Conflict, RuleViolation, StaffSkill, ReservationData } from '../types';
import { SHIFT_DETAILS, MOCK_FLIGHTS, MOCK_FLEET } from '../mockData';
import { ModelFusionService } from './ModelFusionService';
import { addDays, format, parseISO, differenceInHours, isSameDay, isAfter, isBefore, addHours } from 'date-fns';

export class SchedulingService {
  /**
   * Generates a weekly schedule using AI Fusion, Flight Data, and Reservation Volumes.
   */
  static async generateSchedule(
    weekStart: Date, 
    employees: Employee[], 
    reservations: ReservationData[] = []
  ): Promise<{ shifts: Shift[], conflicts: Conflict[], aiInsights: string[] }> {
    const shifts: Shift[] = [];
    const conflicts: Conflict[] = [];
    const employeeHours: Record<string, number> = {};
    const lastShiftEnd: Record<string, string> = {};
    const nightShiftCounts: Record<string, number> = {};

    employees.forEach(e => {
      employeeHours[e.id] = 0;
      nightShiftCounts[e.id] = 0;
    });

    const shiftTypes: ShiftType[] = ['Morning', 'Evening', 'Night'];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const currentDay = addDays(weekStart, dayOffset);
      const dayIndex = currentDay.getDay();

      for (const type of shiftTypes) {
        const shiftId = `shift-${format(currentDay, 'yyyy-MM-dd')}-${type}`;
        const startTime = this.getShiftTime(currentDay, type, 'start');
        const endTime = this.getShiftTime(currentDay, type, 'end');

        // Demand Analysis: Check reservation volume for this shift
        const shiftReservations = reservations.filter(r => 
          isSameDay(parseISO(r.pickupTime), currentDay)
        );
        
        // Dynamic Requirement Logic: More reservations = More Front-Desk + Drivers
        const requiredSkills = this.determineRequiredSkills(currentDay, type, shiftReservations);
        const requiredStaffCount = this.calculateRequiredStaff(type, shiftReservations.length);

        for (let i = 0; i < requiredStaffCount; i++) {
          const subShiftId = `${shiftId}-${i}`;
          const candidates = employees.filter(emp => {
            if (!emp.availability[dayIndex]?.includes(type)) return false;
            if (emp.leaveRequests.some(lr => isSameDay(parseISO(lr), currentDay))) return false;
            if (lastShiftEnd[emp.id] && differenceInHours(parseISO(startTime), parseISO(lastShiftEnd[emp.id])) < 0) return false;
            if (employeeHours[emp.id] + SHIFT_DETAILS[type].duration > emp.maxWeeklyHours) return false;
            
            // Skill Match: Ensure we fill roles based on reservations
            const neededSkill = requiredSkills[i] || 'Driver';
            if (!emp.skills.includes(neededSkill)) return false;

            return true;
          });

          // Sort by Fairness and Contract
          candidates.sort((a, b) => {
            if (type === 'Night') {
              const countA = nightShiftCounts[a.id];
              const countB = nightShiftCounts[b.id];
              if (countA !== countB) return countA - countB;
            }
            if (a.contractType !== b.contractType) return a.contractType === 'Full-Time' ? -1 : 1;
            return (b.maxWeeklyHours - employeeHours[b.id]) - (a.maxWeeklyHours - employeeHours[a.id]);
          });

          const selected = candidates[0];

          if (selected) {
            const ruleViolations: RuleViolation[] = [];
            if (lastShiftEnd[selected.id]) {
              const rest = differenceInHours(parseISO(startTime), parseISO(lastShiftEnd[selected.id]));
              if (rest < 11 && rest >= 0) {
                ruleViolations.push({ level: 'warning', message: `Quick turn: ${rest}h rest.` });
              }
            }

            shifts.push({
              id: subShiftId,
              employeeId: selected.id,
              branchId: selected.branchId,
              startTime,
              endTime,
              type,
              requiredSkills: [requiredSkills[i] || 'Driver'],
              status: 'Pending',
              ruleViolations,
            });

            employeeHours[selected.id] += SHIFT_DETAILS[type].duration;
            lastShiftEnd[selected.id] = endTime;
            if (type === 'Night') nightShiftCounts[selected.id]++;
          } else {
            shifts.push({
              id: subShiftId,
              employeeId: null,
              branchId: 'UNASSIGNED',
              startTime,
              endTime,
              type,
              requiredSkills: [requiredSkills[i] || 'Driver'],
              status: 'Pending',
              ruleViolations: [{ level: 'error', message: 'No qualified staff for reservation demand.' }],
            });

            conflicts.push({
              shiftId: subShiftId,
              reason: `High demand: missing ${requiredSkills[i] || 'Driver'} for ${shiftReservations.length} pickups.`,
              suggestions: ['Call part-time staff', 'Override max hours'],
            });
          }
        }
      }
    }

    const { insights } = await ModelFusionService.validateSchedule({ shifts, flights: MOCK_FLIGHTS, resCount: reservations.length });
    return { shifts, conflicts, aiInsights: insights };
  }

  private static calculateRequiredStaff(type: ShiftType, resCount: number): number {
    if (resCount > 20) return 4;
    if (resCount > 10) return 3;
    if (type === 'Night') return 1;
    return 2;
  }

  private static determineRequiredSkills(day: Date, type: ShiftType, res: ReservationData[]): StaffSkill[] {
    const skills: StaffSkill[] = [];
    const highEndRes = res.filter(r => ['Luxury', 'SUV'].includes(r.carCategory)).length;

    // High end customers need Front-Desk priority
    if (highEndRes > 2) skills.push('Front-Desk');
    
    // Cleaning demand
    if (res.length > 5 && type === 'Morning') skills.push('Valeting');

    // Default to Drivers
    while (skills.length < 4) skills.push('Driver');
    
    return skills;
  }

  private static getShiftTime(day: Date, type: ShiftType, part: 'start' | 'end'): string {
    const time = SHIFT_DETAILS[type][part];
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date(day);
    date.setHours(hours, minutes, 0, 0);
    if ((type === 'Night' || type === 'Evening') && part === 'end') {
      return addDays(date, 1).toISOString();
    }
    return date.toISOString();
  }
}

  private static getShiftTime(day: Date, type: ShiftType, part: 'start' | 'end'): string {
    const time = SHIFT_DETAILS[type][part];
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date(day);
    date.setHours(hours, minutes, 0, 0);
    if ((type === 'Night' || type === 'Evening') && part === 'end') {
      return addDays(date, 1).toISOString();
    }
    return date.toISOString();
  }
}
