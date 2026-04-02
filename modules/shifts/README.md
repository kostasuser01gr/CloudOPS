# ShiftWise - Employee Shift Scheduler

A production-style React application for managing weekly employee shifts with an automated heuristic-based scheduling engine.

## File Structure
- `src/types.ts`: TypeScript interfaces for the domain model (Employees, Shifts, Schedules, Conflicts).
- `src/mockData.ts`: Initial seed data including 15 employees with varying availability and contract types.
- `src/services/SchedulingService.ts`: The core "Heuristic-based Priority Solver". Handles constraints like max hours, 11h rest rule, and night shift fairness.
- `src/store/useStore.ts`: Global state management using Zustand. Manages the active schedule, publish locks, and audit logs.
- `src/components/`: Reusable React components.
  - `WeeklyCalendar.tsx`: The main grid view with interactive shift management.
  - `ConflictPanel.tsx`: Explains why specific shifts couldn't be filled automatically.
  - `ImportTool.tsx`: Mock interface for mapping CSV data to internal employee records.
- `src/App.tsx`: Main application layout.
- `src/styles/App.css`: Modern, clean styling with CSS variables.

## Scheduling Engine Logic
The engine uses a **Heuristic-based Priority Solver**:
1.  **Hard Constraints (Strict):**
    - Employee availability per day.
    - Max weekly hours (Full-time vs Part-time).
    - No overlapping shifts.
    - Approved leave requests.
2.  **Soft Constraints & Heuristics (Prioritized):**
    - **Fairness:** Night shifts are distributed based on historical counts.
    - **Contract Priority:** Full-time staff are assigned first to fulfill their hour requirements.
    - **11-Hour Rest Rule:** Detects and warns if a shift starts too soon after the previous one ends.

## How to Run & Test
1.  **Install dependencies:** `npm install`
2.  **Start the dev server:** `npm run dev`
3.  **Test Case 1 (Auto-generation):** Click "Generate Schedule". Observe how the engine fills 21 slots across 7 days using the 15-person pool.
4.  **Test Case 2 (Conflicts):** Look at the "Conflict Resolution Required" panel if any shift cannot be filled (e.g., due to leave or max hours).
5.  **Test Case 3 (Manual Edits):** Change an assigned employee via the dropdown. Note the activity log updates.
6.  **Test Case 4 (Locking):** Click "Approve & Publish". The schedule will lock, preventing further manual edits.

## Seed Test Cases & Expected Outputs
- **Employee 'Eve Davis':** Has leave on Wednesday. The engine will skip her for all Wednesday shifts.
- **Night Shift Distribution:** The engine tracks how many night shifts each person has. It will cycle through Bob, David, Ivy, Mia, etc., to maintain fairness.
- **Part-Time Staff:** Charlie Brown (20h max) will only be assigned ~2-3 shifts before hitting his limit.
