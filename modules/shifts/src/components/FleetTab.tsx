import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { 
  Car, Key, MapPin, CheckCircle, AlertCircle, RefreshCcw, 
  History, Settings, PenTool, ClipboardList, ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';

export const FleetTab: React.FC = () => {
  const { fleet, updateVehicleStatus, currentUser, addMaintenanceRecord, logKeyHandover, employees } = useStore();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const selectedVehicle = fleet.find(v => v.id === selectedVehicleId);
  const maintenanceAlerts = fleet.filter(v => v.status === 'Maintenance').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Ready': return '#10b981';
      case 'Cleaning': return '#2563eb';
      case 'Maintenance': return '#ef4444';
      default: return '#64748b';
    }
  };

  const handleMaintenance = (vId: string) => {
    const type = prompt('Maintenance Type: Tires, Oil Change, Brakes, Damage Repair');
    if (!type) return;
    addMaintenanceRecord(vId, {
      type: type as any,
      date: new Date().toISOString(),
      cost: Math.floor(Math.random() * 500) + 50,
      technician: currentUser?.username || 'System'
    });
  };

  const handleKeyHandover = (vId: string) => {
    const toUser = prompt('Hand keys to (Employee Name):');
    const emp = employees.find(e => e.name.toLowerCase().includes(toUser?.toLowerCase() || ''));
    if (emp) {
      logKeyHandover({ vehicleId: vId, fromUserId: currentUser?.id || 'sys', toUserId: emp.id });
    } else {
      alert('Employee not found.');
    }
  };

  return (
    <div className="fleet-hub-container" style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
            <Car size={36} color="var(--primary-color)" /> Operational Fleet Command
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>Inventory and lifecycle management for branch assets.</p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <div className="label">URGENT SERVICE</div>
            <div className="value" style={{ color: '#ef4444' }}>{maintenanceAlerts}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="label">AVAILABLE</div>
            <div className="value" style={{ color: '#10b981' }}>{fleet.filter(v => v.status === 'Ready').length}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedVehicle ? '1fr 350px' : '1fr', gap: 24, transition: 'all 0.3s' }}>
        <div className="fleet-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {fleet.map(vehicle => (
            <div 
              key={vehicle.id} 
              className={`card vehicle-card ${selectedVehicleId === vehicle.id ? 'selected' : ''}`} 
              onClick={() => setSelectedVehicleId(vehicle.id)}
              style={{ 
                borderLeft: `6px solid ${getStatusColor(vehicle.status)}`,
                cursor: 'pointer',
                transform: selectedVehicleId === vehicle.id ? 'scale(1.02)' : 'none',
                boxShadow: selectedVehicleId === vehicle.id ? '0 8px 20px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '-0.02em' }}>{vehicle.plate}</span>
                <span style={{ 
                  background: getStatusColor(vehicle.status), color: 'white', 
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 'bold' 
                }}>
                  {vehicle.status}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.875rem', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Car size={16} /> {vehicle.model}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><MapPin size={16} /> {vehicle.location}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary-color)', fontWeight: 600 }}><Key size={16} /> {vehicle.keyLocation}</div>
              </div>

              {currentUser?.role === 'Fleet-Supervisor' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 20, borderTop: '1px solid #f1f5f9', paddingTop: 16 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => updateVehicleStatus(vehicle.id, 'Ready')} className="btn btn-outline" style={{ flex: 1, padding: 8 }} title="Mark Ready"><CheckCircle size={16} /></button>
                  <button onClick={() => updateVehicleStatus(vehicle.id, 'Cleaning')} className="btn btn-outline" style={{ flex: 1, padding: 8 }} title="Start Cleaning"><RefreshCcw size={16} /></button>
                  <button onClick={() => handleKeyHandover(vehicle.id)} className="btn btn-outline" style={{ flex: 1, padding: 8 }} title="Handover Keys"><Key size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedVehicle && (
          <aside className="vehicle-details card" style={{ position: 'sticky', top: '32px', height: 'fit-content', borderTop: `4px solid ${getStatusColor(selectedVehicle.status)}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Vehicle Intel</h3>
              <button className="btn btn-outline icon-only" onClick={() => setSelectedVehicleId(null)}><AlertCircle size={16} /></button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', marginBottom: 8 }}>VITAL STATS</div>
              <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Mileage</span> <strong>{selectedVehicle.mileage.toLocaleString()} km</strong>
              </div>
              <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Last Service</span> <strong>{format(new Date(selectedVehicle.lastService), 'MMM yyyy')}</strong>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold' }}>SERVICE HISTORY</div>
                {currentUser?.role === 'Fleet-Supervisor' && (
                  <button className="btn btn-outline" style={{ fontSize: '0.65rem', padding: '2px 8px' }} onClick={() => handleMaintenance(selectedVehicle.id)}>+ Log</button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedVehicle.maintenanceHistory.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No records found.</div>}
                {selectedVehicle.maintenanceHistory.map(record => (
                  <div key={record.id} style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{record.type}</span>
                      <span style={{ color: 'var(--primary-color)' }}>${record.cost}</span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: 4 }}>
                      {format(new Date(record.date), 'dd/MM/yy')} • {record.technician}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedVehicle.status === 'Maintenance' && (
              <div style={{ background: '#fef2f2', padding: 16, borderRadius: 12, border: '1px solid #fee2e2' }}>
                <div style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={16} /> SAFETY WARNING
                </div>
                <p style={{ fontSize: '0.75rem', color: '#b91c1c', margin: '8px 0 0 0' }}>
                  This vehicle is flagged for damage repair. Do not assign to drivers until cleared by Giannis or Lidia.
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
