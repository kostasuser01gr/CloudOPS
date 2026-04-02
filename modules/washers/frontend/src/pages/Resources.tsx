import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Droplets, Thermometer, Zap, AlertTriangle, RefreshCw, Factory } from 'lucide-react';

const Resources: React.FC = () => {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/branches');
      setBranches(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefill = async (id: string) => {
    await axios.post(`http://localhost:3001/api/branches/${id}/refill`);
    fetchData();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-800">IoT Resource Monitor</h2>
        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Real-time chemical & utility telemetry</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {branches.map(branch => (
          <div key={branch.id} className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Factory className="text-blue-600" />
                <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">{branch.name}</h3>
              </div>
              <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                branch.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>{branch.status}</span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Gauge label="Soap" value={branch.resources.soap} color="blue" />
              <Gauge label="Wax" value={branch.resources.wax} color="emerald" />
              <Gauge label="Water" value={branch.resources.water} color="cyan" />
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-slate-50">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                <Zap size={14} className="text-amber-500" />
                SENSORS ONLINE
              </div>
              <button 
                onClick={() => handleRefill(branch.id)}
                className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-2 rounded-xl transition-all"
              >
                <RefreshCw size={12} /> Refill Tanks
              </button>
            </div>

            {(branch.resources.soap < 20 || branch.resources.wax < 20) && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex gap-3 text-red-600">
                <AlertTriangle className="shrink-0" size={18} />
                <p className="text-[10px] font-bold leading-tight uppercase">Critical Alert: Low supply levels detected. Automated reorder triggered.</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const Gauge = ({ label, value, color }: { label: string, value: number, color: string }) => {
  const colors: any = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', cyan: 'bg-cyan-500' };
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
          <motion.circle 
            cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" 
            strokeDasharray={226}
            initial={{ strokeDashoffset: 226 }}
            animate={{ strokeDashoffset: 226 - (226 * value) / 100 }}
            className={color === 'blue' ? 'text-blue-500' : color === 'emerald' ? 'text-emerald-500' : 'text-cyan-500'}
          />
        </svg>
        <span className="absolute text-xs font-black text-slate-800">{Math.round(value)}%</span>
      </div>
      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{label}</span>
    </div>
  );
};

export default Resources;
