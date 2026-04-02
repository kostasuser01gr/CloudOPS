import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Car, Upload, Search, CheckCircle, AlertCircle, FileText, Brain, History, Download, X } from 'lucide-react';

const FleetManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'registry' | 'import' | 'analysis'>('registry');
  const [fleet, setFleet] = useState<any[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const fetchFleet = async () => {
    const res = await axios.get('http://localhost:3001/api/fleet');
    setFleet(res.data);
  };

  useEffect(() => { fetchFleet(); }, []);

  const handleMockImport = async () => {
    setImportStatus('Parsing spreadsheet...');
    const mockVehicles = [
      { vin: 'VIN'+Math.random().toString(36).substr(2,9).toUpperCase(), plate: 'ABC-7788', model: 'Tesla Model 3', color: 'White' },
      { vin: 'VIN'+Math.random().toString(36).substr(2,9).toUpperCase(), plate: 'XYZ-1010', model: 'Toyota Camry', color: 'Silver' },
      { vin: 'VIN'+Math.random().toString(36).substr(2,9).toUpperCase(), plate: 'WASH-2020', model: 'BMW 3 Series', color: 'Black' }
    ];
    setTimeout(async () => {
      await axios.post('http://localhost:3001/api/fleet/import', { vehicles: mockVehicles });
      setImportStatus('Import successful! 3 vehicles added.');
      fetchFleet();
      setTimeout(() => setImportStatus(null), 3000);
    }, 1500);
  };

  const handleSimulateAnalysis = async () => {
    setIsAnalyzing(true);
    const res = await axios.post('http://localhost:3001/api/analyze/file', { fileName: 'shift_logs_march.pdf', fileType: 'application/pdf' });
    setTimeout(() => {
      setAnalysisResult(res.data);
      setIsAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Fleet Intelligence</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Master registry & automated analysis</p>
        </div>
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
          <TabBtn active={activeTab === 'registry'} label="Registry" onClick={() => setActiveTab('registry')} />
          <TabBtn active={activeTab === 'import'} label="Import" onClick={() => setActiveTab('import')} />
          <TabBtn active={activeTab === 'analysis'} label="AI Lab" onClick={() => setActiveTab('analysis')} />
        </div>
      </div>

      {activeTab === 'registry' && (
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 flex-1 max-w-xs">
              <Search size={16} className="text-slate-400" />
              <input type="text" placeholder="Search fleet..." className="bg-transparent border-none outline-none text-xs font-bold w-full" />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{fleet.length} Active Vehicles</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-8 py-4">Plate</th><th className="px-8 py-4">VIN</th><th className="px-8 py-4">Model</th><th className="px-8 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold text-slate-600">
              {fleet.map((v, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-8 py-4 text-blue-600">{v.plate}</td><td className="px-8 py-4 font-mono text-xs">{v.vin}</td><td className="px-8 py-4">{v.model}</td><td className="px-8 py-4"><span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[10px]">AUTHORIZED</span></td>
                </tr>
              ))}
              {fleet.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-slate-400 italic">Fleet registry empty. Use the Import tab to load vehicles.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="max-w-2xl mx-auto py-12 text-center space-y-8">
          <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><Upload size={40} /></div>
          <div className="space-y-2">
            <h3 className="text-xl font-black uppercase">Import Fleet Data</h3>
            <p className="text-sm text-slate-500 font-medium">Upload vehicle spreadsheets (.csv, .xlsx) to sync with master registry</p>
          </div>
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[40px] transition-all hover:border-blue-400 hover:bg-blue-50/30 group cursor-pointer" onClick={handleMockImport}>
            <div className="flex flex-col items-center gap-4">
              <FileText size={32} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
              <span className="text-xs font-black uppercase text-slate-400 group-hover:text-blue-600">{importStatus || 'Click to select or drop file here'}</span>
            </div>
          </div>
          <div className="flex justify-center gap-8 text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500" /> Auto-Normalization</div>
            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500" /> Duplicate Removal</div>
            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500" /> TSD ID Matching</div>
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-6">
              <div className="flex items-center gap-3"><Brain className="text-blue-400" /><h3 className="font-black uppercase tracking-tight">Gemini Lab</h3></div>
              <p className="text-xs text-white/50 leading-relaxed font-medium">Upload any file type—spreadsheets, yard photos, or shift logs. Our multimodal AI model will extract insights and flag anomalies.</p>
              <button onClick={handleSimulateAnalysis} disabled={isAnalyzing} className="w-full bg-blue-600 p-4 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">
                {isAnalyzing ? <RefreshCw className="animate-spin" /> : <Zap size={18} />} Analyze Shift Log
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            {analysisResult ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[40px] border border-slate-200 space-y-6 shadow-sm">
                <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                  <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">Analysis Report</h4>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase">{analysisResult.aiModel}</span>
                </div>
                <div className="space-y-4">
                  {analysisResult.findings.map((f: string, i: number) => (
                    <div key={i} className="flex gap-4 items-start p-4 bg-slate-50 rounded-2xl">
                      <div className="w-6 h-6 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-slate-400">{i+1}</div>
                      <p className="text-sm font-bold text-slate-700">{f}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-4 flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                  <span>Confidence: {(analysisResult.confidence * 100).toFixed(0)}%</span>
                  <button onClick={() => setAnalysisResult(null)} className="text-red-500 flex items-center gap-1 hover:text-red-600 transition-colors"><X size={12} /> Clear Lab</button>
                </div>
              </motion.div>
            ) : (
              <div className="h-full border-2 border-dashed border-slate-200 rounded-[40px] flex flex-col items-center justify-center text-slate-400 gap-4 p-12">
                <Brain size={48} className="opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest text-center">AI analysis engine idle.<br/>Select a file to begin inspection.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TabBtn = ({ active, label, onClick }: any) => (
  <button onClick={onClick} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{label}</button>
);

export default FleetManager;
