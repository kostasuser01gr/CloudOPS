import React, { useState, useEffect } from 'react';
import { User } from '../App';
import { 
  LayoutDashboard, Table as TableIcon, BarChart3, Settings, LogOut, Search, Filter, 
  Download, MoreHorizontal, AlertTriangle, CheckCircle2, Clock, Eye, ChevronRight, 
  TrendingUp, MapPin, X, Brain, Activity, Globe, Zap, RefreshCw, CloudCheck, ShieldCheck,
  Factory, Droplets, Car, Calendar, Users, ArrowRight
} from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import ModelInspector from './ModelInspector';
import Resources from './Resources';
import FleetManager from './FleetManager';
import ShiftsModule from './ShiftsModule';

interface DashboardProps { user: User; onLogout: () => void; }

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'inspector' | 'resources' | 'fleet' | 'shifts'>('overview');
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('B01');
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReg, setSelectedReg] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [regRes, statsRes, healthRes, branchRes] = await Promise.all([
        axios.get(`http://localhost:3001/api/registrations?branchId=${selectedBranchId}`),
        axios.get(`http://localhost:3001/api/stats?branchId=${selectedBranchId}`),
        axios.get('http://localhost:3001/api/system/health'),
        axios.get('http://localhost:3001/api/branches')
      ]);
      setData(regRes.data);
      setStats(statsRes.data);
      setHealth(healthRes.data);
      setBranches(branchRes.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, [selectedBranchId]);

  const filteredData = data.filter(r => r.normalizedIdentifier.includes(searchTerm.toUpperCase()));

  return (
    <div className="flex bg-slate-50" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside className="flex flex-col gap-6 p-6" style={{ width: '280px', background: '#0f172a', color: '#fff' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20"><Zap size={24} className="text-white" /></div>
          <span className="font-bold text-xl tracking-tight uppercase">Platform</span>
        </div>

        <div className="bg-white/5 p-4 rounded-3xl border border-white/10 space-y-2 mb-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><MapPin size={10} /> Active Location</label>
          <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="w-full bg-slate-900 border border-white/10 p-2 rounded-xl text-xs font-bold text-white outline-none cursor-pointer hover:border-blue-500 transition-colors">
            {branches.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 ml-2">Operations</p>
          <NavItem icon={<LayoutDashboard size={18} />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <NavItem icon={<Car size={18} />} label="Fleet Intel" active={activeTab === 'fleet'} onClick={() => setActiveTab('fleet')} />
          <NavItem icon={<Droplets size={18} />} label="IoT Supplies" active={activeTab === 'resources'} onClick={() => setActiveTab('resources')} />
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 mt-4 ml-2">Workforce</p>
          <NavItem icon={<Calendar size={18} />} label="Shift Planner" active={activeTab === 'shifts'} onClick={() => setActiveTab('shifts')} />
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 mt-4 ml-2">System</p>
          <NavItem icon={<Brain size={18} />} label="Model Inspector" active={activeTab === 'inspector'} onClick={() => setActiveTab('inspector')} />
        </nav>

        <div className="pt-6 border-t border-white/10">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex flex-col"><span className="text-[10px] font-black text-slate-500 uppercase">System Status</span><span className="text-[10px] font-bold text-emerald-400">HEALTHY</span></div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex justify-between items-center px-8 py-5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">{activeTab} Pulse</h1>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 flex-1 max-w-md"><Search size={18} className="text-slate-400" /><input type="text" placeholder="Quick search..." className="bg-transparent border-none outline-none w-full text-sm font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-2"><CloudCheck size={16} className="text-emerald-600" /><span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Internal Link Active</span></div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-4 gap-6">
                    <KpiCard title="Active Volume" value={stats?.totalToday || 0} icon={<TrendingUp size={20} />} color="blue" />
                    <KpiCard title="Avg Wash Time" value={`${stats?.avgWashMinutes || 0}m`} icon={<Clock size={20} />} color="emerald" />
                    <KpiCard title="Fleet Issues" value={stats?.issues || 0} icon={<AlertTriangle size={20} />} color="amber" />
                    <KpiCard title="API Latency" value={health?.apiLatency || '...'} icon={<Activity size={20} />} color="slate" />
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Live Registration Feed</h3></div>
                    <table className="w-full text-left">
                      <thead><tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-100"><th className="px-6 py-4">Vehicle</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Operator</th><th className="px-6 py-4">Fleet Validation</th><th className="px-6 py-4"></th></tr></thead>
                      <tbody className="text-sm font-bold">
                        {filteredData.map(reg => (
                          <tr key={reg.id} className="border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer transition-colors" onClick={() => setSelectedReg(reg)}>
                            <td className="px-6 py-4 font-black text-slate-900">{reg.normalizedIdentifier}</td>
                            <td className="px-6 py-4"><StatusBadge status={reg.status} /></td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{reg.operatorName}</td>
                            <td className="px-6 py-4">
                              <span className={`flex items-center gap-1 text-[10px] ${reg.issueFlag ? 'text-red-500' : 'text-emerald-500'}`}>
                                {reg.issueFlag ? <AlertTriangle size={12}/> : <ShieldCheck size={12}/>} {reg.issueFlag ? 'ANOMALY' : 'VERIFIED'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right"><ChevronRight size={18} className="text-slate-300" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {activeTab === 'fleet' && <FleetManager />}
              {activeTab === 'resources' && <Resources />}
              {activeTab === 'shifts' && <ShiftsModule selectedBranchId={selectedBranchId} />}
              {activeTab === 'inspector' && <ModelInspector user={user} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {selectedReg && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedReg(null)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 w-[600px] bg-white shadow-2xl z-50 flex flex-col">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{selectedReg.normalizedIdentifier}</h2>
                <button onClick={() => setSelectedReg(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
              </div>
              <div className="flex-1 overflow-auto p-8 space-y-8">
                {/* AI Visual Delta */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-widest"><Brain size={14} /> AI Visual Inspection Delta</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase text-center">Checkout Baseline</p>
                      <img src={selectedReg.checkoutPhotoUrl} className="rounded-2xl border border-slate-200 grayscale opacity-50" />
                    </div>
                    <div className="space-y-2 relative">
                      <p className="text-[9px] font-black text-slate-400 uppercase text-center">Current (Post-Wash)</p>
                      <img src={selectedReg.checkinPhotoUrl} className="rounded-2xl border-2 border-blue-500 shadow-lg" />
                      {/* Simulated AI Overlays */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 border-2 border-red-500 rounded-full animate-pulse flex items-center justify-center">
                        <AlertTriangle size={16} className="text-red-500" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex gap-3 text-red-600">
                    <AlertTriangle className="shrink-0" size={18} />
                    <div>
                      <p className="text-[10px] font-black uppercase">Anomaly Detected: Front Bumper Scratch</p>
                      <p className="text-[10px] font-bold opacity-80 mt-1">Delta comparison indicates 92% match failure in quadrant B-4.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Logs</h4>
                  {selectedReg.auditTrail.map((e: any, i: number) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex justify-between font-black text-[10px] uppercase mb-1"><span>{e.action}</span><span className="text-slate-400">{format(new Date(e.timestamp), 'HH:mm')}</span></div>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed">{e.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex items-center gap-3 p-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
    {icon} <span>{label}</span>
  </button>
);

const KpiCard = ({ title, value, icon, color }: any) => {
  const colors: any = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', slate: 'bg-slate-50 text-slate-600' };
  return (<div className={`p-6 rounded-[32px] border border-slate-200 flex items-center gap-5 bg-white shadow-sm`}>
    <div className={`p-3 rounded-2xl ${colors[color]}`}>{icon}</div>
    <div className="flex flex-col"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</span><span className="text-2xl font-black text-slate-800 tracking-tighter">{value}</span></div>
  </div>);
};

const StatusBadge = ({ status }: any) => {
  const s = status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
  return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${s}`}>{status}</span>;
};

export default Dashboard;
