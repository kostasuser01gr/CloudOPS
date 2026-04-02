import React from 'react';
import { useStore } from '../store/useStore';
import { Brain } from 'lucide-react';

export const ConflictPanel: React.FC = () => {
  const { conflicts, aiInsights } = useStore();

  if (conflicts.length === 0 && aiInsights.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {aiInsights.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--primary-color)', background: '#eff6ff' }}>
          <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={20} /> AI Fusion Insights
          </h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.875rem', color: '#1e40af' }}>
            {aiInsights.map((insight, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="conflict-panel">
          <h4 style={{ margin: '0 0 12px 0', color: '#92400e' }}>🚨 Hard Constraints Detected</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {conflicts.map((conflict, idx) => (
              <div key={idx} style={{ padding: '8px', background: '#fffbeb', borderRadius: 4, borderLeft: '4px solid #f59e0b' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{conflict.reason}</div>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 20, fontSize: '0.8rem', color: '#64748b' }}>
                  {conflict.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const AuditLogView: React.FC = () => {
  const { currentSchedule } = useStore();

  if (!currentSchedule || currentSchedule.auditLog.length === 0) return null;

  return (
    <div className="card">
      <h4>Recent Activity (Audit Trail)</h4>
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {currentSchedule.auditLog.map(log => (
          <div key={log.id} style={{ fontSize: '0.75rem', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 'bold' }}>{new Date(log.timestamp).toLocaleTimeString()}:</span> {log.action} - {log.details}
          </div>
        ))}
      </div>
    </div>
  );
};
