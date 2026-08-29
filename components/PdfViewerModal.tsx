
import React, { useState, useEffect, useRef } from 'react';
import { generateDocumentSummary } from '../services/geminiService';
import { Language } from '../types';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: string; // Base64 string
  mimeType: string;
  title: string;
  lang?: Language;
  initialSummary?: string;
  initialKeyPoints?: string[];
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ 
  isOpen, 
  onClose, 
  documentData, 
  mimeType, 
  title, 
  lang = 'en',
  initialSummary,
  initialKeyPoints
}) => {
  const [loading, setLoading] = useState(true);
  const [aiAnalyzing, setAiAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<{ summary: string; keyPoints: string[] } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    // Optimization: Use existing analysis if available
    if (initialSummary && initialSummary.length > 20 && initialSummary !== "Analysis unavailable.") {
        setAnalysis({ 
            summary: initialSummary, 
            keyPoints: initialKeyPoints || [] 
        });
        setLoading(false);
        setAiAnalyzing(false);
        return;
    }
    
    setLoading(true);
    setAiAnalyzing(true);
    setAnalysis(null);

    // 1. Trigger Gemini Analysis with Context
    generateDocumentSummary(documentData, mimeType, lang as Language).then(result => {
        setAnalysis(result);
        setAiAnalyzing(false);
    });
    
    // Simulate loading for visual effect
    setTimeout(() => setLoading(false), 800);

  }, [isOpen, documentData, mimeType, lang, initialSummary, initialKeyPoints]);

  const handleDownload = () => {
    const link = document.createElement('a');
    if (mimeType === 'text/plain' || mimeType === 'application/json') {
        link.href = `data:${mimeType};charset=utf-8,${encodeURIComponent(documentData)}`;
    } else {
        link.href = `data:${mimeType};base64,${documentData}`;
    }
    link.download = `Original_${title.replace(/\s+/g, '_')}.${mimeType === 'text/plain' ? 'txt' : mimeType.split('/')[1] || 'bin'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4 lg:p-12">
      <div className="relative bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl h-[80vh] flex overflow-hidden animate-fade-in border border-white/10">
        
        {/* Left: Visual / Cover Representation */}
        <div className="w-[40%] bg-slate-100 flex flex-col relative border-r border-slate-200">
            <div className="flex-grow flex items-center justify-center p-12 bg-slate-50 relative overflow-hidden group">
                {/* Decorative Background */}
                <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-50"></div>
                
                {/* Document Card / Cover */}
                <div className="w-48 aspect-[3/4] bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center border border-slate-200 relative z-10 transform group-hover:scale-105 transition-transform duration-500 overflow-hidden">
                     {mimeType.startsWith('image/') ? (
                         <img src={`data:${mimeType};base64,${documentData}`} className="w-full h-full object-contain" />
                     ) : (
                         <>
                            <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DOCUMENT</span>
                            <div className="absolute bottom-0 w-full h-1 bg-indigo-500"></div>
                         </>
                     )}
                </div>
            </div>
            
            <div className="p-8 bg-white border-t border-slate-100">
                <h3 className="text-xl font-black text-slate-900 mb-2 leading-tight truncate">{title}</h3>
                <button 
                    onClick={handleDownload}
                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-black transition-all flex items-center justify-center gap-3 shadow-lg"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Original
                </button>
            </div>
        </div>

        {/* Right: AI Intelligence Panel */}
        <div className="w-[60%] bg-white p-12 flex flex-col relative overflow-hidden">
            <button onClick={onClose} className="absolute top-8 right-8 w-10 h-10 rounded-full bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-all font-bold text-lg z-20">×</button>
            
            <div className="mb-10 relative z-10">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">AI Intelligence</span>
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    {title} <br/>
                    <span className="text-slate-300 text-3xl">Value Analysis</span>
                </h2>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar relative z-10 pr-4">
                {aiAnalyzing ? (
                    <div className="space-y-8 animate-pulse">
                        <div className="space-y-3">
                            <div className="h-4 bg-slate-100 rounded w-1/3 mb-4"></div>
                            <div className="h-3 bg-slate-50 rounded w-full"></div>
                            <div className="h-3 bg-slate-50 rounded w-full"></div>
                            <div className="h-3 bg-slate-50 rounded w-4/5"></div>
                        </div>
                        <div className="space-y-3">
                            <div className="h-4 bg-slate-100 rounded w-1/4 mb-4"></div>
                            <div className="flex gap-2">
                                <div className="h-8 w-24 bg-slate-50 rounded-lg"></div>
                                <div className="h-8 w-32 bg-slate-50 rounded-lg"></div>
                            </div>
                        </div>
                    </div>
                ) : analysis ? (
                    <div className="space-y-10 animate-fade-in-up">
                        {/* Executive Summary */}
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Executive Summary</h4>
                            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-sm font-medium text-slate-600 leading-loose">
                                {analysis.summary}
                            </div>
                        </div>

                        {/* Competencies Tags */}
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Key Competencies</h4>
                            <div className="flex flex-wrap gap-3">
                                {analysis.keyPoints.map((point, i) => (
                                    <span key={i} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-300 transition-colors cursor-default">
                                        # {point}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <p className="text-slate-400 font-bold">Analysis unavailable.</p>
                    </div>
                )}
            </div>
            
            {/* Ambient Background Blur */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-50 rounded-full blur-[80px] pointer-events-none"></div>
        </div>

      </div>
    </div>
  );
};
