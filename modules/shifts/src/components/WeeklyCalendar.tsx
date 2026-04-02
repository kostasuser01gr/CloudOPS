import React from 'react';
import { useStore } from '../store/useStore';
import { Shift, Employee } from '../types';
import { format, parseISO, addDays, isSameDay } from 'date-fns';
import { User, ShieldCheck } from 'lucide-react';

export const WeeklyCalendar: React.FC = () => {
  const { currentSchedule, employees, updateShift, publishLock, selectedBranch, blurredWeeks, currentUser } = useStore();

  if (!currentSchedule) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '64px 24px', color: '#64748b' }}>
        <h3>No active schedule for {selectedBranch}</h3>
        <p>Click "Generate AI Fusion" to start optimizing shifts based on flight and fleet data.</p>
      </div>
    );
  }

  const weekStart = parseISO(currentSchedule.weekStart);
  const isWeekBlurred = blurredWeeks.some(b => b.weekStart === currentSchedule.weekStart && b.branchId === selectedBranch);
  const shouldBlur = isWeekBlurred && currentUser?.role !== 'Super-Admin';

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
...
      <div className="calendar-grid" style={{ filter: shouldBlur ? 'blur(8px)' : 'none', pointerEvents: shouldBlur ? 'none' : 'auto' }}>
        {days.map(day => (
...
      </div>
      {shouldBlur && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(255,255,255,0.9)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center', z-index: 10 }}>
          <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Week Program Masked</h4>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>This week's program is currently being reviewed by the Super-Admin.</p>
        </div>
      )}
    </div>
  );
};
