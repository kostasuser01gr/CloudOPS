import React, { useState, useEffect } from 'react';
import { User } from '../App';
import { 
  Camera, RefreshCw, CheckCircle, AlertCircle, History, LogOut, ShieldCheck, 
  Zap, Info, Wifi, WifiOff, CloudUpload, CloudCheck, Keyboard, Edit3, X, Save,
  Mic, MicOff, MessageSquare
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

interface WasherWorkspaceProps { user: User; onLogout: () => void; }

const WasherWorkspace: React.FC<WasherWorkspaceProps> = ({ user, onLogout }) => {
  const [view, setView] = useState<'scanning' | 'inspecting' | 'history'>('scanning');
  const [currentReg, setCurrentReg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  
  // --- MANUAL & EDIT STATE ---
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [editingReg, setEditingReg] = useState<any>(null);
  const [editValue, setEditValue] = useState('');

  // --- VOICE STATE ---
  const [isListening, setIsOffline] = useState(false); // Using this for offline toggle simulation earlier, but let's keep it for voice now
  const [isRecording, setIsRecording] = useState(false);
  const [voiceText, setVoiceText] = useState('');

  const handleScan = async (identifier: string) => {
    if (cooldown || !identifier) return;
    setCooldown(true);
    setError(null);

    try {
      const res = await axios.post('http://localhost:3001/api/registrations', {
        identifier, method: 'qr', branchId: user.branchId, branchName: user.branch,
        operatorId: user.id, operatorName: user.name
      });
      setCurrentReg(res.data);
      setView('inspecting');
      setShowManual(false);
      setManualInput('');
      if (window.navigator.vibrate) window.navigator.vibrate(200);
    } catch (err: any) {
      setError(err.response?.status === 409 ? 'DUPLICATE: Already in bay.' : 'Sync Error.');
      setTimeout(() => setCooldown(false), 2000);
    }
  };

  const startVoiceCapture = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Voice not supported on this browser.');

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.start();
    setIsRecording(true);

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      setVoiceText(text);
      setIsRecording(false);
      
      // Process Voice with Backend
      try {
        const res = await axios.post('http://localhost:3001/api/voice/process', {
          text, userId: user.id, userName: user.name
        });
        
        // Update current registration with the new comment and flag if needed
        if (currentReg) {
          const updated = {
            ...currentReg,
            comments: [...currentReg.comments, res.data.comment],
            issueFlag: res.data.action === 'FLAG_ISSUE' ? true : currentReg.issueFlag
          };
          setCurrentReg(updated);
          // Sync update to backend
          await axios.patch(`http://localhost:3001/api/registrations/${currentReg.id}/washer-edit`, updated);
        }
      } catch (err) { console.error(err); }
    };

    recognition.onerror = () => setIsRecording(false);
  };

  const handleWasherEdit = async () => {
    if (!editingReg || !editValue) return;
    try {
      await axios.patch(`http://localhost:3001/api/registrations/${editingReg.id}/washer-edit`, {
        identifier: editValue, reason: 'Washer correction'
      });
      setEditingReg(null);
      fetchRecent();
    } catch (err) { console.error(err); }
  };

  const fetchRecent = async () => {
    try {
      const res = await axios.get(`http://localhost:3001/api/registrations?operatorId=${user.id}`);
      setRecentScans(res.data.slice(0, 15));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchRecent(); }, [user.id, view]);

  return (
    <div className="flex flex-col bg-slate-950 text-white overflow-hidden" style={{ height: '100vh' }}>
      <header className="flex justify-between items-center p-4 bg-white/5 border-b border-white/10 z-20">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg"><ShieldCheck size={20} /></div>
          <span className="font-bold tracking-tight">WASHER PRO</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end mr-2">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest animate-pulse">On Shift</span>
            <span className="text-[8px] text-white/20 uppercase font-bold">Ends 14:00</span>
          </div>
          <button onClick={() => setShowManual(true)} className="p-2 bg-white/5 rounded-xl text-blue-400"><Keyboard size={20} /></button>
          <div className="w-[1px] h-4 bg-white/10 mx-1" />
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{user.branch}</span>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'scanning' && (
            <motion.div key="scanning" className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-sm aspect-[3/4] rounded-3xl border-2 border-white/20 relative overflow-hidden bg-slate-900 shadow-2xl">
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-4">
                  {error ? (
                    <div className="bg-red-500/20 text-red-400 p-4 rounded-2xl border border-red-500/50"><AlertCircle size={32} className="mx-auto mb-2" /><p className="text-sm font-bold">{error}</p></div>
                  ) : (
                    <div className="opacity-40"><Camera size={64} className="mx-auto mb-4" /><p className="text-sm font-black uppercase tracking-widest text-[10px]">Aim at vehicle label</p></div>
                  )}
                </div>
                <div className="absolute bottom-6 left-0 w-full px-6 flex flex-col gap-2">
                   <button onClick={() => handleScan('ABC-' + Math.floor(Math.random()*9000+1000))} className="w-full bg-blue-600 h-14 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20" disabled={cooldown}>
                    {cooldown ? <RefreshCw className="animate-spin" /> : <Zap size={20} />} SIMULATE SCAN
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'inspecting' && (
            <motion.div key="inspecting" initial={{ x: 300 }} animate={{ x: 0 }} className="flex-1 p-6 flex flex-col gap-6">
              <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] text-center space-y-2 relative overflow-hidden">
                <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30"><CheckCircle size={32} /></div>
                <h3 className="text-3xl font-black tracking-tighter">{currentReg.normalizedIdentifier}</h3>
                <p className="text-xs text-blue-400 font-black uppercase tracking-[0.2em]">Verified Registry Match</p>
              </div>

              <div className="flex-1 flex flex-col gap-4">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Voice Intelligence</p>
                
                <button 
                  onClick={startVoiceCapture}
                  disabled={isRecording}
                  className={`p-8 rounded-[40px] flex items-center justify-between transition-all ${
                    isRecording ? 'bg-red-600 animate-pulse' : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-black text-xl uppercase tracking-tight">{isRecording ? 'Listening...' : 'Voice Note'}</p>
                    <p className="text-xs text-white/40">{voiceText || 'Report damage or issues hands-free'}</p>
                  </div>
                  {isRecording ? <Mic size={32} /> : <MicOff size={32} className="opacity-20" />}
                </button>

                <div className="space-y-3 mt-2">
                  {currentReg.comments.map((c: any) => (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={c.id} className={`p-4 rounded-2xl border ${c.severity === 'damage' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-white/60'} flex items-start gap-3`}>
                      <MessageSquare size={16} className="mt-1 shrink-0" />
                      <p className="text-xs font-bold leading-relaxed uppercase tracking-tight">{c.content}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              <button onClick={() => { setView('scanning'); setCurrentReg(null); setCooldown(false); setVoiceText(''); }} className="w-full bg-white text-black p-6 rounded-[32px] font-black text-lg uppercase tracking-widest shadow-xl active:scale-95 transition-all">Done & Next</button>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div key="history" initial={{ y: 200 }} animate={{ y: 0 }} className="flex-1 flex flex-col p-6 overflow-auto">
              <h2 className="text-xl font-black mb-6 uppercase tracking-widest">Wash History</h2>
              <div className="flex flex-col gap-3 pb-24">
                {recentScans.map(reg => (
                  <div key={reg.id} className="bg-white/5 p-5 rounded-[32px] border border-white/5 space-y-3 transition-all hover:bg-white/10">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-black text-xl tracking-tight">{reg.normalizedIdentifier}</p>
                        <p className="text-[10px] text-white/30 font-black uppercase">{new Date(reg.createdAt).toLocaleTimeString()}</p>
                      </div>
                      <button onClick={() => { setEditingReg(reg); setEditValue(reg.identifier); }} className="p-3 bg-white/5 rounded-2xl text-blue-400 border border-white/5"><Edit3 size={18} /></button>
                    </div>
                    <div className="flex gap-2">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${reg.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>{reg.status.toUpperCase()}</span>
                      {reg.issueFlag && <span className="text-[10px] font-black px-3 py-1 rounded-full bg-red-500/10 border-red-500/30 text-red-400 uppercase">Issue Detected</span>}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showManual && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tighter">Manual Entry</h2>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Operational Fallback Mode</p>
              </div>
              <input 
                autoFocus type="text" value={manualInput} onChange={(e) => setManualInput(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-8 rounded-[40px] text-3xl font-black text-center outline-none focus:border-blue-500 transition-all uppercase placeholder:text-white/5"
                placeholder="ABC-1234"
              />
              <div className="flex gap-4">
                <button onClick={() => setShowManual(false)} className="flex-1 bg-white/5 p-6 rounded-[32px] font-black uppercase text-xs tracking-widest border border-white/5">Cancel</button>
                <button onClick={() => handleScan(manualInput)} className="flex-1 bg-blue-600 p-6 rounded-[32px] font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20">Register</button>
              </div>
            </div>
          </motion.div>
        )}

        {editingReg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tighter text-blue-400">Correct Record</h2>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Identifier Revision Engine</p>
              </div>
              <input 
                autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-8 rounded-[40px] text-3xl font-black text-center outline-none focus:border-blue-500 transition-all uppercase"
              />
              <div className="flex gap-4">
                <button onClick={() => setEditingReg(null)} className="flex-1 bg-white/5 p-6 rounded-[32px] font-black uppercase text-xs tracking-widest border border-white/5 text-red-400">Discard</button>
                <button onClick={handleWasherEdit} className="flex-1 bg-blue-600 p-6 rounded-[32px] font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20">Save Correction</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="p-6 pb-12 bg-slate-950 border-t border-white/10 flex justify-around items-center z-30">
        <button onClick={() => setView('scanning')} className={`flex flex-col items-center gap-1 transition-all ${view === 'scanning' ? 'text-blue-500 scale-110' : 'text-white/20'}`}><Camera size={28} /><span className="text-[9px] font-black uppercase tracking-widest">Scanner</span></button>
        <button onClick={() => setView('history')} className={`flex flex-col items-center gap-1 transition-all ${view === 'history' ? 'text-blue-500 scale-110' : 'text-white/20'}`}><History size={28} /><span className="text-[9px] font-black uppercase tracking-widest">History</span></button>
      </nav>
    </div>
  );
};

export default WasherWorkspace;
