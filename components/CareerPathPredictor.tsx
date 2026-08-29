
import React, { useState, useEffect, useRef } from 'react';
import { Project, ResumeContent, CareerPredictionResult, Language } from '../types';
import { generateCareerPrediction, generateCareerStrategy } from '../services/geminiService';
import { CREDIT_COSTS } from '../credits';
import { getDemoCareerPrediction } from '../services/career/demoData';
import { TRANSLATIONS } from '../constants';

interface CareerPathPredictorProps {
  projects: Project[];
  resume: ResumeContent | null;
  onNavigateToResume?: (role: string) => void;
  onDownloadComplete?: (role: string) => void;
  lang: Language;
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onCheckCredits?: (cost: number) => Promise<boolean>;
  onSpendCredits?: (cost: number) => Promise<void>;
  initialData?: any;
  onDataUpdate?: (data: any) => void;
  onSaveHistory?: (silent: boolean) => void;
}

interface StrategyHistoryItem {
    id: string;
    role: string;
    timestamp: number;
    data: any;
}

export const CareerPathPredictor: React.FC<CareerPathPredictorProps> = ({ 
  projects, 
  resume, 
  onNavigateToResume, 
  onDownloadComplete, 
  lang, 
  isLoggedIn = false, 
  onLogin, 
  onCheckCredits,
  onSpendCredits,
  initialData,
  onDataUpdate,
  onSaveHistory
}) => {
  const [loading, setLoading] = useState(false);
  /* Signed out with nothing saved, the module used to stop at its entry screen,
     so a visitor could not see what it produces without paying for a run first.
     Every other module shows a worked example instead. */
  /* Decided once at mount. The seeded result is synced straight back up into
     the parent's careerData, so re-deriving this each render would see a
     result present and drop the label off its own example. */
  const seeded = useRef(!isLoggedIn && !initialData?.result);
  const demo = !isLoggedIn && seeded.current;
  const [result, setResult] = useState<CareerPredictionResult | null>(
    initialData?.result || (demo ? getDemoCareerPrediction(lang) : null)
  );
  const [selectedPathIndex, setSelectedPathIndex] = useState(initialData?.selectedPathIndex || 0);
  const [targetRole, setTargetRole] = useState(initialData?.targetRole || '');
  const [entryMode, setEntryMode] = useState<'idle' | 'targeted'>(initialData?.entryMode || 'idle');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  
  const [strategyHistory, setStrategyHistory] = useState<StrategyHistoryItem[]>([]);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyData, setStrategyData] = useState<any>(initialData?.strategyData || null);

  // Sync back to parent
  useEffect(() => {
    onDataUpdate?.({
        result,
        selectedPathIndex,
        targetRole,
        entryMode,
        strategyData
    });
  }, [result, selectedPathIndex, targetRole, entryMode, strategyData, onDataUpdate]);

  // Restore from props
  useEffect(() => {
    if (initialData) {
        if (initialData.result !== undefined) setResult(initialData.result);
        if (initialData.selectedPathIndex !== undefined) setSelectedPathIndex(initialData.selectedPathIndex);
        if (initialData.targetRole !== undefined) setTargetRole(initialData.targetRole);
        if (initialData.entryMode !== undefined) setEntryMode(initialData.entryMode);
        if (initialData.strategyData !== undefined) setStrategyData(initialData.strategyData);
    }
  }, [initialData]);
  const strategyContainerRef = useRef<HTMLDivElement>(null);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  useEffect(() => {
      const saved = localStorage.getItem('career_strategy_history_v3');
      if (saved) {
          try { setStrategyHistory(JSON.parse(saved)); } catch(e) {}
      }
  }, []);

  const resetAll = () => {
      setResult(null);
      setStrategyData(null);
      setTargetRole('');
      setEntryMode('idle');
      setSelectedPathIndex(0);
  };

  const handlePredict = async (isReAnalysis = false) => {
    if (!isLoggedIn) {
        onLogin?.();
        return;
    }
    if (onCheckCredits && !(await onCheckCredits(CREDIT_COSTS.careerAnalysis))) return;

    setLoading(true);
    setStrategyData(null); 
    if (isReAnalysis) setResult(null); 
    try {
      const data = await generateCareerPrediction(projects, resume, isReAnalysis ? targetRole : undefined, lang);
      await onSpendCredits?.(CREDIT_COSTS.careerAnalysis);
      setResult(data);
    } catch (e: any) {
      alert(e?.message || "Prediction failed. You have not been charged.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStrategy = async () => {
    if (!isLoggedIn) {
        onLogin?.();
        return;
    }
    if (!result || !result.paths[selectedPathIndex]) return;
    
    if (onCheckCredits && !(await onCheckCredits(CREDIT_COSTS.careerStrategy))) return;

    setStrategyLoading(true);
    setStrategyData(null);
    try {
      const path = result.paths[selectedPathIndex];
      const data = await generateCareerStrategy(resume, projects, path.role, path.missingSkills, lang);
      await onSpendCredits?.(CREDIT_COSTS.careerStrategy);
      setStrategyData(data);
      
      const newEntry: StrategyHistoryItem = {
          id: Date.now().toString(),
          role: path.role,
          timestamp: Date.now(),
          data: data
      };
      const updatedHistory = [newEntry, ...strategyHistory].slice(0, 10);
      setStrategyHistory(updatedHistory);
      localStorage.setItem('career_strategy_history_v3', JSON.stringify(updatedHistory));
      if (onDownloadComplete) onDownloadComplete(path.role);

      setTimeout(() => {
          strategyContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (e) {
        alert("Strategy generation failed.");
    } finally {
      setStrategyLoading(false);
    }
  };

  const loadStrategyFromHistory = (item: StrategyHistoryItem) => {
      setStrategyData(item.data);
      if (!result) {
          setResult({
              currentLevel: "Saved History",
              skillTrajectory: [],
              paths: [{
                  role: item.role, match: 95, salaryRange: "", timeToReach: "", 
                  description: "Loaded from saved history", missingSkills: []
              }],
              actionPlan: []
          });
      }
      setSelectedPathIndex(0); 
      setShowHistoryPanel(false);
  };

  const handleDownloadPDF = async () => {
      if (!strategyData || !currentPath) return;

      if (!isLoggedIn) {
          onLogin?.();
          return;
      }

      const html2pdf = (window as any).html2pdf;
      if (!html2pdf) {
          alert("PDF generator not ready. Please refresh and try again.");
          return;
      }

      if (onCheckCredits && !(await onCheckCredits(CREDIT_COSTS.pdfExport))) return;

      // Automatically save to global history when downloading PDF
      if (onSaveHistory) onSaveHistory(true);

      // Create a temporary container for the PDF generation
      // Use flex to perfectly center the content
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '-10000px';
      container.style.left = '0';
      container.style.width = '100vw'; // Full viewport width
      container.style.height = '100vh';
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.zIndex = '-1';
      container.style.background = '#ffffff';
      document.body.appendChild(container);

      const element = document.getElementById('a4-strategy-report');
      if (!element) {
          document.body.removeChild(container);
          return;
      }
      
      // Clone the element to manipulate it without affecting the view
      const clone = element.cloneNode(true) as HTMLElement;
      
      // Clean up the clone for PDF export
      clone.style.transform = 'none';
      clone.style.animation = 'none';
      clone.style.boxShadow = 'none';
      clone.style.margin = '0 auto'; // Ensure centering logic applies within flex container
      clone.style.width = '210mm'; // Enforce A4 width
      clone.style.maxWidth = '210mm';
      clone.style.height = 'auto'; // Allow full height
      clone.classList.remove('animate-slide-down'); // Remove entrance animation
      
      // Remove elements that shouldn't be in the PDF
      const nonPrintables = clone.querySelectorAll('.no-print, [data-html2canvas-ignore]');
      nonPrintables.forEach(el => el.remove());

      container.appendChild(clone);

      const safeRole = currentPath.role.replace(/[\\/:*?"<>|]/g, '_');
      const filename = `Career_Strategy_${safeRole}.pdf`;

      const opt = {
          margin: 0,
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
              scale: 2, 
              useCORS: true, 
              logging: false,
              scrollY: 0,
              onclone: (clonedDoc: any) => {
                const elements = clonedDoc.querySelectorAll('*');
                const canvas = clonedDoc.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return;
                
                const convertColor = (colorStr: string) => {
                  if (!colorStr || !colorStr.includes('oklch')) return colorStr;
                  ctx.clearRect(0, 0, 1, 1);
                  ctx.fillStyle = colorStr;
                  ctx.fillRect(0, 0, 1, 1);
                  const d = ctx.getImageData(0, 0, 1, 1).data;
                  return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${d[3] / 255})`;
                };

                elements.forEach((el: any) => {
                  const style = clonedDoc.defaultView?.getComputedStyle(el);
                  if (!style) return;
                  const bg = style.backgroundColor;
                  const color = style.color;
                  const border = style.borderColor;
                  
                  if (bg && bg.includes('oklch')) el.style.backgroundColor = convertColor(bg);
                  if (color && color.includes('oklch')) el.style.color = convertColor(color);
                  if (border && border.includes('oklch')) el.style.borderColor = convertColor(border);
                });
              }
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
      };
      
      try {
          await html2pdf().set(opt).from(clone).save();
          await onSpendCredits?.(CREDIT_COSTS.pdfExport);
      } catch(e) { 
          console.error("PDF Export Error:", e);
          alert("Failed to generate PDF. You have not been charged.");
      } finally {
          document.body.removeChild(container);
      }
  };

  const paths = result?.paths || [];
  const currentPath = paths[selectedPathIndex];

  if (loading) {
    return (
      <div className="w-full bg-[#0b1120] text-white min-h-[calc(100vh-160px)] flex flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-10 animate-fade-in">
          <div className="relative">
            {/* Brand Logo Replica */}
            <div className="w-24 h-24 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-[2.2rem] flex items-center justify-center shadow-[0_0_60px_rgba(79,70,229,0.4)] relative transition-all duration-500 border border-white/10">
                <svg viewBox="0 0 24 24" className="w-12 h-12 text-white" fill="currentColor">
                    <path d="M11 2L3 14h8v8l8-12h-8V2z" />
                </svg>
                {/* Status Dot */}
                <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-500 border-[6px] border-[#0b1120] rounded-full shadow-xl z-10">
                    <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></span>
                </div>
            </div>
            {/* Spinning Ring */}
            <div className="absolute -inset-6 border-2 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
          </div>
          <div className="text-center">
            <h2 className="text-4xl font-black uppercase tracking-[0.25em] mb-4 text-white">{t.cpAnalyzing || "Analyzing Career Data"}</h2>
            <p className="text-indigo-400/60 font-black uppercase tracking-[0.4em] text-[11px] animate-pulse">{t.cpGenerating || "Consulting Gemini Intelligence..."}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="w-full bg-[#0b1120] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-6">
        <div className="max-w-4xl w-full text-center animate-fade-in relative">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 blur-[100px] rounded-full"></div>
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-8">
            {t.cpAiTitle}
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 text-white leading-none">
            {t.cpMapFuture.split(' ')[0]} <span className="text-indigo-500">{t.cpMapFuture.split(' ').slice(1).join(' ')}</span>
          </h1>
          <p className="text-slate-400 text-xl font-bold max-w-xl mx-auto leading-relaxed mb-12">
            {t.cpSubtitle}
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            <button onClick={() => handlePredict(false)} className="p-10 bg-white/5 border border-white/10 rounded-[3rem] hover:bg-white/10 transition-all text-left group">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-xl shadow-indigo-500/20">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <h3 className="text-2xl font-black mb-2 text-white uppercase tracking-tight">{t.cpAutoTrajectory}</h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-loose">{t.cpBasedOnResume}</p>
            </button>
            <button onClick={() => setEntryMode('targeted')} className="p-10 bg-white/5 border border-white/10 rounded-[3rem] hover:bg-white/10 transition-all text-left group">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-xl shadow-purple-500/20">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </div>
              <h3 className="text-2xl font-black mb-2 text-white uppercase tracking-tight">{t.cpTargetedPivot}</h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-loose">{t.cpAimSpecific}</p>
            </button>
          </div>

          {entryMode === 'targeted' && (
            <div className="mt-8 p-10 bg-white/5 border border-white/10 rounded-[3rem] animate-fade-in-up">
                <div className="flex flex-col md:flex-row gap-4">
                  <input type="text" placeholder={t.cpTargetPlaceholder} value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="flex-grow bg-[#1e293b] border border-white/10 p-5 rounded-2xl text-base font-bold text-white outline-none focus:border-indigo-500 transition-all" />
                  <button onClick={() => handlePredict(true)} disabled={!targetRole.trim() || loading} className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-30 flex items-center justify-center min-w-[140px]">
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : t.cpPredict}
                  </button>
                </div>
            </div>
          )}
        </div>
      </div>
    );
  }



  return (
    <div className="w-full bg-[#0b1120] text-white font-['Plus_Jakarta_Sans'] pb-40 overflow-x-hidden">
      {/* Signed-out visitors are looking at a fictional graduate's trajectory.
          Numbers this specific must say whose they are, or the page is claiming
          to have read a resume it has never seen. */}
      {demo && (
        <div className="max-w-[1600px] mx-auto px-8 lg:px-20 pt-20">
          <div className="rounded-[1.5rem] border border-indigo-500/20 bg-indigo-500/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <span className="inline-flex items-center gap-2 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400">
                  {lang === 'zh' ? '示例' : 'Example'}
                </span>
              </span>
              <p className="text-sm font-bold text-white">
                {lang === 'zh' ? '这是一份示例,不是你的数据。' : 'This is a worked example, not your data.'}
              </p>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                {lang === 'zh'
                  ? '一位虚构的应届生的职业轨迹。登录后可以用你自己的经历跑一遍。'
                  : 'A fictional graduate\u2019s trajectory. Sign in to run it on your own history.'}
              </p>
            </div>
            <button
              onClick={onLogin}
              className="shrink-0 px-6 py-3 rounded-2xl bg-white text-slate-900 text-sm font-black hover:bg-indigo-400 hover:text-white transition-all"
            >
              {lang === 'zh' ? '用我的经历' : 'Use my history'}
            </button>
          </div>
        </div>
      )}

      {/* 1. HERO & TIMELINE (Fixed Grid split to prevent overlap) */}
      <div className={`max-w-[1600px] mx-auto pb-12 px-8 lg:px-20 mb-12 ${demo ? 'pt-12' : 'pt-24'}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[0.65fr_1.35fr] gap-16 lg:gap-16 items-center">
            {/* Left side: Role Title */}
            <div className="animate-fade-in z-20 relative">
                <div className="mb-10 flex items-center gap-4">
                    <button onClick={resetAll} className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-indigo-400 flex items-center gap-2 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg>
                        {t.cpStartOver || "Restart"}
                    </button>
                    <div className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400">
                        {t.cpTimeline || "Future Trajectory"}
                    </div>
                </div>
                <h1 className="text-5xl md:text-6xl xl:text-7xl font-black tracking-tighter leading-[0.9] text-white mb-8 max-w-xl break-normal">
                    {result?.currentLevel || "Professional"}
                </h1>
                <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-[320px]">
                    Modeling your trajectory based on technical benchmarks and active portfolio nodes.
                </p>
            </div>

            {/* Right side: Timeline Visualizer */}
            <div className="relative py-32 flex items-center overflow-x-auto lg:overflow-visible no-scrollbar">
                <div className="min-w-[800px] lg:min-w-0 w-full relative pr-32 lg:pr-12">
                    {/* Pulse Line */}
                    <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-indigo-500/0 via-indigo-500/20 to-indigo-500/0 -translate-y-1/2"></div>
                    
                    <div className="flex justify-end gap-6 lg:gap-12 items-center w-full relative z-10 px-4">
                        {result?.skillTrajectory.slice(0, 3).map((step, i) => (
                            <div key={i} className={`relative flex flex-col items-center group ${i % 2 === 0 ? '-top-24' : 'top-24'}`}>
                                <div className="bg-slate-900/95 backdrop-blur-3xl border border-white/10 p-5 rounded-3xl w-40 text-center shadow-2xl transition-all group-hover:scale-110 group-hover:border-indigo-500/50">
                                    <span className="block text-[7px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">{step.year}</span>
                                    <p className="text-[9px] font-bold text-slate-200 leading-tight uppercase">{step.skill}</p>
                                </div>
                                <div className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-indigo-500 border-2 border-[#0b1120] shadow-[0_0_20px_rgba(99,102,241,1)] z-20 ${i % 2 === 0 ? 'top-[calc(100%+80px)]' : 'bottom-[calc(100%+80px)]'}`}></div>
                                <div className={`absolute w-px bg-gradient-to-b ${i % 2 === 0 ? 'from-indigo-500/50 to-transparent top-full h-20' : 'from-transparent to-indigo-500/50 bottom-full h-20'}`}></div>
                            </div>
                        ))}
                        
                        <div className="relative flex flex-col items-center -top-24 ml-4">
                            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-6 rounded-[2.5rem] w-56 text-center shadow-[0_0_60px_rgba(99,102,241,0.4)] border border-white/20 transform scale-110">
                                <span className="block text-[8px] font-black text-indigo-100 uppercase tracking-[0.3em] mb-2">TARGET GOAL</span>
                                <p className="text-[11px] font-black text-white leading-tight uppercase">{currentPath?.role}</p>
                            </div>
                            <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+80px)] w-5 h-5 rounded-full bg-white border-4 border-indigo-600 shadow-[0_0_25px_rgba(255,255,255,1)] z-30 animate-pulse"></div>
                            <div className="absolute top-full h-20 w-px bg-indigo-500"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* 2. OPTION CARDS */}
      <div className="max-w-[1400px] mx-auto px-8 mb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-stretch">
            {paths.map((path, idx) => {
                const isSelected = selectedPathIndex === idx;
                const isBestMatch = idx === 0;
                return (
                    <div key={idx} onClick={() => { setSelectedPathIndex(idx); setStrategyData(null); }}
                        className={`relative p-12 rounded-[4rem] border-2 transition-all cursor-pointer group flex flex-col min-h-[640px]
                            ${isBestMatch ? 'bg-white text-slate-900 border-white shadow-[0_80px_160px_-40px_rgba(255,255,255,0.1)] scale-105 z-10' : 'bg-white/5 text-white border-white/5 hover:bg-white/10'}
                        `}>
                        <div className="flex justify-between items-start mb-12">
                            <span className={`text-[10px] font-black uppercase tracking-[0.4em] ${isBestMatch ? 'text-slate-400' : 'text-slate-500'}`}>OPTION 0{idx + 1}</span>
                            {isBestMatch && <div className="px-4 py-2 bg-indigo-600 text-white rounded-2xl flex items-center gap-2 shadow-xl shadow-indigo-100"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span><span className="text-[9px] font-black uppercase tracking-widest">Best Match</span></div>}
                        </div>
                        <h3 className="text-3xl font-black mb-8 leading-none tracking-tighter uppercase min-h-[2.5em]">{path.role}</h3>
                        <div className={`flex items-center gap-3 mb-10 pb-8 border-b ${isBestMatch ? 'border-slate-100' : 'border-white/5'}`}>
                            <div className="flex gap-1">
                                {[1,2,3,4,5].map(star => <span key={star} className={`text-sm ${star <= Math.round(path.match/20) ? (isBestMatch ? 'text-indigo-600' : 'text-indigo-400') : (isBestMatch ? 'text-slate-200' : 'text-slate-800')}`}>★</span>)}
                            </div>
                            <span className={`text-xs font-black uppercase tracking-widest ${isBestMatch ? 'text-indigo-600' : 'text-slate-500'}`}>{path.match}% Match</span>
                        </div>
                        <p className={`text-[15px] leading-relaxed mb-12 flex-grow font-medium ${isBestMatch ? 'text-slate-500' : 'text-slate-400'}`}>{path.description}</p>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedPathIndex(idx); handleGenerateStrategy(); }} disabled={strategyLoading}
                            className={`w-full py-6 rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3
                                ${isBestMatch ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40 hover:bg-indigo-700' : 'bg-white/5 text-white border border-white/10 hover:bg-white/20'}
                            `}>
                            {strategyLoading && isSelected ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <span>CALCULATING...</span>
                                </>
                            ) : 'Analyze Deployment →'}
                        </button>
                    </div>
                );
            })}
        </div>

        {/* 3. A4 FORMAT REPORT (Fixed width for capture) */}
        <div ref={strategyContainerRef} className="mt-20 scroll-mt-24">
            {strategyData && !strategyLoading && (
                <div id="a4-strategy-report" className="w-[210mm] mx-auto bg-white text-slate-900 rounded-none shadow-[0_50px_100px_rgba(0,0,0,0.5)] overflow-hidden animate-slide-down" style={{ minHeight: '297mm', boxSizing: 'border-box' }}>
                    <div className="p-[20mm]">
                        <div className="border-b-4 border-slate-900 pb-10 mb-12 flex justify-between items-end">
                            <div>
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.5em] mb-4 block">INTERNAL DEPLOYMENT STRATEGY</span>
                                <h2 className="text-5xl font-black tracking-tighter text-slate-900 uppercase leading-none">{currentPath?.role}</h2>
                            </div>
                            <div className="text-end no-print" data-html2canvas-ignore="true">
                                <button onClick={handleDownloadPDF} className="px-8 py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all">GENERATE PDF</button>
                                <button onClick={() => setStrategyData(null)} className="ml-4 text-[10px] font-black text-rose-500 uppercase">CLOSE</button>
                            </div>
                        </div>

                        <div className="space-y-16">
                            <section style={{ pageBreakInside: 'avoid' }}>
                                <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-widest border-l-8 border-indigo-600 pl-6">01. Skill Gap Analysis</h3>
                                <div className="grid grid-cols-1 gap-6">
                                    {strategyData.gapFix?.map((item: any, i: number) => (
                                        <div key={i} className="p-8 bg-slate-50 border border-slate-200 rounded-xl">
                                            <h5 className="font-black text-slate-900 text-base mb-2 uppercase">{item.topic}</h5>
                                            <p className="text-sm text-slate-600 leading-relaxed mb-4">{item.advice}</p>
                                            <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Resource: {item.resource}</div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section style={{ pageBreakInside: 'avoid' }}>
                                <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-widest border-l-8 border-purple-600 pl-6">02. Interview Scenarios</h3>
                                <div className="space-y-6">
                                    {strategyData.interviewPrep?.map((item: any, i: number) => (
                                        <div key={i} className="p-8 bg-purple-50/50 border border-purple-100 rounded-xl italic">
                                            <p className="font-bold text-slate-900 text-base mb-4">"{item.question}"</p>
                                            <p className="text-sm text-slate-600 leading-relaxed font-medium not-italic pl-6 border-l-2 border-purple-300">{item.suggestedAnswer}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section style={{ pageBreakInside: 'avoid' }}>
                                <h3 className="text-xl font-black text-slate-900 mb-8 uppercase tracking-widest border-l-8 border-cyan-600 pl-6">03. Portfolio Roadmap</h3>
                                <div className="grid grid-cols-2 gap-8">
                                    {strategyData.portfolioUpgrade?.map((item: any, i: number) => (
                                        <div key={i} className="p-8 bg-cyan-50/30 border border-cyan-100 rounded-xl">
                                            <h5 className="font-black text-slate-900 text-base mb-2 uppercase">{item.title}</h5>
                                            <p className="text-sm text-slate-600 leading-relaxed">{item.strategy}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>

                        <div className="mt-24 pt-8 border-t border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.8em]">CONFIDENTIAL DOCUMENT • FAST RESUME AI INTELLIGENCE 2026</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* 4. SAVED DRAWER (Centered Empty State Fix) */}
      <div className={`fixed top-1/2 -translate-y-1/2 right-0 z-[100] transition-all duration-700 flex items-center ${showHistoryPanel ? 'translate-x-0' : 'translate-x-[calc(100%-3rem)]'}`}>
            <button onClick={() => setShowHistoryPanel(!showHistoryPanel)} className="w-12 bg-[#1e293b] h-72 rounded-l-3xl flex flex-col items-center justify-center gap-10 shadow-2xl border border-white/10 group hover:w-14 transition-all">
                <div style={{ writingMode: 'vertical-rl' }} className="text-[9px] font-black tracking-[0.6em] text-slate-400 group-hover:text-white transition-colors rotate-180 uppercase">SAVED PLANS</div>
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-[11px] font-black text-white shadow-lg">{strategyHistory.length}</div>
            </button>
            <div className="w-80 h-[80vh] bg-[#0b1222] border-l border-white/10 shadow-[-50px_0_150px_rgba(0,0,0,0.6)] flex flex-col rounded-l-[4rem] overflow-hidden">
                <div className="p-12 pb-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <h3 className="text-2xl font-black text-white tracking-tighter">History</h3>
                    <button onClick={() => { if(confirm("Clear history?")) { setStrategyHistory([]); localStorage.removeItem('career_strategy_history_v3'); } }} className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-400">CLEAR</button>
                </div>
                <div className="flex-grow flex flex-col overflow-y-auto custom-scrollbar">
                    {strategyHistory.length > 0 ? (
                        <div className="p-8 space-y-6">
                            {strategyHistory.map(h => (
                                <div key={h.id} onClick={() => loadStrategyFromHistory(h)} className="p-8 rounded-[3rem] bg-white/5 border border-white/5 hover:border-indigo-500/50 cursor-pointer transition-all hover:bg-white/10 group">
                                    <h4 className="text-[13px] font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{h.role}</h4>
                                    <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{new Date(h.timestamp).toLocaleDateString()}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 opacity-20 text-center grayscale select-none">
                            <div className="text-7xl mb-8 animate-pulse">📁</div>
                            <h4 className="text-xs font-black text-white uppercase tracking-[0.5em]">Vault Empty</h4>
                            <p className="text-[10px] font-medium text-slate-400 mt-2 uppercase tracking-widest">No saved plans found</p>
                        </div>
                    )}
                </div>
            </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .animate-slide-down { animation: slideDown 1.2s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-80px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
};
