import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ImportMapping, Employee } from '../types';

export const ImportTool: React.FC = () => {
  const { importEmployees } = useStore();
  const [showMapping, setShowMapping] = useState(false);
  const [mappings, setMappings] = useState<ImportMapping[]>([
    { csvColumn: 'Employee Name', internalField: 'name' },
    { csvColumn: 'Max Hours', internalField: 'maxWeeklyHours' },
    { csvColumn: 'Role', internalField: 'role' },
  ]);

  const handleImport = () => {
    // Mocking the mapping and normalization process
    alert("Normalizing data using manual mapping...");
    setShowMapping(false);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4>Import Employee Data</h4>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Upload CSV/Excel to update staff records.</p>
        </div>
        <button className="btn btn-outline" onClick={() => setShowMapping(true)}>Upload File</button>
      </div>

      {showMapping && (
        <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <h5>Manual Column Mapping</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 'bold' }}>CSV Column</div>
            <div style={{ fontWeight: 'bold' }}>App Field</div>
            {mappings.map((m, idx) => (
              <React.Fragment key={idx}>
                <input 
                  type="text" 
                  value={m.csvColumn} 
                  onChange={(e) => {
                    const newMappings = [...mappings];
                    newMappings[idx].csvColumn = e.target.value;
                    setMappings(newMappings);
                  }}
                  style={{ padding: 8, borderRadius: 4, border: '1px solid #cbd5e1' }}
                />
                <div style={{ padding: 8 }}>{m.internalField}</div>
              </React.Fragment>
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleImport}>Process Import</button>
        </div>
      )}
    </div>
  );
};
