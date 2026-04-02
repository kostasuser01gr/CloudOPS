import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Brain, Zap, AlertCircle, RefreshCw, CheckCircle, ShieldAlert, Binary, Search, X } from 'lucide-react';
import { format } from 'date-fns';

const ModelInspector: React.FC<{ user: any }> = ({ user }) => {
  const [logic, setLogic] = useState<any>(null);
  const [testInput, setTestInput] = useState('');
  const [correctionSearch, setCorrectionSearch] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [correctionReason, setCorrectionReason] = useState('');

  const fetchLogic = async () => {
    const res = await axios.get('http://localhost:3001/api/inspector/logic');
    setLogic(res.data);
  };

  useEffect(() => {
    fetchLogic();
    const interval = setInterval(fetchLogic, 5000);
    return () => clearInterval(interval);
  }, []);

  const normalize = (val: string) => val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  const handleCorrection = async (action: string) => {
    if (!searchResult || !correctionReason) return alert('Select record and provide reason');
    try {
      await axios.post(`http://localhost:3001/api/registrations/${searchResult.id}/correct`, {
        action,
        userId: user.id,
        reason: correctionReason
      });
      alert('Correction Applied');
      setSearchResult(null);
      setCorrectionSearch('');
      setCorrectionReason('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Model Inspector</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Operational Logic & Rule Tuning</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl border border-blue-100 font-bold text-xs">
          <Brain size={16} />
          Logic Engine v4.2 Active
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Logic Sandbox */}
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <Binary className="text-blue-500" />
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Normalization Sandbox</h3>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Test Input</label>
              <input 
                type="text" 
                placeholder="Type raw label (e.g. abc-123)..." 
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
            </div>
            <div className="bg-slate-900 p-6 rounded-2xl flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Logic Step</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Output</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60 font-medium">1. Raw Stream</span>
                <span className="text-xs text-blue-400 font-mono font-bold">{testInput || 'null'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60 font-medium">2. Uppercase + Trim</span>
                <span className="text-xs text-blue-400 font-mono font-bold">{testInput.trim().toUpperCase() || 'null'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60 font-medium">3. Regex Scrub</span>
                <span className="text-xs text-emerald-400 font-mono font-bold">{normalize(testInput) || 'null'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Parameters */}
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
           <div className="flex items-center gap-3">
            <Zap className="text-amber-500" />
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Operational Parameters</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {logic?.rules && Object.entries(logic.rules).map(([key, val]: any) => (
              <div key={key} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{key.replace(/([A-Z])/g, ' $1')}</p>
                <p className="text-sm font-black text-slate-700">{val}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Decision Gates</p>
            {logic?.decisionPoints.map((p: any) => (
              <div key={p.id} className="flex gap-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                 <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {p.id}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{p.name}</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-1">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Blocked Attempts (Duplicate Logs) */}
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-red-500" />
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Duplicate Rejection Log</h3>
          </div>
          <div className="space-y-3 overflow-auto max-h-[300px]">
            {logic?.blockedAttempts.length > 0 ? logic.blockedAttempts.map((b: any) => (
              <div key={b.id} className="p-4 bg-red-50 border border-red-100 rounded-2xl flex justify-between items-center group">
                <div>
                  <p className="text-sm font-bold text-red-700">{b.normalizedIdentifier}</p>
                  <p className="text-[10px] text-red-400 font-bold uppercase mt-1">{b.reason} · {format(new Date(b.timestamp), 'HH:mm:ss')}</p>
                </div>
                <button 
                  onClick={() => alert(`Conflict with record: ${b.conflictingRegId}`)}
                  className="bg-white p-2 rounded-xl text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <Search size={16} />
                </button>
              </div>
            )) : (
              <div className="text-center p-8 text-slate-400 italic text-sm">No duplicate attempts recorded today.</div>
            )}
          </div>
        </div>

        {/* Force Correction Center */}
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-blue-500" />
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Correction & Overrides</h3>
          </div>
          <div className="space-y-4">
             <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter normalized ID to correct..." 
                  className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-all"
                  value={correctionSearch}
                  onChange={(e) => setCorrectionSearch(e.target.value)}
                />
                <button 
                  className="bg-blue-600 text-white p-3 rounded-xl font-bold text-sm px-6 shadow-lg shadow-blue-600/20"
                  onClick={async () => {
                    const res = await axios.get('http://localhost:3001/api/registrations');
                    const match = res.data.find((r: any) => r.normalizedIdentifier === correctionSearch.toUpperCase());
                    setSearchResult(match || 'NOT_FOUND');
                  }}
                >
                  Find
                </button>
             </div>

             {searchResult && searchResult !== 'NOT_FOUND' && (
               <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-800">{searchResult.normalizedIdentifier}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{searchResult.status} · BRANCH {searchResult.branchId}</p>
                    </div>
                    <button onClick={() => setSearchResult(null)}><X size={16} className="text-slate-400" /></button>
                  </div>
                  
                  <textarea 
                    placeholder="Provide mandatory override reason..." 
                    className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-medium min-h-[60px] outline-none"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                  />

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleCorrection('CLEAR_FLAGS')}
                      className="flex-1 bg-white border border-slate-200 p-2 rounded-lg text-[10px] font-black uppercase text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                    >
                      Clear Flags
                    </button>
                    <button 
                      onClick={() => handleCorrection('CANCEL')}
                      className="flex-1 bg-white border border-slate-200 p-2 rounded-lg text-[10px] font-black uppercase text-red-600 hover:bg-red-600 hover:text-white transition-all"
                    >
                      Cancel Record
                    </button>
                  </div>
               </motion.div>
             )}

             {searchResult === 'NOT_FOUND' && (
               <div className="p-4 text-center text-sm text-slate-400 italic">Vehicle not found in active fleet records.</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelInspector;
