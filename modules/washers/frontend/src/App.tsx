import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import WasherWorkspace from './pages/WasherWorkspace';

// --- ROLES (Internal Defaults) ---
export interface User {
  id: string;
  name: string;
  role: 'washer' | 'senior-washer' | 'staff' | 'supervisor' | 'admin';
  branch: string;
  branchId: string;
}

const DEFAULT_USERS: Record<string, User> = {
  washer: { id: 'W01', name: 'Field Operator', role: 'washer', branch: 'Central HQ', branchId: 'B01' },
  staff: { id: 'S01', name: 'Office Staff', role: 'staff', branch: 'Central HQ', branchId: 'B01' }
};

const App: React.FC = () => {
  // Simple internal role switcher for the prototype
  const [currentMode, setCurrentMode] = useState<'washer' | 'staff'>('washer');
  const user = DEFAULT_USERS[currentMode];

  return (
    <BrowserRouter>
      {/* Internal Role Switcher - Visible for internal toolkit usage */}
      <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2 bg-slate-900/90 backdrop-blur-xl p-3 rounded-3xl border border-white/10 shadow-2xl">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2 mb-1">Select View</p>
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentMode('washer')}
            className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
              currentMode === 'washer' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Washer
          </button>
          <button 
            onClick={() => setCurrentMode('staff')}
            className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
              currentMode === 'staff' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Office
          </button>
        </div>
      </div>

      <Routes>
        <Route 
          path="/dashboard/*" 
          element={<Dashboard user={user} onLogout={() => {}} />} 
        />
        
        <Route 
          path="/washer/*" 
          element={<WasherWorkspace user={user} onLogout={() => {}} />} 
        />

        <Route path="/" element={<Navigate to={currentMode === 'washer' ? '/washer' : '/dashboard'} />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
