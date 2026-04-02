import React, { useState, useEffect } from 'react';
import { useStore } from './store/useStore';
import { WeeklyCalendar } from './components/WeeklyCalendar';
import { ConflictPanel, AuditLogView } from './components/ConflictPanel';
import { ImportTool } from './components/ImportTool';
import { StaffChat } from './components/StaffChat';
import { LoginForm } from './components/LoginForm';
import { FleetTab } from './components/FleetTab';
import { startOfWeek } from 'date-fns';
import { 
  Calendar, Users, Settings, Download, Play, CheckCircle, RotateCcw, 
  MapPin, Plane, Car, Menu, X, LogOut, MessageCircle, FileSpreadsheet, 
  Smartphone, ShieldCheck, WifiOff
} from 'lucide-react';
import { MOCK_FLEET, MOCK_FLIGHTS } from './mockData';
import './styles/App.css';

const App: React.FC = () => {
  const { 
    generateWeeklySchedule, publishSchedule, currentSchedule, 
    publishLock, exportToCSV, getEmployeeMetrics, clearSchedule,
    selectedBranch, setBranch, isLoading, currentUser, logout, processReservationExcel
  } = useStore();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'chat' | 'fleet'>('schedule');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });
    window.addEventListener('online', () => setIsOffline(false));
    window.addEventListener('offline', () => setIsOffline(true));
  }, []);

  if (!currentUser) {
    return <LoginForm />;
  }

  const handleInstall = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') setInstallPrompt(null);
      });
    }
  };

  const handleGenerate = () => {
    const nextMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    generateWeeklySchedule(nextMonday);
  };

  return (
    <div className={`app-container ${isOffline ? 'offline-mode' : ''}`}>
      {/* PWA Install Banner */}
      {installPrompt && (
        <div className="install-banner">
          <Smartphone size={20} />
          <span>Install ShiftWise for a native mobile experience</span>
          <button onClick={handleInstall} className="btn-install">Install</button>
          <button onClick={() => setInstallPrompt(null)} className="btn-close-banner"><X size={16} /></button>
        </div>
      )}

      {/* Offline Alert */}
      {isOffline && (
        <div className="offline-alert">
          <WifiOff size={16} /> Local Mode: Using cached AI models and data.
        </div>
      )}

      {/* Sidebar - Pro Industrial Theme */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <ShieldCheck size={32} color="var(--primary-color)" />
            <span>ShiftWise</span>
          </div>
          <button className="mobile-only-btn" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <div className="user-context">
          <div className="avatar">{currentUser.username.charAt(0)}</div>
          <div className="user-info">
            <span className="role">{currentUser.role}</span>
            <span className="name">{currentUser.username}</span>
          </div>
          <button onClick={logout} className="btn-logout" title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>

        <nav className="nav-group">
          <div className="nav-label">Operations</div>
          <button className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => { setActiveTab('schedule'); setIsMobileMenuOpen(false); }}>
            <Calendar size={20} /> <span>Shift Program</span>
          </button>
          <button className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => { setActiveTab('chat'); setIsMobileMenuOpen(false); }}>
            <MessageCircle size={20} /> <span>Staff Comms</span>
          </button>
          {(currentUser.role === 'Super-Admin' || currentUser.role === 'Fleet-Supervisor') && (
            <button className={`nav-item ${activeTab === 'fleet' ? 'active' : ''}`} onClick={() => { setActiveTab('fleet'); setIsMobileMenuOpen(false); }}>
              <Car size={20} /> <span>Fleet Dept.</span>
            </button>
          )}
        </nav>

        <nav className="nav-group" style={{ marginTop: '24px' }}>
          <div className="nav-label">Network</div>
          <div className="branch-picker">
            <MapPin size={16} />
            <select value={selectedBranch} onChange={(e) => setBranch(e.target.value)}>
              <option value="LON-AIRPORT">London LHR</option>
              <option value="LON-CENTRAL">London City</option>
              <option value="MAN-AIRPORT">Manchester</option>
            </select>
          </div>
        </nav>

        <div className="sidebar-footer">
          {currentUser.role === 'Super-Admin' && (
            <button className="btn-secondary" onClick={() => processReservationExcel("MOCK")}>
              <FileSpreadsheet size={18} /> Sync Reservations
            </button>
          )}
          <button className="btn-primary" onClick={handleGenerate} disabled={publishLock || isLoading}>
            {isLoading ? <RefreshCcw className="spinning" size={18} /> : <Play size={18} />}
            <span>{isLoading ? 'AI Syncing...' : 'Generate Program'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-viewport">
        <header className="mobile-header">
          <button onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} /></button>
          <span className="mobile-title">ShiftWise OS</span>
          <div className="mobile-status-dot" />
        </header>

        <div className="scroll-content">
          {activeTab === 'schedule' && (
            <div className="dashboard-layout">
              <div className="op-summary">
                <div className="op-card"><Plane size={20} /> <span>Delayed: {MOCK_FLIGHTS.filter(f => f.status === 'Delayed').length}</span></div>
                <div className="op-card"><Car size={20} /> <span>Returns: {MOCK_FLEET.expectedReturns}</span></div>
                <div className="op-card stat-critical"><Users size={20} /> <span>Uncovered: {currentSchedule?.shifts.filter(s => !s.employeeId).length || 0}</span></div>
              </div>
              <WeeklyCalendar />
              <div className="grid-2-col">
                <ConflictPanel />
                <AuditLogView />
              </div>
            </div>
          )}

          {activeTab === 'chat' && <StaffChat />}
          {activeTab === 'fleet' && <FleetTab />}
        </div>

        {/* Native-style Bottom Navigation for Mobile */}
        <nav className="bottom-nav">
          <button className={activeTab === 'schedule' ? 'active' : ''} onClick={() => setActiveTab('schedule')}>
            <Calendar size={22} /> <span>Schedule</span>
          </button>
          <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
            <MessageCircle size={22} /> <span>Chat</span>
          </button>
          {(currentUser.role === 'Super-Admin' || currentUser.role === 'Fleet-Supervisor') && (
            <button className={activeTab === 'fleet' ? 'active' : ''} onClick={() => setActiveTab('fleet')}>
              <Car size={22} /> <span>Fleet</span>
            </button>
          )}
        </nav>

        {/* Floating Action Button for AI (Super-Admin only) */}
        {currentUser.role === 'Super-Admin' && (
          <button className="mobile-fab" onClick={() => setActiveTab('chat')}>
            <ShieldCheck size={28} />
          </button>
        )}
      </main>
    </div>
  );
};

export default App;
