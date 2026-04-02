import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, startOfWeek, addDays } from 'date-fns';
import { Calendar, Users, Zap, CheckCircle, Clock, Filter, ChevronLeft, ChevronRight, AlertCircle, TrendingUp, Award, Trophy, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const ShiftsModule: React.FC<{ selectedBranchId: string }> = ({ selectedBranchId }) => {
  const [shifts, setShifts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchData = async () => {
    const [shiftRes, empRes, forecastRes, leadRes] = await Promise.all([
      axios.get(`http://localhost:3001/api/shifts?branchId=${selectedBranchId}`),
      axios.get(`http://localhost:3001/api/employees`),
      axios.get(`http://localhost:3001/api/forecast/demand?branchId=${selectedBranchId}`),
      axios.get(`http://localhost:3001/api/workforce/leaderboard`)
    ]);
    setShifts(shiftRes.data);
    setEmployees(empRes.data);
    setForecast(forecastRes.data);
    setLeaderboard(leadRes.data);
  };

  useEffect(() => { fetchData(); }, [selectedBranchId, weekStart]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    await axios.post('http://localhost:3001/api/shifts/generate', { branchId: selectedBranchId, weekStart: format(weekStart, 'yyyy-MM-dd') });
    fetchData();
    setIsGenerating(false);
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Workforce Intelligence</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Predictive scheduling & performance</p>
        </div>
        <button onClick={handleGenerate} disabled={isGenerating} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-all">
          {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />} Auto-Optimize Schedule
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Demand Forecast Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Predictive Demand Overlay</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Expected Vehicle Returns vs Scheduled Staff</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[9px] font-black text-slate-400 uppercase">Vehicles</span></div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[9px] font-black text-slate-400 uppercase">Staff</span></div>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast}>
                <defs>
                  <linearGradient id="colorVehicles" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorStaff" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                <YAxis hide />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px' }} />
                <Area type="monotone" dataKey="vehicles" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVehicles)" />
                <Area type="monotone" dataKey="staff" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorStaff)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Leaderboard */}
        <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-6">
          <div className="flex items-center gap-3"><Trophy className="text-amber-400" /><h3 className="font-black uppercase tracking-tight">Internal Recognition</h3></div>
          <div className="space-y-4">
            {leaderboard.map((emp, i) => (
              <div key={emp.id} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/40'}`}>{i + 1}</div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-tight">{emp.name}</p>
                  <p className="text-[9px] text-white/40 font-bold uppercase">{emp.washCount} Washes · {emp.qualityScore}★</p>
                </div>
                {i === 0 && <Star size={16} className="text-amber-400 fill-amber-400" />}
              </div>
            ))}
          </div>
          <button className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all">View All Performance</button>
        </div>
      </div>

      {/* Main Roster Grid */}
      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><ChevronLeft size={20} /></button>
            <span className="font-black text-sm uppercase tracking-widest text-slate-600">Week of {format(weekStart, 'MMM d, yyyy')}</span>
            <button className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><ChevronRight size={20} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100">
          {days.map(day => (
            <div key={day.toString()} className="p-4 text-center border-r border-slate-100 last:border-r-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{format(day, 'EEE')}</p>
              <p className="text-lg font-black text-slate-800">{format(day, 'd')}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayShifts = shifts.filter(s => s.date === dayStr);
            return (
              <div key={dayStr} className="min-h-[300px] border-r border-slate-100 last:border-r-0 p-3 space-y-3 bg-slate-50/30">
                {['Morning', 'Evening', 'Night'].map(type => {
                  const shift = dayShifts.find(s => s.type === type);
                  return (
                    <div key={type} className={`p-4 rounded-3xl border transition-all ${shift ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/40 border-dashed border-slate-200 opacity-50'}`}>
                      <span className={`text-[9px] font-black uppercase tracking-widest mb-2 block ${type === 'Morning' ? 'text-amber-600' : 'text-blue-600'}`}>{type}</span>
                      {shift ? (
                        <div className="space-y-1">
                          <p className="text-[11px] font-black text-slate-800">{employees.find(e => e.id === shift.employeeId)?.name}</p>
                          <p className="text-[9px] font-bold text-slate-400">{shift.startTime} - {shift.endTime}</p>
                        </div>
                      ) : <p className="text-[10px] font-bold text-slate-300 italic">Open</p>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RefreshCw = ({ className, size }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><polyline points="21 3 21 8 16 8" />
  </svg>
);

export default ShiftsModule;
