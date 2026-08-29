
import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as mammoth from 'mammoth';
import QRCode from 'qrcode';
import { Layout, Palette, FilePlus, Globe, Share2, Download, History, ArrowLeft, ArrowRight, Trash2, RefreshCw, Plus, X, ExternalLink, Image as ImageIcon, Layers } from 'lucide-react';
import { PortfolioData, Project, Language, Template } from '../types';
import { analyzeProjectMedia, generatePortfolioBio, generateDocumentSummary, analyzeWebsiteContent } from '../services/geminiService';
import { CREDIT_COSTS } from '../credits';
import { supabase } from '../services/supabaseClient'; 
import { TRANSLATIONS } from '../constants';

interface PortfolioGeneratorProps {
  portfolioData: PortfolioData;
  setPortfolioData: React.Dispatch<React.SetStateAction<PortfolioData>>;
  onGenerateProject: (fileInput: { mimeType: string; data: string; fileName: string; analysisData?: string; analysisMimeType?: string }, section?: string) => Promise<void> | void;
  isLoading: boolean;
  onCancelLoading?: () => void;
  readOnly?: boolean;
  lang?: Language;
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onSaveHistory?: (silent: boolean) => void;
}

const COLORS = {
  indigo: '#6366f1',
  blue: '#3b82f6',
  emerald: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
  slate: '#334155',
  violet: '#8b5cf6',
};

const TEMPLATES: { id: Template; name: string; icon: string; desc: string }[] = [
    { id: 'Minimalist', name: 'MINIMALIST', icon: 'M', desc: 'Clean / Brooklyn Style' },
    { id: 'Professional', name: 'PROFESSIONAL', icon: 'P', desc: 'Dark / Enver Style' },
    { id: 'Creative', name: 'CREATIVE', icon: 'C', desc: 'Bold / Gradient Style' },
    { id: 'Retro', name: 'RETRO', icon: 'R', desc: 'Vintage / Serif Style' },
    { id: 'Studio', name: 'STUDIO', icon: 'S', desc: 'Grid / Swiss Style' },
    { id: 'Pop', name: 'POP', icon: '✨', desc: 'Playful / Comic Style' },
];

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIMENSION = 1200;
        if (width > height) {
          if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; }
        } else {
          if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]); }
        else { resolve(event.target?.result as string); }
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};

const Editable = ({ value, onChange, isEditing, className = "", tagName: Tag = 'div', multiline = false, placeholder = "Edit..." }: any) => {
    const [localValue, setLocalValue] = useState(value || '');
    useEffect(() => { setLocalValue(value || ''); }, [value]);
    if (!isEditing) return <Tag className={className}>{value || ''}</Tag>;
    const commonClasses = `bg-white/90 text-[#1e293b] border-2 border-[var(--theme-primary-color)]/30 rounded-lg p-1 outline-none focus:border-[var(--theme-primary-color)] focus:ring-2 focus:ring-[var(--theme-primary-color)]/20 transition-all font-inherit z-[60] relative shadow-sm pointer-events-auto min-w-[2em] inline-block`;
    
    return (
        <div className={`relative inline-block group/edit ${className.includes('w-full') ? 'w-full' : ''} ${className.includes('flex-grow') ? 'flex-grow' : ''}`}>
            {multiline ? (
                <textarea value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => onChange(localValue)} onClick={(e) => e.stopPropagation()} className={`${commonClasses} resize-y w-full ${className}`} placeholder={placeholder} rows={4} style={{ font: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit', color: '#1e293b' }} />
            ) : (
                <input type="text" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => onChange(localValue)} onClick={(e) => e.stopPropagation()} className={`${commonClasses} w-full ${className}`} placeholder={placeholder} style={{ font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: '#1e293b' }} />
            )}
            <button 
                onClick={(e) => { e.stopPropagation(); setLocalValue(''); onChange(''); }}
                className="absolute -right-2 -top-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/edit:opacity-100 transition-opacity z-[70] hover:bg-rose-600 shadow-md cursor-pointer"
                title="Clear content"
            >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
};

const EmptyState = ({ isEditing, onUpload }: { isEditing: boolean, onUpload: () => void }) => (
    <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 mx-auto max-w-xl mt-12 group hover:bg-slate-50 transition-colors">
        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-6 text-3xl group-hover:scale-110 transition-transform duration-300">✨</div>
        <h3 className="text-lg font-black text-slate-900 mb-2 uppercase tracking-tight">START YOUR PORTFOLIO</h3>
        <p className="text-slate-500 font-medium text-xs uppercase tracking-widest max-w-sm mx-auto mb-8 leading-relaxed">UPLOAD YOUR PROJECTS, DESIGNS, OR DOCUMENTS</p>
        {isEditing && (
            <button onClick={(e) => { e.stopPropagation(); onUpload(); }} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center gap-2 mx-auto">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Upload Content
            </button>
        )}
    </div>
);

interface ProjectCardProps {
    project: Project;
    isEditing: boolean;
    activeTemplate: string;
    onUpdateProject: (id: string, field: keyof Project, val: any) => void;
    onDeleteProject: (id: string) => void;
    onMediaClick: (id: string) => void;
    onSetTarget: (id: string) => void;
    onRegenerate: (id: string) => void;
    sections?: string[];
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, isEditing, activeTemplate, onUpdateProject, onDeleteProject, onMediaClick, onSetTarget, onRegenerate, sections }) => {
    const isPop = activeTemplate === 'Pop';
    const isRetro = activeTemplate === 'Retro';
    const isProfessional = activeTemplate === 'Professional';
    const hasLink = project.externalLink && project.externalLink.trim().length > 5;
    
    const [showQr, setShowQr] = useState(true);
    const [qrDataUrl, setQrDataUrl] = useState('');

    const [showSectionMenu, setShowSectionMenu] = useState(false);

    const platformName = React.useMemo(() => {
        if (project.socialPlatform === 'custom' && project.associatedSkills?.[0]) return project.associatedSkills[0];
        if (project.externalLink) { 
            try { 
                const url = new URL(project.externalLink);
                if (url.hostname.includes('youtu.be')) return 'YOUTUBE';
                return url.hostname.replace('www.', '').split('.')[0].toUpperCase(); 
            } catch (e) { return 'LINK'; } 
        }
        return project.socialPlatform || 'VIEW';
    }, [project.socialPlatform, project.externalLink, project.associatedSkills]);

    useEffect(() => {
        let active = true;
        if (project.externalLink && project.externalLink.trim().length > 4) {
            QRCode.toDataURL(project.externalLink, { margin: 1, width: 256, color: { dark: '#0f172a', light: '#ffffff' } })
            .then((url: string) => {
                if(active) {
                    setQrDataUrl(url);
                    setShowQr(true); 
                }
            })
            .catch((err: any) => console.error("QR Gen Error", err));
        } else {
            setQrDataUrl('');
        }
        return () => { active = false; };
    }, [project.externalLink]);

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        if (project.originalMimeType === 'text/plain') { link.href = `data:text/plain;charset=utf-8,${encodeURIComponent(project.base64Data)}`; link.download = `${project.originalFileName || `Project_${project.id}`}.txt`; }
        else { link.href = `data:${project.originalMimeType};base64,${project.base64Data}`; link.download = project.originalFileName || `Project_${project.id}`; }
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const toggleQr = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowQr(!showQr);
    };

    const renderPreview = () => {
        if (project.originalMimeType.startsWith('image/')) return <div className="w-full h-full bg-transparent flex items-center justify-center"><img src={`data:${project.originalMimeType};base64,${project.base64Data}`} className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105" /></div>;
        if (project.originalMimeType.startsWith('video/')) return (<div className="w-full h-full bg-black relative flex items-center justify-center"><video src={`data:${project.originalMimeType};base64,${project.base64Data}`} className="w-full h-full object-contain opacity-80" muted loop autoPlay playsInline /><div className="absolute inset-0 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">▶</div></div></div>);
        if (project.originalMimeType.startsWith('audio/')) return (<div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden group-hover:bg-slate-800 transition-colors"><div className="absolute inset-0 bg-gradient-to-br from-[var(--theme-primary-color)]/20 to-purple-500/20"></div><div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm"><span className="text-3xl">🎵</span></div><div className="flex gap-1 items-end h-8">{[...Array(6)].map((_, i) => (<div key={i} className="w-1.5 bg-[var(--theme-primary-color)] rounded-full animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}></div>))}</div></div>);
        const ext = project.originalFileName.split('.').pop()?.toUpperCase() || 'DOC';
        return (<div className={`w-full h-full flex flex-col items-center justify-center p-6 border transition-colors relative overflow-hidden ${isProfessional ? 'bg-[#1e293b] border-white/5 group-hover:bg-[#253248]' : 'bg-slate-50 border-slate-100 group-hover:bg-slate-100'}`}><div className={`w-14 h-20 rounded-lg shadow-sm flex flex-col items-center justify-center relative z-10 mb-4 ${isProfessional ? 'bg-white/10 text-white' : 'bg-white text-slate-500'}`}><span className="text-[8px] font-black">{ext}</span><div className="w-8 h-0.5 bg-current mt-1 opacity-30"></div><div className="w-6 h-0.5 bg-current mt-1 opacity-30"></div></div><span className={`text-[8px] font-black uppercase tracking-widest truncate w-full text-center px-4 ${isProfessional ? 'text-slate-500' : 'text-slate-400'}`}>{project.originalFileName}</span></div>);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("ProjectCard: Delete requested for", project.id);
        onDeleteProject(project.id);
    };

    return (
        <div className={`group relative transition-all duration-500 h-full flex flex-col project-card-trigger ${showSectionMenu ? 'z-[100]' : 'z-10'} ${isPop ? 'border-4 border-black shadow-[10px_10px_0_rgba(0,0,0,1)] bg-white p-4 rounded-xl' : isRetro ? 'win95-outset p-2 flex flex-col h-full' : isProfessional ? 'bg-transparent' : 'bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-xl'}`} data-pid={project.id}>
            <div className={`aspect-[4/3] overflow-hidden relative cursor-pointer mb-3 ${isPop ? 'border-2 border-black rounded-lg' : isRetro ? 'win95-inset bg-white' : 'rounded-xl'} ${isProfessional && project.type === 'Document' ? 'rounded-xl shadow-lg' : ''}`} onClick={(e) => {
                // Don't trigger upload if clicking a button inside
                if ((e.target as HTMLElement).closest('button')) return;
                isEditing ? onSetTarget(project.id) : onMediaClick(project.id);
            }}>
                {project.base64Data ? renderPreview() : <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 font-bold uppercase text-[10px]">{isEditing ? '+ Upload Content' : 'No Preview'}</div>}
                
                {/* Platform/Link Badge */}
                {hasLink && !showQr && <div className="absolute top-3 left-3 z-20"><div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md shadow-sm border ${isProfessional ? 'bg-[var(--theme-primary-color)] border-[var(--theme-primary-color)] text-white' : 'bg-white border-slate-200 text-slate-600'}`}><svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg><span className="text-[7px] font-black uppercase tracking-wider min-w-0">{platformName}</span></div></div>}
                
                {/* Edit Mode Overlay */}
                {isEditing && <div className="absolute inset-0 bg-[var(--theme-primary-color)]/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"><span className="bg-white text-[var(--theme-primary-color)] text-[10px] font-black uppercase px-3 py-1.5 rounded-lg shadow-lg">Change Media</span></div>}
                
                {/* Delete Media Button */}
                {isEditing && project.base64Data && (
                    <button 
                        onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            onUpdateProject(project.id, 'base64Data', ''); 
                            onUpdateProject(project.id, 'originalMimeType', ''); 
                        }} 
                        className="absolute top-3 right-3 bg-rose-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 hover:bg-rose-600 shadow-md cursor-pointer pointer-events-auto" 
                        title="Remove Media"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}

                {/* Crooked Sticker QR - Top Right - Wrapper for Entrance & Inner for Hover */}
                {showQr && qrDataUrl && (
                    <div 
                        className="absolute top-3 right-3 z-40 sticker-wrapper"
                        onClick={(e) => { e.stopPropagation(); toggleQr(e); }}
                    >
                        <div className="bg-white p-2 rounded-lg border-2 border-slate-900 shadow-[3px_3px_0px_rgba(15,23,42,1)] flex flex-col items-center gap-1 cursor-pointer sticker-card">
                            <div className="flex items-center gap-1 w-full border-b border-slate-100 pb-1 mb-0.5 justify-center">
                                <svg className="w-2.5 h-2.5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                <span className="text-[7px] font-black uppercase tracking-wider text-slate-900 truncate max-w-[60px]">
                                    {platformName}
                                </span>
                            </div>
                            <img src={qrDataUrl} className="w-14 h-14 object-contain mix-blend-multiply" style={{ imageRendering: 'pixelated' }} />
                        </div>
                    </div>
                )}
            </div>
            
            <div className="relative z-20">
                <div className="flex justify-between items-start mb-2 gap-2">
                    <Editable tagName="h4" className={`font-black text-xl uppercase tracking-tight min-h-[1.2em] w-full flex-grow ${isProfessional ? 'text-white' : isRetro ? 'text-[#000080] font-bold text-lg' : 'text-[#1e293b]'}`} isEditing={isEditing} value={project.title} onChange={(v: string) => onUpdateProject(project.id, 'title', v)} />
                    {isEditing && (
                        <div className="flex gap-1 relative z-[80]">
                            <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setShowSectionMenu(!showSectionMenu); }} className={`p-2 rounded-xl transition-all flex items-center gap-2 shadow-sm ${showSectionMenu ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Move to Section">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    <span className="text-[9px] font-black uppercase tracking-widest leading-none">Move</span>
                                </button>
                                {showSectionMenu && sections && (
                                    <div className="absolute right-0 top-full mt-1 bg-white border-2 border-slate-900 shadow-[8px_8px_0_rgba(0,0,0,1)] rounded-xl py-2 z-[100] min-w-[200px] animate-in fade-in zoom-in duration-200">
                                        <div className="px-4 py-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 mb-1 flex items-center justify-between">
                                            <span>Move to Section</span>
                                            <button onClick={(e) => { e.stopPropagation(); setShowSectionMenu(false); }} className="text-slate-400 hover:text-slate-900">✕</button>
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                            {sections.map(s => (
                                                <button key={s} onClick={(e) => { e.stopPropagation(); onUpdateProject(project.id, 'section', s); setShowSectionMenu(false); }} className={`w-full text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider hover:bg-indigo-50 transition-colors flex items-center justify-between ${(project.section || project.category || sections[0]) === s ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600'}`}>
                                                    <span>{s}</span>
                                                    {(project.section || project.category || sections[0]) === s && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onRegenerate(project.id); }} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" title="Regenerate with AI">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </button>
                            <button onClick={handleDelete} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors shadow-sm active:scale-90" title="Delete Project">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex-grow">
                    <Editable tagName="p" multiline className={`text-sm leading-relaxed w-full ${isEditing ? '' : 'line-clamp-4'} ${isProfessional ? 'text-slate-400' : isRetro ? 'text-black' : 'text-slate-500'}`} isEditing={isEditing} value={project.description} onChange={(v: string) => onUpdateProject(project.id, 'description', v)} />
                </div>
            </div>

            <div className={`mt-4 pt-4 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity relative z-20 ${isProfessional ? 'border-t border-white/5' : isRetro ? 'border-t border-[#808080]' : 'border-t border-slate-50'}`}>
                <button onClick={() => onMediaClick(project.id)} className={`text-[10px] font-black uppercase tracking-widest hover:underline ${isRetro ? 'text-[#000080]' : 'text-[var(--theme-primary-color)]'}`}>View Details →</button>
                <div className="flex gap-2">
                    <button onClick={handleDownload} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isProfessional ? 'bg-white/10 text-white hover:bg-white hover:text-slate-900' : isRetro ? 'win95-btn !rounded-none !w-auto !h-auto px-2 py-1 text-xs font-bold' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900'}`} title="Download">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                </div>
            </div>
            
            {isEditing && (
                <div className="pt-5 border-t border-slate-100 flex flex-col gap-4 z-50 relative" onClick={e => e.stopPropagation()}>
                    <div className="relative flex items-center gap-2">
                        <input type="text" placeholder="Link (e.g. youtube.com/...)" className="w-full text-xs p-3 rounded-lg border-2 border-slate-100 focus:border-[var(--theme-primary-color)] outline-none bg-white text-slate-900 pointer-events-auto" value={project.externalLink || ''} onChange={(e) => onUpdateProject(project.id, 'externalLink', e.target.value)} onClick={e => e.stopPropagation()} />
                        <button 
                            onClick={toggleQr}
                            className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95 shrink-0 ${showQr && hasLink ? 'bg-rose-500 text-white shadow-rose-200' : (hasLink ? 'bg-[#4f46e5] text-white shadow-indigo-200 hover:bg-indigo-600' : 'bg-slate-100 text-slate-300')}`}
                            title={showQr ? "Hide QR" : "Show QR"}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zm-6 0H6.414a1 1 0 00-.707.293L4 16.586V18h4v-2H6v-1.586l.293-.293H8V16zm4-12H8v4h4V4z" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

interface TemplateProps {
  data: PortfolioData;
  isEditing: boolean;
  activeTemplate?: string;
  onUpdateField: (field: string, val: string) => void;
  cardProps: Omit<ProjectCardProps, 'project' | 'onRegenerate'>;
  onRegenerateProject: (id: string) => void;
  onRegenerateBio: () => void;
  profilePhotoInputRef: React.RefObject<HTMLInputElement>;
  getProfileUrl: () => string;
  customText: Record<string, string>;
  onUpdateText: (key: string, val: string) => void;
  onUpload?: (section?: string) => void;
  onRenameSection?: (oldName: string, newName: string) => void;
  onDeletePhoto?: () => void;
}

const getGroupedProjects = (projects: Project[], customSections?: string[]) => {
    const defaultSections = ['Visual Design', 'Audio Projects', 'Strategy & Execution'];
    const sections = customSections && customSections.length > 0 ? customSections : defaultSections;
    
    const groups: Record<string, Project[]> = {};
    sections.forEach(s => groups[s] = []);
    
    projects.forEach(p => {
        const cat = p.section || p.category || sections[0];
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });
    
    return groups;
};

const EditableSectionHeader = ({ titleKey, subKey, defaultTitle, defaultSub, customText, onUpdateText, isEditing, onRename, colorClass = "text-slate-900" }: any) => (
    <div className={`flex items-end gap-4 mb-10 border-b border-current pb-4 opacity-80 ${colorClass}`}>
        <Editable tagName="h3" className="text-3xl font-black tracking-tight" value={defaultTitle} isEditing={isEditing} onChange={(v: string) => onRename?.(defaultTitle, v)} />
        <Editable tagName="span" className="text-[10px] font-bold uppercase tracking-widest mb-1.5 opacity-60" value={customText[subKey] || defaultSub} isEditing={isEditing} onChange={(v: string) => onUpdateText(subKey, v)} />
    </div>
);

export const MinimalistTemplate: React.FC<TemplateProps> = ({ data, isEditing, onUpdateField, cardProps, onRegenerateProject, onRegenerateBio, profilePhotoInputRef, customText, onUpdateText, onUpload, onRenameSection, onDeletePhoto }) => { 
    const groupedProjects = getGroupedProjects(data.projects, data.sections); 
    const primaryColor = (COLORS as any)[data.theme.color] || data.theme.color;
    const secondaryColor = (COLORS as any)[data.theme.secondaryColor || 'purple'] || data.theme.secondaryColor || '#a855f7';

    return ( 
        <div className={`w-full flex flex-col flex-grow shrink-0 ${data.projects.length === 0 ? 'justify-center' : 'justify-start'} relative overflow-hidden bg-slate-50`}> 
            <div className="absolute top-0 left-0 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" style={{ backgroundColor: primaryColor }}></div>
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" style={{ backgroundColor: secondaryColor }}></div>
            <div className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
            <div className="max-w-6xl mx-auto py-4 px-8 font-['Inter'] w-full relative z-10 flex flex-col flex-grow">
            <header className="mb-6 text-center relative z-10"> 
                <div className="relative inline-block mx-auto mb-6 group">
                    <div className="w-32 h-32 rounded-full bg-slate-100 overflow-hidden relative cursor-pointer shadow-2xl ring-8 ring-white transform hover:scale-105 transition-all duration-500" onClick={() => isEditing && profilePhotoInputRef.current?.click()}> 
                        {data.userProfile.photo ? <img src={`data:image/jpeg;base64,${data.userProfile.photo}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>} 
                        {isEditing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">Change</div>} 
                    </div> 
                    {isEditing && data.userProfile.photo && (
                        <button onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(); }} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-rose-600 shadow-xl" title="Remove Photo">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter mb-4 bg-clip-text text-transparent animate-gradient-x relative group" style={{ backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor}, ${primaryColor})` }}>
                    <Editable tagName="span" isEditing={isEditing} value={data.jobPackage.resume?.fullName || "[Your Name]"} onChange={(v: string) => onUpdateField('fullName', v)} />
                </h1> 
                <div className="flex items-center justify-center gap-4 mb-8 w-full max-w-3xl mx-auto"> 
                    <div className="h-px w-12 bg-gradient-to-r from-transparent to-slate-300 flex-shrink-0"></div> 
                    <h2 className="text-xl font-light text-slate-500 tracking-widest uppercase flex-grow text-center"><Editable tagName="span" className="w-full text-center" isEditing={isEditing} value={data.userProfile.role} onChange={(v: string) => onUpdateField('role', v)} /></h2> 
                    <div className="h-px w-12 bg-gradient-to-l from-transparent to-slate-300 flex-shrink-0"></div> 
                </div> 
                <div className="max-w-2xl mx-auto relative group">
                    <Editable tagName="p" multiline className="text-lg text-slate-600 leading-relaxed font-light w-full" isEditing={isEditing} value={data.userProfile.bio} onChange={(v: string) => onUpdateField('bio', v)} />
                    {isEditing && (
                        <button onClick={onRegenerateBio} className="absolute -right-12 top-0 p-2 bg-white text-indigo-600 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all opacity-0 group-hover:opacity-100">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </button>
                    )}
                </div>
            </header>
            <div className="relative z-10">
                {Object.entries(groupedProjects).map(([section, projects]) => (
                    (projects.length > 0 || isEditing) && (
                        <section key={section} className="mb-12">
                            <EditableSectionHeader titleKey={`section_${section}`} defaultTitle={section} defaultSub="Portfolio Section" customText={customText} onUpdateText={onUpdateText} isEditing={isEditing} onRename={onRenameSection} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {projects.map(p => <div key={p.id} className="transform hover:-translate-y-2 transition-transform duration-500"><ProjectCard project={p} sections={data.sections} {...cardProps} onRegenerate={onRegenerateProject} /></div>)}
                                {isEditing && (
                                    <button onClick={() => onUpload?.(section)} className="aspect-[4/3] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-indigo-300 hover:text-indigo-400 hover:bg-indigo-50/30 transition-all group">
                                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Add to {section}</span>
                                    </button>
                                )}
                            </div>
                        </section>
                    )
                ))}
                {data.projects.length === 0 && !isEditing && <EmptyState isEditing={isEditing} onUpload={onUpload!} />} 
            </div>
            </div>
        </div> 
    ); 
};
export const ProfessionalTemplate: React.FC<TemplateProps> = ({ data, isEditing, onUpdateField, cardProps, onRegenerateProject, onRegenerateBio, profilePhotoInputRef, customText, onUpdateText, onUpload, onRenameSection, onDeletePhoto }) => { 
    const groupedProjects = getGroupedProjects(data.projects, data.sections); 
    const primaryColor = (COLORS as any)[data.theme.color] || data.theme.color;
    const secondaryColor = (COLORS as any)[data.theme.secondaryColor || 'blue'] || data.theme.secondaryColor || '#3b82f6';

    return ( 
        <div className="bg-[#0f172a] flex-grow shrink-0 flex flex-col text-white font-['Plus_Jakarta_Sans'] relative overflow-hidden w-full"> 
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none animate-pulse"></div> 
            <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-blob" style={{ backgroundColor: primaryColor }}></div>
            <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-blob animation-delay-4000" style={{ backgroundColor: secondaryColor }}></div>
            <div className="max-w-7xl mx-auto px-10 py-4 relative z-10"> 
                <header className="flex flex-col lg:flex-row items-center gap-8 mb-6 relative"> 
                    <div className="flex-1"> 
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--theme-primary-color)]/10 border border-[var(--theme-primary-color)]/30 text-[var(--theme-primary-color)] mb-4 hover:bg-[var(--theme-primary-color)]/20 transition-colors cursor-default"> 
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary-color)] animate-ping"></div> 
                            <Editable tagName="span" className="text-[9px] font-black uppercase tracking-[0.2em]" isEditing={isEditing} value={customText.availabilityStatus || "Available for work"} onChange={(v: string) => onUpdateText('availabilityStatus', v)} /> 
                        </div> 
                        <h1 className="text-5xl md:text-6xl font-extrabold mb-4 leading-tight tracking-tight bg-clip-text text-transparent animate-gradient-x" style={{ backgroundImage: `linear-gradient(to right, white, ${primaryColor}, ${secondaryColor})` }}><Editable tagName="span" isEditing={isEditing} value={data.jobPackage.resume?.fullName || "Your Name"} onChange={(v: string) => onUpdateField('fullName', v)} /></h1> 
                        <div className="flex items-center gap-4 mb-6 w-full max-w-xl">
                            <div className="w-12 h-1 bg-gradient-to-r from-[var(--theme-primary-color)] to-transparent flex-shrink-0"></div>
                            <h2 className="text-2xl text-slate-300 font-bold flex-grow"><Editable tagName="span" className="w-full" isEditing={isEditing} value={data.userProfile.role} onChange={(v: string) => onUpdateField('role', v)} /></h2>
                        </div> 
                        <div className="relative group w-full max-w-xl"> 
                            <Editable tagName="p" multiline className="text-slate-400 text-lg w-full leading-relaxed" isEditing={isEditing} value={data.userProfile.bio} onChange={(v: string) => onUpdateField('bio', v)} /> 
                            {isEditing && <button onClick={onRegenerateBio} className="absolute -left-12 top-0 p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>} 
                        </div> 
                    </div> 
                    <div className="flex flex-col gap-6"> 
                        <div className="relative group"> 
                            <div className="w-64 h-64 rounded-[2.5rem] bg-slate-800 rotate-2 hover:rotate-0 border-8 border-white/5 shadow-2xl hover:shadow-[0_0_60px_rgba(var(--theme-primary-color-rgb),0.4)] overflow-hidden relative cursor-pointer transition-all duration-500" onClick={() => isEditing && profilePhotoInputRef.current?.click()}> 
                                {data.userProfile.photo ? <img src={`data:image/jpeg;base64,${data.userProfile.photo}`} className="w-full h-full object-cover transition-all grayscale group-hover:grayscale-0 scale-105 group-hover:scale-100 duration-700" /> : <div className="w-full h-full bg-slate-700 flex items-center justify-center text-4xl">💼</div>} 
                                {isEditing && <div className="absolute inset-0 bg-black/70 flex items-center justify-center font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">Update Visual</div>} 
                            </div> 
                            {isEditing && data.userProfile.photo && <button onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(); }} className="absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-rose-600 shadow-xl" title="Remove Photo"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>} 
                        </div> 
                    </div> 
                </header> 
                {Object.entries(groupedProjects).map(([section, projects]) => (
                    (projects.length > 0 || isEditing) && (
                        <section key={section} className="mb-12">
                            <EditableSectionHeader titleKey={`section_${section}`} defaultTitle={section} defaultSub="Portfolio Section" colorClass="text-white" customText={customText} onUpdateText={onUpdateText} isEditing={isEditing} onRename={onRenameSection} />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {projects.map(p => <div key={p.id} className="transform hover:-translate-y-2 transition-transform duration-500"><ProjectCard project={p} sections={data.sections} {...cardProps} onRegenerate={onRegenerateProject} /></div>)}
                                {isEditing && (
                                    <button onClick={() => onUpload?.(section)} className="aspect-[4/3] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 hover:border-[var(--theme-primary-color)] hover:text-[var(--theme-primary-color)] hover:bg-white/5 transition-all group">
                                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Add to {section}</span>
                                    </button>
                                )}
                            </div>
                        </section>
                    )
                ))}
            </div> 
        </div> 
    ); 
};
export const CreativeTemplate: React.FC<TemplateProps> = ({ data, isEditing, onUpdateField, cardProps, onRegenerateProject, onRegenerateBio, profilePhotoInputRef, customText, onUpdateText, onUpload, onRenameSection, onDeletePhoto }) => { 
    const groupedProjects = getGroupedProjects(data.projects, data.sections); 
    const primaryColor = (COLORS as any)[data.theme.color] || data.theme.color;
    const secondaryColor = (COLORS as any)[data.theme.secondaryColor || 'purple'] || data.theme.secondaryColor || '#581c87';

    return ( 
        <div className="flex-grow shrink-0 flex flex-col bg-white font-['Inter'] w-full overflow-hidden"> 
            {/* Bold Editorial Hero */}
            <div className="relative min-h-screen flex flex-col md:flex-row">
                {/* Left Panel: Massive Name */}
                <div className="md:w-1/2 bg-black text-white p-8 md:p-16 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" style={{ background: `radial-gradient(circle at 0% 0%, ${primaryColor}, transparent 70%)` }}></div>
                    <div className="relative z-10">
                        <div className="text-[10px] font-black uppercase tracking-[0.5em] mb-8 opacity-50">Creative Portfolio</div>
                    </div>
                    <div className="relative z-10">
                        <h1 className="text-[15vw] md:text-[12vw] font-black leading-[0.85] tracking-tighter uppercase break-words">
                            <Editable tagName="span" isEditing={isEditing} value={(data.jobPackage.resume?.fullName || "NAME").split(' ')[0]} onChange={(v: string) => onUpdateField('fullName', v)} />
                            <br />
                            <span style={{ color: primaryColor }}>
                                <Editable tagName="span" isEditing={isEditing} value={(data.jobPackage.resume?.fullName || "NAME").split(' ').slice(1).join(' ')} onChange={(v: string) => onUpdateField('fullName', v)} />
                            </span>
                        </h1>
                    </div>
                    <div className="relative z-10 mt-12 flex gap-4">
                        <div className="w-12 h-px bg-white/30 self-center"></div>
                        <div className="text-xs font-bold uppercase tracking-widest opacity-70">
                            <Editable tagName="span" isEditing={isEditing} value={data.userProfile.role} onChange={(v: string) => onUpdateField('role', v)} />
                        </div>
                    </div>
                </div>

                {/* Right Panel: Photo & Bio */}
                <div className="md:w-1/2 p-8 md:p-16 flex flex-col justify-center relative bg-slate-50">
                    <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none" style={{ background: `radial-gradient(circle at 100% 100%, ${secondaryColor}, transparent 70%)` }}></div>
                    
                    <div className="relative mb-12 group w-fit mx-auto md:mx-0">
                        <div className="w-48 h-64 md:w-64 md:h-80 bg-slate-200 overflow-hidden relative cursor-pointer shadow-2xl grayscale hover:grayscale-0 transition-all duration-700" onClick={() => isEditing && profilePhotoInputRef.current?.click()}>
                            {data.userProfile.photo ? <img src={`data:image/jpeg;base64,${data.userProfile.photo}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-6xl">👤</div>}
                            {isEditing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">Change Photo</div>}
                        </div>
                        {isEditing && data.userProfile.photo && (
                            <button onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(); }} className="absolute -top-4 -right-4 bg-black text-white rounded-full p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-rose-600 shadow-xl">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>

                    <div className="relative group max-w-lg">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: primaryColor }}>About Me</div>
                        <Editable tagName="p" multiline className="text-xl md:text-2xl font-medium text-slate-900 leading-relaxed" isEditing={isEditing} value={data.userProfile.bio} onChange={(v: string) => onUpdateField('bio', v)} />
                        {isEditing && <button onClick={onRegenerateBio} className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-black transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            Regenerate Bio
                        </button>}
                    </div>
                </div>
            </div>

            {/* Projects Section: Dynamic Grid */}
            <div className="p-8 md:p-20 bg-white">
                {Object.entries(groupedProjects).map(([section, projects], idx) => (
                    (projects.length > 0 || isEditing) && (
                        <div key={section} className="mb-32">
                            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
                                <div className="max-w-xl">
                                    <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4">
                                        <Editable tagName="span" value={section} isEditing={isEditing} onChange={(v: string) => onRenameSection?.(section, v)} />
                                    </h2>
                                    <div className="w-24 h-2 bg-black"></div>
                                </div>
                                {idx === 0 && <div className="text-xs font-bold uppercase tracking-[0.4em] opacity-40">Scroll to explore</div>}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
                                {projects.map((p, i) => (
                                    <div key={p.id} className={`group relative ${i % 2 === 1 ? 'md:mt-32' : ''}`}>
                                        <div className="absolute -top-12 -left-4 text-[8rem] font-black opacity-[0.03] pointer-events-none select-none">{i < 9 ? `0${i + 1}` : i + 1}</div>
                                        <div className="relative z-10 transform group-hover:scale-[1.02] transition-all duration-500">
                                            <ProjectCard project={p} sections={data.sections} {...cardProps} onRegenerate={onRegenerateProject} />
                                        </div>
                                    </div>
                                ))}
                                {isEditing && (
                                    <button onClick={() => onUpload?.(section)} className="aspect-[4/3] border-4 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-black hover:text-black hover:bg-slate-50 transition-all group">
                                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest">Add to {section}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                ))}
            </div>

            {/* Footer */}
            <footer className="bg-black text-white p-16 md:p-32 flex flex-col items-center text-center">
                <h3 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-12">Let's build<br/>something great.</h3>
                <div className="flex gap-8 text-[10px] font-black uppercase tracking-[0.5em] opacity-50">
                    <span>{data.userProfile.country || 'Global'}</span>
                    <span>•</span>
                    <span>{new Date().getFullYear()}</span>
                </div>
            </footer>
        </div> 
    ); 
};
export const RetroTemplate: React.FC<TemplateProps> = ({ data, isEditing, onUpdateField, cardProps, onRegenerateProject, onRegenerateBio, profilePhotoInputRef, customText, onUpdateText, onUpload, onRenameSection, onDeletePhoto }) => { 
    const groupedProjects = getGroupedProjects(data.projects, data.sections); 
    return ( 
        <div className="bg-[#008080] flex-grow shrink-0 flex flex-col font-['Tahoma',_sans-serif] text-black p-2 md:p-4 relative overflow-hidden text-sm w-full"> 
            <style>{`
                .win95-outset {
                    background: #c0c0c0;
                    border-top: 2px solid #fff;
                    border-left: 2px solid #fff;
                    border-right: 2px solid #000;
                    border-bottom: 2px solid #000;
                    box-shadow: inset -1px -1px #808080, inset 1px 1px #dfdfdf;
                }
                .win95-inset {
                    background: #fff;
                    border-top: 2px solid #808080;
                    border-left: 2px solid #808080;
                    border-right: 2px solid #fff;
                    border-bottom: 2px solid #fff;
                    box-shadow: inset 1px 1px #000;
                }
                .win95-btn {
                    background: #c0c0c0;
                    border-top: 2px solid #fff;
                    border-left: 2px solid #fff;
                    border-right: 2px solid #000;
                    border-bottom: 2px solid #000;
                    box-shadow: inset -1px -1px #808080, inset 1px 1px #dfdfdf;
                    cursor: pointer;
                }
                .win95-btn:active {
                    border-top: 2px solid #000;
                    border-left: 2px solid #000;
                    border-right: 2px solid #fff;
                    border-bottom: 2px solid #fff;
                    box-shadow: inset 1px 1px #808080, inset -1px -1px #dfdfdf;
                }
                .win95-title {
                    background: linear-gradient(90deg, #000080, #1084d0);
                }
            `}</style>
            <div className="max-w-5xl mx-auto w-full relative z-10 win95-outset p-1 flex flex-col"> 
                <div className="win95-title text-white px-2 py-1 flex justify-between items-center font-bold mb-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs">📁</span>
                        <Editable tagName="span" value={customText.retroBrand || "PORTFOLIO.EXE"} isEditing={isEditing} onChange={(v: string) => onUpdateText('retroBrand', v)} />
                    </div>
                    <div className="flex gap-1">
                        <button className="win95-btn w-4 h-4 flex items-center justify-center text-[10px] font-black pb-1">_</button>
                        <button className="win95-btn w-4 h-4 flex items-center justify-center text-[10px] font-black">□</button>
                        <button className="win95-btn w-4 h-4 flex items-center justify-center text-[10px] font-black">X</button>
                    </div>
                </div>
                <div className="flex gap-4 px-2 py-1 mb-2 text-xs border-b border-gray-400 shadow-[0_1px_0_white]">
                    <span className="underline decoration-black underline-offset-2 cursor-pointer">F</span>ile
                    <span className="underline decoration-black underline-offset-2 cursor-pointer">E</span>dit
                    <span className="underline decoration-black underline-offset-2 cursor-pointer">V</span>iew
                    <span className="underline decoration-black underline-offset-2 cursor-pointer">H</span>elp
                </div>
                
                <div className="p-2 md:p-4 flex-grow flex flex-col gap-4">
                    {/* Hero Section */}
                    <div className="flex flex-col md:flex-row gap-2">
                        <div className="win95-outset p-1 shrink-0 h-fit w-full md:w-auto">
                            <div className="win95-title text-white px-2 py-0.5 text-xs font-bold mb-1">PROFILE.BMP</div>
                            <div className="win95-inset p-1 w-full md:w-32 aspect-square relative group cursor-pointer" onClick={() => isEditing && profilePhotoInputRef.current?.click()}>
                                {data.userProfile.photo ? <img src={`data:image/jpeg;base64,${data.userProfile.photo}`} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} /> : <div className="w-full h-full flex items-center justify-center text-2xl bg-[#008080] text-white">?</div>}
                                {isEditing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-[10px]">Change</div>}
                                {isEditing && data.userProfile.photo && <button onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(); }} className="absolute -top-2 -right-2 win95-btn w-5 h-5 flex items-center justify-center text-red-600 font-bold" title="Remove Photo">X</button>}
                            </div>
                        </div>
                        
                        <div className="win95-inset p-3 flex-grow bg-white">
                            <h1 className="text-2xl md:text-3xl font-bold mb-1 text-black tracking-tight"><Editable tagName="span" isEditing={isEditing} value={data.jobPackage.resume?.fullName || "Your Name"} onChange={(v: string) => onUpdateField('fullName', v)} /></h1>
                            <div className="text-sm font-bold text-[#000080] mb-2 w-full"><Editable tagName="span" className="w-full" isEditing={isEditing} value={data.userProfile.role} onChange={(v: string) => onUpdateField('role', v)} /></div>
                            <div className="relative group w-full">
                                <Editable tagName="p" multiline className="text-xs leading-relaxed text-black w-full" isEditing={isEditing} value={data.userProfile.bio} onChange={(v: string) => onUpdateField('bio', v)} />
                                {isEditing && <button onClick={onRegenerateBio} className="absolute -right-1 -top-1 win95-btn px-1 py-0.5 text-[10px]" title="Regenerate">AI</button>}
                            </div>
                        </div>
                    </div>

                    {/* Projects Section */}
                    <div className="win95-outset p-1 flex-grow">
                        <div className="win95-title text-white px-2 py-0.5 text-xs font-bold mb-1">C:\PROJECTS\</div>
                        <div className="win95-inset p-4 bg-white h-full min-h-[300px]">
                            {Object.entries(groupedProjects).map(([section, projects]) => (
                                (projects.length > 0 || isEditing) && (
                                    <div key={section} className="mb-8">
                                        <div className="font-bold text-lg mb-4 flex items-center gap-2">
                                            <span className="text-xl">📁</span>
                                            <Editable tagName="span" value={section} isEditing={isEditing} onChange={(v: string) => onRenameSection?.(section, v)} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {projects.map(p => <div key={p.id} className="win95-outset p-1"><ProjectCard project={p} sections={data.sections} {...cardProps} onRegenerate={onRegenerateProject} /></div>)}
                                            {isEditing && (
                                                <button onClick={() => onUpload?.(section)} className="win95-inset p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-colors group">
                                                    <div className="text-2xl">➕</div>
                                                    <span className="text-[10px] font-bold">ADD_TO_{section.toUpperCase().replace(/\s+/g, '_')}.EXE</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* Status Bar */}
                <div className="flex gap-1 mt-1 px-1 pb-1">
                    <div className="win95-inset px-2 py-1 flex-grow text-xs text-gray-600">Ready</div>
                    <div className="win95-inset px-2 py-1 w-32 text-xs text-center text-gray-600"><Editable tagName="span" isEditing={isEditing} value={data.userProfile.country || 'Global'} onChange={(v: string) => onUpdateField('country', v)} /></div>
                </div>
            </div> 
        </div> 
    ); 
};
export const StudioTemplate: React.FC<TemplateProps> = ({ data, isEditing, onUpdateField, cardProps, onRegenerateProject, onRegenerateBio, profilePhotoInputRef, customText, onUpdateText, onUpload, onRenameSection, onDeletePhoto }) => { 
    const groupedProjects = getGroupedProjects(data.projects, data.sections); 
    const primaryColor = (COLORS as any)[data.theme.color] || data.theme.color;
    const secondaryColor = (COLORS as any)[data.theme.secondaryColor || 'slate'] || data.theme.secondaryColor || '#64748b';

    return ( 
        <div className="bg-white flex-grow shrink-0 font-['Inter'] text-black p-6 relative overflow-hidden flex flex-col"> 
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none mix-blend-multiply"></div> 
            <div className="max-w-7xl mx-auto w-full relative z-10 flex-grow flex flex-col"> 
                <div className="grid grid-cols-12 gap-px bg-black border border-black shadow-2xl hover:shadow-3xl transition-shadow duration-500 flex-grow"> 
                    <div className="col-span-12 md:col-span-8 bg-white p-6 md:p-8 relative overflow-hidden group flex flex-col justify-center min-h-[30vh] md:min-h-0"> 
                        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-32 -mt-32 transition-transform duration-1000 group-hover:scale-150" style={{ backgroundColor: `${primaryColor}10` }}></div> 
                        <h1 className="text-6xl lg:text-8xl font-black tracking-tighter uppercase leading-[0.8] mb-10 relative z-10 transition-colors duration-300 hover:text-[var(--theme-primary-color)]"><Editable tagName="span" isEditing={isEditing} value={(data.jobPackage.resume?.fullName || "Name").split(' ')[0]} onChange={(v: string) => onUpdateField('fullName', v)} /></h1> 
                        <div className="grid grid-cols-2 gap-10 relative z-10"> 
                            <div> 
                                <h4 className="text-[10px] font-black uppercase mb-3 tracking-widest" style={{ color: primaryColor }}><Editable tagName="span" value={customText.manifestoTitle || "Manifesto"} isEditing={isEditing} onChange={(v: string) => onUpdateText('manifestoTitle', v)} /></h4> 
                                <div className="relative group/bio w-full"> 
                                    <Editable tagName="p" multiline className="text-sm font-bold uppercase tracking-widest leading-relaxed text-slate-800 hover:text-black transition-colors w-full" isEditing={isEditing} value={data.userProfile.bio} onChange={(v: string) => onUpdateField('bio', v)} /> 
                                    {isEditing && <button onClick={onRegenerateBio} className="absolute -left-10 top-0 p-2 bg-indigo-50 text-indigo-600 rounded-lg opacity-0 group-hover/bio:opacity-100 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>} 
                                </div> 
                            </div> 
                            <div className="text-[10px] font-black uppercase space-y-3 border-l-2 border-black pl-6 w-full"> 
                                <div className="flex gap-2 items-center hover:translate-x-2 transition-transform w-full"><span className="opacity-50 tracking-widest">Location:</span><Editable tagName="span" className="w-full" isEditing={isEditing} value={data.userProfile.country || 'Global'} onChange={(v: string) => onUpdateField('country', v)} /></div> 
                                <div className="flex gap-2 items-center hover:translate-x-2 transition-transform w-full"><span className="opacity-50 tracking-widest">Role:</span><Editable tagName="span" className="w-full" style={{ color: primaryColor }} isEditing={isEditing} value={data.userProfile.role} onChange={(v: string) => onUpdateField('role', v)} /></div> 
                            </div> 
                        </div> 
                    </div> 
                    <div className="col-span-12 md:col-span-4 flex items-center justify-center relative group overflow-hidden min-h-[30vh] md:min-h-0" style={{ backgroundColor: primaryColor }}> 
                        <div className="absolute inset-0 bg-black/10 transform -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-700 ease-out"></div> 
                        <div className="w-full h-full p-8 flex items-center justify-center cursor-pointer relative z-10" onClick={() => isEditing && profilePhotoInputRef.current?.click()}> 
                            {data.userProfile.photo ? <img src={`data:image/jpeg;base64,${data.userProfile.photo}`} className="w-full h-full object-cover mix-blend-multiply grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-500" /> : <div className="text-8xl font-black text-white/30 tracking-tighter rotate-90 group-hover:rotate-0 transition-transform duration-500">GALLERY</div>} 
                            {isEditing && <div className="absolute inset-0 bg-black/20 flex items-center justify-center text-white font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">Change</div>} 
                        </div> 
                        {isEditing && data.userProfile.photo && <button onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(); }} className="absolute top-4 right-4 bg-rose-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-rose-600 shadow-xl" title="Remove Photo"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>} 
                    </div> 
                    {Object.entries(groupedProjects).map(([section, projects]) => (
                        (projects.length > 0 || isEditing) && (
                            <React.Fragment key={section}>
                                <div className="col-span-12 bg-black text-white px-6 py-2 text-[10px] font-black uppercase tracking-[0.3em] flex justify-between items-center">
                                    <Editable tagName="span" value={section} isEditing={isEditing} onChange={(v: string) => onRenameSection?.(section, v)} />
                                    {isEditing && (
                                        <button onClick={() => onUpload?.(section)} className="hover:text-[var(--theme-primary-color)] transition-colors flex items-center gap-2">
                                            <Plus className="w-3 h-3" />
                                            <span>Add to {section}</span>
                                        </button>
                                    )}
                                </div>
                                {projects.map(p => (
                                    <div key={p.id} className="col-span-12 md:col-span-4 bg-white p-px hover:bg-slate-50 transition-colors duration-300 group/card relative overflow-hidden hover:scale-[1.02] transform">
                                        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                                        <ProjectCard project={p} sections={data.sections} {...cardProps} onRegenerate={onRegenerateProject} />
                                    </div>
                                ))}
                            </React.Fragment>
                        )
                    ))}
                    {isEditing && data.projects.length === 0 && (
                        <div className="col-span-12 bg-white p-px flex items-center justify-center">
                            <button onClick={() => onUpload?.()} className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-400 hover:bg-slate-50 transition-all group">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest">Add Project</span>
                            </button>
                        </div>
                    )}
                </div> 
            </div> 
        </div> 
    ); 
};
export const PopTemplate: React.FC<TemplateProps> = ({ data, isEditing, onUpdateField, cardProps, onRegenerateProject, onRegenerateBio, profilePhotoInputRef, customText, onUpdateText, onUpload, onRenameSection, onDeletePhoto }) => { 
    const groupedProjects = getGroupedProjects(data.projects, data.sections); 
    const primaryColor = (COLORS as any)[data.theme.color] || data.theme.color;
    const secondaryColor = (COLORS as any)[data.theme.secondaryColor || 'black'] || data.theme.secondaryColor || '#000000';

    return ( 
        <div className="flex-grow shrink-0 flex flex-col w-full p-4 md:p-8 font-['Plus_Jakarta_Sans'] relative overflow-hidden" style={{ backgroundColor: primaryColor }}> 
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: `radial-gradient(${secondaryColor} 2px, transparent 2px)`, backgroundSize: '30px 30px' }}></div> 
            <div className="max-w-7xl mx-auto w-full relative z-10 flex-grow flex flex-col"> 
                <div className="bg-white border-[10px] border-black rounded-[4rem] p-6 md:p-8 shadow-[30px_30px_0_rgba(0,0,0,1)] relative overflow-hidden transition-transform hover:-translate-y-2 hover:shadow-[40px_40px_0_rgba(0,0,0,1)] duration-500 flex-grow flex flex-col"> 
                    <header className="mb-12 text-center"> 
                        <div className="relative group inline-block mb-10"> 
                            <div className="w-40 h-40 rounded-full bg-slate-100 border-8 border-black shadow-[8px_8px_0_rgba(0,0,0,1)] overflow-hidden relative cursor-pointer mx-auto transform hover:scale-110 hover:rotate-12 transition-all duration-500" onClick={() => isEditing && profilePhotoInputRef.current?.click()}> 
                                {data.userProfile.photo ? <img src={`data:image/jpeg;base64,${data.userProfile.photo}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-5xl">😎</div>} 
                                {isEditing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Change</div>} 
                            </div> 
                            {isEditing && data.userProfile.photo && (
                                <button onClick={(e) => { e.stopPropagation(); onDeletePhoto?.(); }} className="absolute 0 right-0 bg-rose-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-rose-600 shadow-xl border-2 border-black hover:scale-110" title="Remove Photo">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )} 
                        </div> 
                        <h1 className="text-7xl lg:text-9xl font-black uppercase tracking-tighter mb-6 transform -rotate-2 drop-shadow-[4px_4px_0_rgba(0,0,0,1)] text-white hover:rotate-2 hover:scale-105 transition-all duration-300" style={{ WebkitTextStroke: '3px black' }}>
                            <Editable tagName="span" isEditing={isEditing} value={(data.jobPackage.resume?.fullName || "Name").split(' ')[0]} onChange={(v: string) => onUpdateField('fullName', v)} />
                        </h1> 
                        <div className="inline-block bg-[var(--theme-primary-color)] text-white px-10 py-4 rounded-full border-[6px] border-black text-3xl font-black uppercase mb-10 shadow-[8px_8px_0_rgba(0,0,0,1)] hover:-translate-y-2 hover:shadow-[16px_16px_0_rgba(0,0,0,1)] transition-all duration-300">
                            <Editable tagName="span" className="w-full" isEditing={isEditing} value={data.userProfile.role} onChange={(v: string) => onUpdateField('role', v)} />
                        </div> 
                        <div className="relative group w-full"> 
                            <Editable tagName="p" multiline className="text-4xl font-extrabold leading-tight max-w-4xl text-slate-900 mx-auto hover:text-black transition-colors w-full" isEditing={isEditing} value={data.userProfile.bio} onChange={(v: string) => onUpdateField('bio', v)} /> 
                            {isEditing && (
                                <button onClick={onRegenerateBio} className="absolute -right-4 top-0 p-3 bg-indigo-600 text-white rounded-2xl border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,1)] hover:translate-y-1 transition-all opacity-0 group-hover:opacity-100">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </button>
                            )} 
                        </div> 
                    </header> 
                    {Object.entries(groupedProjects).map(([section, projects]) => (
                        (projects.length > 0 || isEditing) && (
                            <div key={section} className="mb-24">
                                <div className="text-3xl font-black uppercase border-b-4 border-black inline-block mb-10 transform -rotate-2 bg-rose-400 text-white px-4 py-1 shadow-[4px_4px_0_rgba(0,0,0,1)] hover:rotate-2 hover:scale-105 transition-all duration-300">
                                    <Editable tagName="span" value={section} isEditing={isEditing} onChange={(v: string) => onRenameSection?.(section, v)} className="bg-rose-400 text-white" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                                    {projects.map(p => <div key={p.id} className="transform hover:-translate-y-6 hover:rotate-2 hover:scale-105 transition-all duration-300"><ProjectCard project={p} sections={data.sections} {...cardProps} onRegenerate={onRegenerateProject} /></div>)}
                                    {isEditing && (
                                        <button onClick={() => onUpload?.(section)} className="aspect-[4/3] bg-white border-4 border-dashed border-black rounded-[2rem] flex flex-col items-center justify-center gap-4 text-black hover:bg-yellow-400 transition-all shadow-[8px_8px_0_rgba(0,0,0,0.1)] hover:shadow-[8px_8px_0_rgba(0,0,0,1)] group">
                                            <div className="w-16 h-16 rounded-full border-4 border-black flex items-center justify-center group-hover:bg-white transition-colors">
                                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                            </div>
                                            <span className="text-lg font-black uppercase tracking-widest">Add to {section}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    ))}
                </div> 
            </div> 
        </div> 
    ); 
};

const ProjectViewerModal = ({ project, onClose, onDelete, lang = 'en' }: { project: Project, onClose: () => void, onDelete?: (id: string) => void, lang?: Language }) => { 
    const [aiSummary, setAiSummary] = useState<{ summary: string; keyPoints: string[] } | null>(null); 
    const [analyzing, setAnalyzing] = useState(false); 
    const triggerAnalysis = () => { 
        setAnalyzing(true); 
        generateDocumentSummary(project.base64Data, project.originalMimeType, lang as Language).then(res => { setAiSummary(res); setAnalyzing(false); }); 
    }; 
    useEffect(() => { 
        const isDoc = project.type === 'Document' || project.originalMimeType.includes('pdf') || project.originalMimeType.includes('text') || project.originalMimeType === 'text/plain'; 
        if (isDoc && !aiSummary && !analyzing) { 
            if (project.description && project.description.length > 20 && project.associatedSkills && project.associatedSkills.length > 0) { setAiSummary({ summary: project.description, keyPoints: project.associatedSkills }); }
            else { triggerAnalysis(); }
        } 
    }, [project, lang]); 
    const isVisual = project.originalMimeType.startsWith('image/'); 
    const isVideo = project.originalMimeType.startsWith('video/'); 
    const isAudio = project.originalMimeType.startsWith('audio/'); 
    return (
        <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-2 md:p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white w-full max-w-5xl h-[90vh] md:h-[80vh] rounded-[1.5rem] overflow-hidden flex flex-col md:flex-row shadow-2xl relative border border-white/50" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 z-50 w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all font-bold shadow-sm">✕</button>
                <div className="md:w-5/12 bg-slate-50 flex flex-col items-center justify-center p-6 md:p-10 relative border-r border-slate-100">
                    {isVisual ? (
                        <img src={`data:${project.originalMimeType};base64,${project.base64Data}`} className="max-h-full max-w-full object-contain relative z-10 shadow-lg rounded-lg" referrerPolicy="no-referrer" />
                    ) : isVideo ? (
                        <video src={`data:${project.originalMimeType};base64,${project.base64Data}`} className="max-h-full max-w-full object-contain relative z-10 shadow-lg rounded-lg" controls autoPlay />
                    ) : isAudio ? (
                        <div className="flex flex-col items-center justify-center w-full max-w-xs p-8 bg-white rounded-[1.5rem] shadow-xl border border-slate-100 relative z-10">
                            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4 text-white text-2xl shadow-lg">▶</div>
                            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="w-1/3 h-full bg-slate-900 rounded-full"></div>
                            </div>
                            <div className="flex justify-between w-full mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                <span>0:00</span>
                                <span>Audio Content</span>
                            </div>
                        </div>
                    ) : (
                        <div className="aspect-[3/4] h-2/3 bg-white rounded-lg shadow-xl flex flex-col items-center justify-center p-6 border border-slate-100 relative group z-10">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-900 text-base text-center leading-tight mb-2 max-w-[150px] truncate">{project.originalFileName}</h3>
                        </div>
                    )}
                    <div className="mt-6 flex gap-2">
                        <a href={`data:${project.originalMimeType};base64,${project.base64Data}`} download={project.originalFileName} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2">Download</a>
                        {project.externalLink && (
                            <a href={project.externalLink} target="_blank" rel="noreferrer" className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-lg flex items-center gap-2">Open Link</a>
                        )}
                    </div>
                </div>
                <div className="md:w-7/12 p-8 md:p-10 bg-white flex flex-col relative z-20 h-full">
                    <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-100 rounded-md text-slate-500 text-[8px] font-black uppercase tracking-[0.2em] mb-6">{project.category || 'Portfolio Item'}</div>
                        <h2 className="text-3xl lg:text-4xl font-black text-slate-900 mb-6 leading-[1.1] tracking-tight">{project.title}</h2>
                        {analyzing ? (
                            <div className="animate-pulse space-y-3">
                                <div className="h-3 bg-slate-100 rounded w-full"></div>
                                <div className="h-3 bg-slate-100 rounded w-full"></div>
                                <div className="h-3 bg-slate-100 rounded w-2/3"></div>
                                <span className="text-[10px] font-bold text-indigo-600 mt-2 block animate-bounce uppercase tracking-widest">AI Analysing...</span>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div>
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-1.5">Description</h4>
                                    <div className="prose prose-slate prose-sm max-w-none">
                                        <p className="text-sm lg:text-base font-medium text-slate-600 leading-relaxed">{aiSummary?.summary || project.description}</p>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-1.5">Key Competencies</h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(aiSummary?.keyPoints || project.associatedSkills || []).map((kp, i) => (
                                            <span key={i} className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-bold text-slate-700">{kp}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="mt-8 pt-5 border-t border-slate-100 flex gap-3">
                        {onDelete && (
                            <button onClick={() => { onDelete(project.id); onClose(); }} className="px-6 py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center gap-2" >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete
                            </button>
                        )}
                        <button onClick={onClose} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg">Close Viewer</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ImportWebsiteModal = ({ 
    isOpen, 
    onClose, 
    onImport, 
    lang = 'en',
    t
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onImport: (projects: any[]) => void; 
    lang?: Language;
    t: any;
}) => {
    const [url, setUrl] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [scannedProjects, setScannedProjects] = useState<any[]>([]);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleScan = async () => {
        if (!url) return;
        setIsScanning(true);
        setError('');
        try {
            let proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            let response = await fetch(proxyUrl).catch(() => null);
            
            if (!response || !response.ok) {
                console.warn('Fallback proxy due to fetch failure');
                proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                response = await fetch(proxyUrl);
            }
            
            const contentType = response.headers.get('content-type');
            let data: any = {};
            if (contentType && contentType.includes('application/json')) {
               data = await response.json();
            } else {
               data.contents = await response.text();
            }
            
            if (data.contents) {
                const result = await analyzeWebsiteContent(data.contents, lang as Language);
                if (result.projects && result.projects.length > 0) {
                    const newProjects = result.projects.map((p: any) => ({
                        id: `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        title: p.title,
                        category: p.category,
                        description: p.description,
                        associatedSkills: p.associatedSkills,
                        externalLink: p.externalLink || url,
                        base64Data: '', 
                        originalMimeType: 'text/html',
                        originalFileName: 'Website Import',
                        type: 'Link',
                        socialPlatform: 'WEBSITE'
                    }));
                    setScannedProjects(newProjects);
                } else {
                    setError('No projects found on this website.');
                }
            } else {
                setError('Failed to fetch website content.');
            }
        } catch (err) {
            setError('An error occurred while scanning the website.');
            console.error(err);
        } finally {
            setIsScanning(false);
        }
    };

    const handleUpdateProject = (id: string, field: string, value: string) => {
        setScannedProjects(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleDeleteProject = (id: string) => {
        setScannedProjects(prev => prev.filter(p => p.id !== id));
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-fade-in" onClick={onClose}>
            <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">{t.importWebsite || "Import Website"}</h2>
                    <button onClick={onClose} className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 shadow-sm transition-all">✕</button>
                </div>
                
                <div className="p-6 md:p-8 flex-grow overflow-y-auto custom-scrollbar">
                    <div className="flex gap-3 mb-8">
                        <input 
                            type="url" 
                            value={url} 
                            onChange={(e) => setUrl(e.target.value)} 
                            placeholder="https://your-portfolio.com" 
                            className="flex-grow px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                        />
                        <button 
                            onClick={handleScan} 
                            disabled={isScanning || !url}
                            className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isScanning || !url ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'}`}
                        >
                            {isScanning ? 'Scanning...' : 'Scan'}
                        </button>
                    </div>

                    {error && <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium mb-6">{error}</div>}

                    {scannedProjects.length > 0 && (
                        <div className="space-y-6">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Extracted Projects ({scannedProjects.length})</h3>
                            {scannedProjects.map((project, index) => (
                                <div key={project.id} className="bg-white border border-slate-200 rounded-2xl p-5 relative group">
                                    <button onClick={() => handleDeleteProject(project.id)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                    <div className="space-y-4 pr-8">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Title</label>
                                            <input type="text" value={project.title} onChange={(e) => handleUpdateProject(project.id, 'title', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-300 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</label>
                                            <input type="text" value={project.category} onChange={(e) => handleUpdateProject(project.id, 'category', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium text-slate-600 focus:outline-none focus:border-indigo-300 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description</label>
                                            <textarea value={project.description} onChange={(e) => handleUpdateProject(project.id, 'description', e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-indigo-300 transition-colors custom-scrollbar" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Link</label>
                                            <input type="url" value={project.externalLink} onChange={(e) => handleUpdateProject(project.id, 'externalLink', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs text-indigo-600 focus:outline-none focus:border-indigo-300 transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200 transition-colors uppercase tracking-wider">Cancel</button>
                    <button 
                        onClick={() => { onImport(scannedProjects); onClose(); }} 
                        disabled={scannedProjects.length === 0}
                        className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${scannedProjects.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-black shadow-lg hover:shadow-xl'}`}
                    >
                        Import {scannedProjects.length} Projects
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * localStorage holds roughly 5MB. Portfolio projects carry base64 media that
 * runs to megabytes each, so the payload is stripped down to what a history
 * entry actually needs to display before it is persisted.
 */
const stripMediaForStorage = (data: PortfolioData): PortfolioData => ({
  ...data,
  projects: (data.projects || []).map(p => ({ ...p, base64Data: '' })),
  userProfile: { ...data.userProfile, photo: null },
});

const persistLocalHistory = (
  key: string,
  items: { id: string; timestamp: number; data: PortfolioData }[]
): void => {
  const slim = items.map(i => ({ ...i, data: stripMediaForStorage(i.data) }));
  // Drop the oldest entries until it fits rather than throwing QuotaExceeded.
  for (let keep = Math.min(slim.length, 20); keep >= 1; keep--) {
    try {
      localStorage.setItem(key, JSON.stringify(slim.slice(0, keep)));
      return;
    } catch (e) {
      if (keep === 1) console.warn('Could not persist portfolio history: storage full.');
    }
  }
};

export const PortfolioGenerator: React.FC<PortfolioGeneratorProps> = ({ 
  portfolioData, 
  setPortfolioData, 
  onGenerateProject,
  isLoading,
  onCancelLoading,
  readOnly = false,
  lang = 'en',
  isLoggedIn = false,
  onLogin,
  onSaveHistory
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null); 
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const readingReader = useRef<FileReader | null>(null);
  
  const [activeTemplate, setActiveTemplate] = useState(portfolioData.theme.template || 'Professional'); 
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [targetSection, setTargetSection] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string | null>(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessUrl, setPublishSuccessUrl] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      // Scaling logic removed to support normal web page size
      const primaryHex = (COLORS as any)[portfolioData.theme.color] || portfolioData.theme.color;
      const secondaryHex = (COLORS as any)[portfolioData.theme.secondaryColor || 'purple'] || portfolioData.theme.secondaryColor || '#a855f7';
      
      document.documentElement.style.setProperty('--theme-primary-color', primaryHex);
      document.documentElement.style.setProperty('--theme-secondary-color', secondaryHex);
      
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '79, 70, 229';
      };
      
      if (primaryHex.startsWith('#')) {
        document.documentElement.style.setProperty('--theme-primary-color-rgb', hexToRgb(primaryHex));
      }
  }, [portfolioData.theme.color, portfolioData.theme.secondaryColor]);
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [aiGeneratingSingle, setAiGeneratingSingle] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<PortfolioData[]>([portfolioData]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Persistent History state
  const [savedPortfolios, setSavedPortfolios] = useState<{id: string, timestamp: number, data: PortfolioData}[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('portfolio_history_panel_open') === 'true';
    }
    return false;
  });

  useEffect(() => {
      localStorage.setItem('portfolio_history_panel_open', String(showHistoryPanel));
  }, [showHistoryPanel]);

  useEffect(() => {
    const saved = localStorage.getItem('portfolio_history_local');
    if (saved) {
      try { setSavedPortfolios(JSON.parse(saved)); } catch(e) {}
    }
  }, []);

  const saveToHistory = () => {
    const newItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      data: portfolioData
    };
    const updated = [newItem, ...savedPortfolios];
    setSavedPortfolios(updated);
    persistLocalHistory('portfolio_history_local', updated);
  };

  // Keep history in sync with external portfolioData changes if they happen outside
  useEffect(() => {
    if (history.length === 0 || history[historyIndex] !== portfolioData) {
        // If the current portfolioData is different from our history's current state,
        // it means it was updated externally (or initially).
        // Let's just reset history or append if we want to be safe.
        // For simplicity, we'll just append it if it's not the current one.
        if (historyIndex === history.length - 1) {
            setHistory(prev => [...prev, portfolioData]);
            setHistoryIndex(prev => prev + 1);
        } else {
            // If we are in the middle of history and an external change happens,
            // we branch off.
            const newHistory = history.slice(0, historyIndex + 1);
            setHistory([...newHistory, portfolioData]);
            setHistoryIndex(newHistory.length);
        }
    }
  }, [portfolioData]);

  const pushToHistory = useCallback((newData: PortfolioData) => {
      setHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          return [...newHistory, newData];
      });
      setHistoryIndex(prev => prev + 1);
      setPortfolioData(newData);
  }, [historyIndex, setPortfolioData]);

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setPortfolioData(history[newIndex]);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setPortfolioData(history[newIndex]);
      }
  };

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const isRtl = lang === 'ar';
  const isCJK = ['zh', 'ja', 'ko'].includes(lang || 'en');
  
  useEffect(() => { 
    if (portfolioData.theme.template) { 
        setActiveTemplate(portfolioData.theme.template); 
    } 
  }, [portfolioData.theme.template]);

  const handleUpdateText = (key: string, val: string) => { if (readOnly) return; setCustomText(prev => ({ ...prev, [key]: val })); };

  const handleAddSection = () => {
    if (readOnly) return;
    const currentSections = portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution'];
    
    // Generate a unique name to avoid using prompt which can be blocked in iframes
    let newName = "New Section";
    let counter = 1;
    while (currentSections.includes(newName)) {
      newName = `New Section ${counter}`;
      counter++;
    }

    setPortfolioData(prev => ({
      ...prev,
      sections: [...currentSections, newName]
    }));
  };

  const handleRenameSection = (oldName: string, newName: string) => {
    if (!newName || oldName === newName) return;
    const currentSections = portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution'];
    setPortfolioData(prev => ({
      ...prev,
      sections: currentSections.map(s => s === oldName ? newName : s),
      projects: prev.projects.map(p => {
        const currentSection = p.section || p.category || currentSections[0];
        return currentSection === oldName ? { ...p, section: newName } : p;
      })
    }));
  };
  const handleRemoveSection = (section: string) => {
    if (readOnly) return;
    const currentSections = portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution'];
    if (currentSections.length <= 1) return;

    const remainingSections = currentSections.filter(s => s !== section);
    const fallbackSection = remainingSections[0];
    
    setPortfolioData(prev => ({
      ...prev,
      sections: remainingSections,
      projects: prev.projects.map(p => {
        const currentSection = p.section || p.category || currentSections[0];
        return currentSection === section ? { ...p, section: fallbackSection } : p;
      })
    }));
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('Initializing...');

  useEffect(() => {
    let interval: any;
    if (isLoading || isProcessingQueue) {
      setUploadProgress(0);
      const messages = ["Analyzing Media Type...", "Generating Professional Description...", "AI Branding Design...", "Almost there..."];
      let msgIdx = 0; setProgressMsg(messages[0]);
      interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 98) return prev;
          const inc = Math.random() * 1 + 0.3; // Slower increment to match ~10-15s API time
          if (prev > 25 && msgIdx === 0) { msgIdx=1; setProgressMsg(messages[1]); }
          if (prev > 60 && msgIdx === 1) { msgIdx=2; setProgressMsg(messages[2]); }
          if (prev > 85 && msgIdx === 2) { msgIdx=3; setProgressMsg(messages[3]); }
          return Math.min(prev + inc, 98);
        });
      }, 100); 
    } else { setUploadProgress(0); }
    return () => clearInterval(interval);
  }, [isLoading, isProcessingQueue]);

  const themeColor = (COLORS as any)[portfolioData.theme.color] || portfolioData.theme.color || COLORS.indigo;
  useEffect(() => { document.documentElement.style.setProperty('--theme-primary-color', themeColor); }, [themeColor]);

  const handleClearAll = () => {
      const newData: PortfolioData = { userProfile: { country: 'AU', role: 'Student', photo: null, bio: '' }, theme: { color: 'indigo', template: 'Professional' }, projects: [], healthScore: 0, jobPackage: { resume: null, coverLetter: null }, };
      pushToHistory(newData);
      setIsEditing(false); if (onCancelLoading) onCancelLoading(); 
  };
  
  const handleRegenerateProject = async (projectId: string) => {
      const project = portfolioData.projects.find(p => p.id === projectId);
      if (!project) return;
      setAiGeneratingSingle(projectId);
      try {
          const newData = await analyzeProjectMedia(project.base64Data, project.originalMimeType, project.originalFileName, lang as Language);
          pushToHistory({ ...portfolioData, projects: portfolioData.projects.map(p => p.id === projectId ? { ...p, ...newData } : p) });
      } catch (e: any) { alert(e?.message || "AI generation failed."); } 
      finally { setAiGeneratingSingle(null); }
  };

  const handleRegenerateBio = async () => {
      setAiGeneratingSingle('bio');
      try {
          const bioResult = await generatePortfolioBio(portfolioData.projects, portfolioData.jobPackage.resume, lang as Language);
          pushToHistory({ ...portfolioData, userProfile: { ...portfolioData.userProfile, bio: bioResult.bio, role: bioResult.role } });
      } catch (e) { alert("Bio generation failed."); } 
      finally { setAiGeneratingSingle(null); }
  };

  const updateField = (field: string, val: string) => {
      if (readOnly) return;
      let newData = { ...portfolioData };
      if (field === 'fullName') {
          const currentResume = newData.jobPackage.resume || { fullName: '', contactInfo: '', linkedin: '', github: '', website: '', summary: '', technicalSkills: [], softSkills: [], experiences: [], volunteer: [], schoolProjects: [], education: [], references: [] };
          newData = { ...newData, jobPackage: { ...newData.jobPackage, resume: { ...currentResume, fullName: val } } };
      } else if (field === 'role' || field === 'bio' || field === 'country') {
          newData = { ...newData, userProfile: { ...newData.userProfile, [field]: val } };
      }
      pushToHistory(newData);
  };

  const handleUpdateProject = async (id: string, field: keyof Project, value: any) => {
      if (readOnly) return;
      pushToHistory({ ...portfolioData, projects: portfolioData.projects.map(p => p.id === id ? { ...p, [field]: value } : p) });
  };

  const handleDeleteProject = useCallback((id: string) => {
      console.log("PortfolioGenerator: handleDeleteProject called with id:", id);
      if (readOnly) {
          console.warn("PortfolioGenerator: Delete ignored because readOnly is true");
          return;
      }
      
      const beforeCount = portfolioData.projects.length;
      const filtered = portfolioData.projects.filter(p => String(p.id) !== String(id));
      console.log(`PortfolioGenerator: Filtered projects. Count: ${beforeCount} -> ${filtered.length}`);
      pushToHistory({ ...portfolioData, projects: filtered });
  }, [readOnly, portfolioData, pushToHistory, lang]);

  const handleDeletePhoto = useCallback(() => {
      if (readOnly) return;
      pushToHistory({
          ...portfolioData,
          userProfile: { ...portfolioData.userProfile, photo: null }
      });
  }, [readOnly, portfolioData, pushToHistory, lang]);

  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetProjectId) return;
    try {
        const base64 = await compressImage(file);
        handleUpdateProject(targetProjectId, 'base64Data', base64);
        handleUpdateProject(targetProjectId, 'originalMimeType', 'image/jpeg');
        setTargetProjectId(null);
    } catch (err) {
        console.error("Cover image update failed", err);
    } finally {
        e.target.value = '';
    }
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const base64 = await compressImage(file);
        pushToHistory({
            ...portfolioData,
            userProfile: { ...portfolioData.userProfile, photo: base64 }
        });
    } catch (err) {
        console.error("Profile photo update failed", err);
    } finally {
        e.target.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files; if (!files || files.length === 0) return;
      
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
      const fileList = Array.from(files) as File[];
      const validFiles = fileList.filter(f => {
          if (f.size > MAX_FILE_SIZE) {
              alert(`File ${f.name} is too large. Maximum size is 10MB.`);
              return false;
          }
          return true;
      });
      
      if (validFiles.length === 0) {
          e.target.value = '';
          return;
      }
      
      setIsReadingFile(true); 
      
      const processFile = async (file: File, index: number) => {
          try {
              let resultData = ""; let mimeType = file.type;
              let analysisData = ""; let analysisMimeType = "";
              
              if (file.name.toLowerCase().endsWith('.docx')) {
                  const arrayBuffer = await file.arrayBuffer(); const result = await mammoth.extractRawText({ arrayBuffer });
                  resultData = result.value; mimeType = 'text/plain';
              }
              else if (file.type.startsWith('image/')) {
                  resultData = await compressImage(file); mimeType = 'image/jpeg';
              } 
              else if (file.type.startsWith('video/')) {
                  // Extract a frame for BOTH analysis and storage to prevent OOM and payload too large errors
                  try {
                      const frameBase64 = await new Promise<string>((resolve, reject) => {
                          const video = document.createElement('video');
                          video.preload = 'metadata';
                          video.muted = true;
                          video.playsInline = true;
                          
                          const timeout = setTimeout(() => reject(new Error('Video frame extraction timed out')), 10000);
                          
                          video.onloadedmetadata = () => {
                              video.currentTime = Math.min(1, video.duration / 2);
                          };
                          video.onseeked = () => {
                              clearTimeout(timeout);
                              const canvas = document.createElement('canvas');
                              let width = video.videoWidth;
                              let height = video.videoHeight;
                              const MAX_DIMENSION = 1200;
                              if (width > height) {
                                  if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; }
                              } else {
                                  if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; }
                              }
                              canvas.width = width; canvas.height = height;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                  resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
                              } else { reject(new Error('Canvas context null')); }
                          };
                          video.onerror = (e) => {
                              clearTimeout(timeout);
                              reject(e);
                          };
                          video.src = URL.createObjectURL(file);
                      });
                      resultData = frameBase64;
                      mimeType = 'image/jpeg'; // Store as image
                  } catch (e) {
                      console.warn("Could not extract video frame", e);
                      throw new Error("Video processing failed.");
                  }
              }
              else {
                  resultData = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
                      reader.onerror = reject; reader.readAsDataURL(file);
                  });
              }
              
              setFileProgress(Math.round(((index + 1) / validFiles.length) * 100));
              
              return { 
                  mimeType: mimeType || 'application/octet-stream', 
                  data: resultData, 
                  fileName: file.name,
                  analysisData: analysisData || undefined,
                  analysisMimeType: analysisMimeType || undefined
              };
          } catch (e) { 
              console.error("File read error", e); 
              setFileProgress(Math.round(((index + 1) / validFiles.length) * 100));
              return null;
          }
      };

      // Process all files in parallel for reading/compressing
      const processedFiles = await Promise.all(validFiles.map((f, i) => processFile(f, i)));
      
      setIsReadingFile(false); setFileProgress(0); readingReader.current = null; e.target.value = ''; 
      
      setIsProcessingQueue(true);
      // Send to AI sequentially to avoid rate limits
      for (let i = 0; i < processedFiles.length; i++) {
          const fileData = processedFiles[i];
          if (fileData) {
              setCurrentProcessingFile(`Processing ${i + 1}/${processedFiles.length}: ${fileData.fileName}`);
              setUploadProgress(0); // Reset progress for each file
              await onGenerateProject(fileData, targetSection || undefined);
          }
      }
      setTargetSection(null);
      setCurrentProcessingFile(null);
      setIsProcessingQueue(false);
  };

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleImportWebsite = () => {
      setIsImportModalOpen(true);
  };

  const handleImportProjects = (newProjects: any[]) => {
      setPortfolioData(prev => ({
          ...prev,
          projects: [...prev.projects, ...newProjects]
      }));
  };

  const handlePublish = async () => {
      if (!isLoggedIn) {
          onLogin?.();
          return;
      }

      // Automatically save to global history when publishing
      if (onSaveHistory) onSaveHistory(true);

      setIsPublishing(true);
      const payloadContent = { ...portfolioData, theme: { ...portfolioData.theme, template: activeTemplate } };
      
      // Save to history when publishing
      const newItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        data: payloadContent
      };
      const updated = [newItem, ...savedPortfolios];
      setSavedPortfolios(updated);
      persistLocalHistory('portfolio_history_local', updated);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
          setIsPublishing(false);
          onLogin?.();
          return;
      }

      const base = portfolioData.jobPackage.resume?.fullName
          ? portfolioData.jobPackage.resume.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : 'portfolio';
      // 128 bits of randomness: the share link is the access control, so the
      // slug must not be guessable from someone's name.
      const token = Array.from(crypto.getRandomValues(new Uint8Array(10)))
          .map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
      const slug = `${base || 'portfolio'}-${token}`;

      try {
          const { data, error } = await supabase
              .from('shared_portfolios')
              .insert([{ content: payloadContent, slug, user_id: user.id }])
              .select('slug')
              .single();
          if (error) { alert(`Publishing failed: ${error.message}`); }
          else if (data) { setPublishSuccessUrl(`${window.location.origin}/#/share/${data.slug}`); }
      } catch (err) { alert('An unexpected error occurred.'); } finally { setIsPublishing(false); }
  };

  const handleDownloadPDF = async () => {
      const html2pdfLib = (window as any).html2pdf;
      if (!html2pdfLib) {
          alert("PDF library not loaded. Please refresh.");
          return;
      }

      setIsPublishing(true); // Re-use loading state
      
      try {
          const element = document.querySelector('.portfolio-container') as HTMLElement;
          if (!element) return;

          // Clone the element to avoid modifying the visible UI
          const clone = element.cloneNode(true) as HTMLElement;
          
          // Force A4 dimensions on the clone
          clone.style.width = '210mm';
          clone.style.height = '296.8mm';
          clone.style.transform = 'none';
          clone.style.boxShadow = 'none';
          
          // Remove no-print elements
          const noPrintEls = clone.querySelectorAll('.no-print');
          noPrintEls.forEach(el => el.remove());

          const container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.appendChild(clone);
          document.body.appendChild(container);

          const safeName = portfolioData.jobPackage.resume?.fullName.replace(/\s+/g, '_') || 'Portfolio';
          const filename = `${safeName}_Portfolio.pdf`;

          const opt = {
              margin: 0,
              filename: filename,
              image: { type: 'jpeg', quality: 1.0 },
              html2canvas: { 
                scale: 2, 
                useCORS: true, 
                logging: false,
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
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };

          await html2pdfLib().set(opt).from(clone).save();
          document.body.removeChild(container);
      } catch (err) {
          console.error("PDF Export Error:", err);
          alert("An error occurred during export. Please try again.");
      } finally {
          setIsPublishing(false);
      }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text).then(() => { setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }); };

  if (!portfolioData || !portfolioData.userProfile || !portfolioData.theme) {
      return (
          <div className="flex flex-col items-center justify-center p-20 text-slate-400 w-full h-full bg-slate-50">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
              <p className="text-xs font-black uppercase tracking-widest">Loading Portfolio Data...</p>
          </div>
      );
  }

  const templateProps: TemplateProps = {
      data: portfolioData, isEditing: isEditing && !readOnly, activeTemplate, onUpdateField: updateField, profilePhotoInputRef, getProfileUrl: () => "", customText, onUpdateText: handleUpdateText, onUpload: (section?: string) => { setTargetSection(section || null); fileInputRef.current?.click(); },
      onRegenerateProject: handleRegenerateProject, onRegenerateBio: handleRegenerateBio, onDeletePhoto: handleDeletePhoto,
      onRenameSection: handleRenameSection,
      cardProps: { isEditing: isEditing && !readOnly, activeTemplate, onUpdateProject: handleUpdateProject, onDeleteProject: handleDeleteProject, onMediaClick: (id: string) => setActiveModalId(id), onSetTarget: (id: string) => { setTargetProjectId(id); coverInputRef.current?.click(); }, sections: portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution'] }
  };

  return (
    <div className={`flex flex-col lg:flex-row bg-white w-full h-full overflow-hidden ${readOnly ? 'min-h-screen overflow-x-hidden' : ''}`}>
      {/* Hidden File Inputs */}
      <input type="file" ref={fileInputRef} className="hidden" accept="*" multiple onChange={handleFileSelect} />
      <input type="file" ref={coverInputRef} className="hidden" accept="image/*,video/*" onChange={handleCoverImageChange} />
      <input type="file" ref={profilePhotoInputRef} className="hidden" accept="image/*" onChange={handleProfilePhotoChange} />

      {/* --- Import Website Modal --- */}
      <ImportWebsiteModal 
          isOpen={isImportModalOpen} 
          onClose={() => setIsImportModalOpen(false)} 
          onImport={handleImportProjects} 
          lang={lang}
          t={t}
      />
      
      <style>{`
        @keyframes sticker-pop-in {
          0% { transform: scale(0) translateY(20px) rotate(-20deg); opacity: 0; }
          100% { transform: scale(1) translateY(0) rotate(0deg); opacity: 1; }
        }
        .sticker-wrapper {
            animation: sticker-pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            transform-origin: center center;
        }
        .sticker-card {
            transform: rotate(3deg);
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            transform-origin: top center;
        }
        .sticker-wrapper:hover .sticker-card {
            transform: rotate(12deg) scale(1.1);
        }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee { animation: marquee 20s linear infinite; display: flex; width: max-content; }
      `}</style>
      
      {!readOnly && (
      <aside className="w-full lg:w-[380px] lg:min-w-[380px] bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 z-[40] flex flex-col lg:shrink-0 order-1 lg:order-none">
          <div className="flex-grow flex flex-col overflow-y-auto custom-scrollbar min-h-0">
              <div className="p-6 flex flex-col gap-8 min-h-0">
                  {/* Header Section */}
                  <div className="flex flex-col gap-4 flex-shrink-0">
                      <button 
                          onClick={() => window.location.href = '/'} 
                          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors group"
                      >
                          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
                          Back to Resume
                      </button>
                      <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{t.designSystem || "Design System"}</h2>
                              <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Live Editing</span>
                              </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                              <button onClick={handleUndo} disabled={historyIndex === 0} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm" title="Undo">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                              </button>
                              <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm" title="Redo">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                              </button>
                          </div>
                      </div>
                  </div>

                  {/* Section: Templates */}
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                      <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                          <Layout className="w-3 h-3" />
                          Choose Template
                      </h3>
                      <div className="grid grid-cols-2 gap-2.5">
                          {TEMPLATES.map(tmpl => (
                              <button 
                                  key={tmpl.id} 
                                  onClick={() => { setActiveTemplate(tmpl.id); pushToHistory({...portfolioData, theme: {...portfolioData.theme, template: tmpl.id}}); }} 
                                  className={`p-3 rounded-2xl border-2 text-left transition-all group flex flex-col min-w-0 relative overflow-hidden ${activeTemplate === tmpl.id ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 shadow-md' : 'border-slate-50 hover:border-slate-200 text-slate-400 bg-slate-50/30'}`}
                              >
                                  {activeTemplate === tmpl.id && <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-600"></div>}
                                  <span className="block text-xl font-black mb-1 group-hover:scale-110 transition-transform duration-300">{tmpl.icon}</span>
                                  <span className="text-[10px] font-black uppercase mb-0.5 truncate tracking-tight">{tmpl.name}</span>
                                  <span className="block text-[7px] opacity-60 font-bold truncate tracking-wider">{tmpl.desc}</span>
                              </button>
                          ))}
                      </div>
                  </div>

                  {/* Section: Appearance */}
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                      <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                          <Palette className="w-3 h-3" />
                          Brand Colors (Gradients)
                      </h3>
                      
                      <div className="space-y-6">
                        <div>
                          <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-300 mb-3">Primary Color</h4>
                          <div className="flex flex-wrap gap-2.5">
                              {Object.entries(COLORS).map(([name, hex]) => (
                                  <button
                                      key={name}
                                      onClick={() => pushToHistory({ ...portfolioData, theme: { ...portfolioData.theme, color: name } })}
                                      className={`w-9 h-9 rounded-2xl border-2 transition-all hover:scale-110 flex items-center justify-center ${portfolioData.theme.color === name ? 'border-slate-900 scale-110 shadow-lg' : 'border-transparent hover:border-slate-200 shadow-sm'}`}
                                      style={{ backgroundColor: hex }}
                                      title={name.charAt(0).toUpperCase() + name.slice(1)}
                                  >
                                      {portfolioData.theme.color === name && (
                                          <svg className="w-5 h-5 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                      )}
                                  </button>
                              ))}
                              
                              <label
                                  className={`w-9 h-9 rounded-2xl border-2 transition-all hover:scale-110 flex items-center justify-center cursor-pointer relative overflow-hidden group ${!(COLORS as any)[portfolioData.theme.color] ? 'border-slate-900 scale-110 shadow-lg' : 'border-white hover:border-slate-200 shadow-sm'}`}
                                  style={{ 
                                      background: !(COLORS as any)[portfolioData.theme.color] 
                                          ? portfolioData.theme.color 
                                          : 'conic-gradient(from 90deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e)' 
                                  }}
                                  title="Custom Primary Color"
                              >
                                  <input
                                      type="color"
                                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                                      onChange={(e) => pushToHistory({ ...portfolioData, theme: { ...portfolioData.theme, color: e.target.value } })}
                                      value={!(COLORS as any)[portfolioData.theme.color] ? portfolioData.theme.color : '#ffffff'}
                                  />
                                  {!(COLORS as any)[portfolioData.theme.color] ? (
                                      <svg className="w-5 h-5 text-white pointer-events-none drop-shadow-md relative z-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                  ) : (
                                      <svg className="w-5 h-5 text-white pointer-events-none drop-shadow-md relative z-0 opacity-90 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                                      </svg>
                                  )}
                              </label>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-300 mb-3">Secondary Color (For Gradients)</h4>
                          <div className="flex flex-wrap gap-2.5">
                              {Object.entries(COLORS).map(([name, hex]) => (
                                  <button
                                      key={name}
                                      onClick={() => pushToHistory({ ...portfolioData, theme: { ...portfolioData.theme, secondaryColor: name } })}
                                      className={`w-9 h-9 rounded-2xl border-2 transition-all hover:scale-110 flex items-center justify-center ${portfolioData.theme.secondaryColor === name ? 'border-slate-900 scale-110 shadow-lg' : 'border-transparent hover:border-slate-200 shadow-sm'}`}
                                      style={{ backgroundColor: hex }}
                                      title={name.charAt(0).toUpperCase() + name.slice(1)}
                                  >
                                      {portfolioData.theme.secondaryColor === name && (
                                          <svg className="w-5 h-5 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                      )}
                                  </button>
                              ))}
                              
                              <label
                                  className={`w-9 h-9 rounded-2xl border-2 transition-all hover:scale-110 flex items-center justify-center cursor-pointer relative overflow-hidden group ${portfolioData.theme.secondaryColor && !(COLORS as any)[portfolioData.theme.secondaryColor] ? 'border-slate-900 scale-110 shadow-lg' : 'border-white hover:border-slate-200 shadow-sm'}`}
                                  style={{ 
                                      background: portfolioData.theme.secondaryColor && !(COLORS as any)[portfolioData.theme.secondaryColor] 
                                          ? portfolioData.theme.secondaryColor 
                                          : 'conic-gradient(from 90deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e)' 
                                  }}
                                  title="Custom Secondary Color"
                              >
                                  <input
                                      type="color"
                                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                                      onChange={(e) => pushToHistory({ ...portfolioData, theme: { ...portfolioData.theme, secondaryColor: e.target.value } })}
                                      value={portfolioData.theme.secondaryColor && !(COLORS as any)[portfolioData.theme.secondaryColor] ? portfolioData.theme.secondaryColor : '#ffffff'}
                                  />
                                  {portfolioData.theme.secondaryColor && !(COLORS as any)[portfolioData.theme.secondaryColor] ? (
                                      <svg className="w-5 h-5 text-white pointer-events-none drop-shadow-md relative z-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                  ) : (
                                      <svg className="w-5 h-5 text-white pointer-events-none drop-shadow-md relative z-0 opacity-90 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                                      </svg>
                                  )}
                              </label>
                          </div>
                        </div>
                      </div>
                  </div>

                  {/* Section: Content */}
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                      <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                          <FilePlus className="w-3 h-3" />
                          Content Management
                      </h3>
                      <div className="space-y-3">
                          <button onClick={() => !isLoading && !isReadingFile && !isProcessingQueue && fileInputRef.current?.click()} disabled={isLoading || isReadingFile || isProcessingQueue} className={`w-full p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1 relative overflow-hidden ${isLoading || isReadingFile || isProcessingQueue ? 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-wait' : 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 active:scale-[0.98]'}`}>
                             <div className="flex items-center gap-2">
                                 {isReadingFile ? (<span>Reading Files... {fileProgress}%</span>) : (isLoading || isProcessingQueue) ? (<span>AI Analysing...</span>) : (<><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4"/></svg>{t.addProjects || "Add Projects"}</>)}
                             </div>
                             {!(isLoading || isReadingFile || isProcessingQueue) && <span className="text-[8px] opacity-70 font-bold tracking-widest">(Costs {CREDIT_COSTS.portfolioProject} Credits/File)</span>}
                          </button>
                          
                          <button onClick={handleImportWebsite} disabled={isLoading || isReadingFile || isProcessingQueue} className={`w-full p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2.5 relative overflow-hidden ${isLoading || isReadingFile || isProcessingQueue ? 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-wait' : 'bg-slate-900 text-white shadow-md hover:bg-black active:scale-[0.98]'}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9h12" /></svg>
                              {t.importWebsite || "Import Website"}
                          </button>

                          {(isLoading || isReadingFile || isProcessingQueue) && (
                              <div className="animate-fade-in-up mt-2">
                                  <div className="flex justify-between items-end mb-1.5"><span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">{currentProcessingFile || progressMsg}</span><span className="text-[8px] font-black text-slate-400">{isReadingFile ? fileProgress : Math.round(uploadProgress)}%</span></div>
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${isReadingFile ? fileProgress : uploadProgress}%` }}></div></div>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Section: Sections */}
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                      <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                          <Layers className="w-3 h-3" />
                          Section Management
                      </h3>
                      <div className="space-y-2">
                          {(portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution']).map(section => (
                              <div key={section} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group hover:bg-slate-100 transition-colors">
                                  {isEditing && !readOnly ? (
                                      <input 
                                          type="text" 
                                          value={section} 
                                          onChange={(e) => handleRenameSection(section, e.target.value)}
                                          className="text-[10px] font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 outline-none w-full mr-2"
                                      />
                                  ) : (
                                      <span className="text-[10px] font-bold text-slate-700">{section}</span>
                                  )}
                                  <button 
                                      onClick={() => handleRemoveSection(section)} 
                                      disabled={(portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution']).length <= 1}
                                      className={`p-1.5 transition-all rounded-lg shadow-sm ${(portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution']).length <= 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-rose-500 hover:bg-white'}`} 
                                      title={(portfolioData.sections || ['Visual Design', 'Audio Projects', 'Strategy & Execution']).length <= 1 ? "Cannot delete the last section" : "Delete Section"}
                                  >
                                      <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                              </div>
                          ))}
                          <button 
                              onClick={handleAddSection} 
                              disabled={readOnly}
                              className={`w-full p-3 border-2 border-dashed rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${readOnly ? 'border-slate-100 text-slate-200 cursor-not-allowed' : 'border-slate-200 text-slate-400 hover:border-indigo-600 hover:text-indigo-600'}`}
                          >
                              <Plus className="w-3 h-3" />
                              Add New Section
                          </button>
                      </div>
                  </div>

                  {/* Section: Actions */}
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm mb-6">
                      <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                          <RefreshCw className="w-3 h-3" />
                          Finalize
                      </h3>
                      <div className="grid grid-cols-1 gap-2.5">
                          <button onClick={() => setIsEditing(!isEditing)} className={`w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] transition-all shadow-md flex items-center justify-center gap-2 ${isEditing ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-900 text-white hover:bg-black'}`}>
                              {isEditing ? <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>{t.saveChanges || 'Save Changes'}</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>{t.editContent || 'Edit Content'}</>}
                          </button>
                          
                          <button type="button" onClick={() => { if(confirm("Are you sure you want to create a new design? All current data will be cleared.")) handleClearAll(); }} className="w-full py-3 text-rose-500 hover:text-rose-600 font-black text-[9px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 mt-2">
                              <Trash2 className="w-3.5 h-3.5" />
                              Reset Design
                          </button>
                      </div>
                  </div>

                  {/* Section: Publish */}
                  <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm mt-auto mb-6">
                      <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                          <Share2 className="w-3 h-3" />
                          Share & Export
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                          <button 
                              onClick={handlePublish} 
                              disabled={isPublishing}
                              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isPublishing ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 active:scale-95'}`}
                          >
                              {isPublishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                              Publish
                          </button>
                          <button 
                              onClick={handleDownloadPDF} 
                              disabled={isPublishing}
                              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isPublishing ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-white text-slate-900 border-2 border-slate-100 hover:border-indigo-200 hover:text-indigo-600 shadow-sm active:scale-95'}`}
                          >
                              <Download className="w-4 h-4" />
                              PDF
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      </aside>
      )}
            <main className={`flex-grow bg-slate-100 relative z-10 order-2 lg:order-none overflow-y-auto custom-scrollbar min-h-0 flex flex-col items-center`}>
          {aiGeneratingSingle && (
              <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-white px-6 py-3 rounded-full shadow-2xl border border-indigo-100 flex items-center gap-3 animate-fade-in">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-black uppercase tracking-widest text-indigo-600">AI is crafting your {aiGeneratingSingle === 'bio' ? 'introduction' : 'project description'}...</span>
              </div>
          )}
          <div className="w-full flex-grow flex flex-col">
              <div className="w-full flex-grow flex flex-col" style={{ transform: zoom !== 1 ? `scale(${zoom})` : 'none', transformOrigin: 'top center' }}>
                  <div className="portfolio-container flex-grow flex flex-col relative bg-transparent overflow-hidden w-full">
                      <div className="w-full flex-grow flex flex-col">
                          <div ref={contentRef} className="w-full flex-grow flex flex-col">
                              {activeTemplate === 'Minimalist' && <MinimalistTemplate {...templateProps} />}
                              {activeTemplate === 'Professional' && <ProfessionalTemplate {...templateProps} />}
                              {activeTemplate === 'Creative' && <CreativeTemplate {...templateProps} />}
                              {activeTemplate === 'Retro' && <RetroTemplate {...templateProps} />}
                              {activeTemplate === 'Studio' && <StudioTemplate {...templateProps} />}
                              {activeTemplate === 'Pop' && <PopTemplate {...templateProps} />}
                              {!['Minimalist', 'Professional', 'Creative', 'Retro', 'Studio', 'Pop'].includes(activeTemplate) && <ProfessionalTemplate {...templateProps} />}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </main>

      {/* Zoom Controls */}
      <div className="fixed bottom-24 right-6 md:bottom-10 md:right-10 flex items-center bg-white border border-slate-200 p-2 rounded-2xl shadow-2xl gap-3 z-[50] no-print">
         <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="w-10 h-10 rounded-xl hover:bg-slate-50 font-black text-slate-500 transition-colors">-</button>
         <span className="text-[11px] font-black text-indigo-600 min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
         <button onClick={() => setZoom(z => Math.min(1.2, z + 0.1))} className="w-10 h-10 rounded-xl hover:bg-slate-50 font-black text-slate-500 transition-colors">+</button>
      </div>

      {/* RIGHT SIDEBAR: History */}
      {!readOnly && (
        <div className={`fixed top-24 ${isRtl ? 'left-0' : 'right-0'} h-[calc(100vh-140px)] z-[100] transition-transform duration-700 flex ${showHistoryPanel ? 'translate-x-0' : (isRtl ? '-translate-x-[calc(100%-2rem)] md:-translate-x-[calc(100%-3.5rem)]' : 'translate-x-[calc(100%-2rem)] md:translate-x-[calc(100%-3.5rem)]')}`}>
            <button onClick={() => setShowHistoryPanel(!showHistoryPanel)} className="w-8 md:w-14 bg-white/95 backdrop-blur-xl h-40 md:h-64 my-auto rounded-s-[1rem] md:rounded-s-[2rem] flex flex-col items-center justify-center gap-3 md:gap-6 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all group hover:w-10 md:hover:w-16 order-1">
                <div style={{ writingMode: 'vertical-rl', textOrientation: isCJK ? 'upright' : 'mixed' }} className={`${isCJK ? '' : 'rotate-180'} text-[9px] md:text-[11px] font-black tracking-[0.2em] md:tracking-[0.5em] uppercase`}>{t.history || "HISTORY"}</div>
                <div className="w-5 h-5 md:w-7 md:h-7 rounded-full bg-slate-100 flex items-center justify-center text-[9px] md:text-[11px] font-black text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{savedPortfolios.length}</div>
            </button>
            <div className="w-[85vw] md:w-96 h-full bg-white border-s border-slate-100 shadow-[-50px_0_100px_rgba(0,0,0,0.05)] flex flex-col order-2">
                <div className="p-10 border-b border-slate-50 flex justify-between items-center">
                    <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">{t.history || "History"}</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Saved Versions</p></div>
                    <button onClick={() => { if(confirm("Clear history?")) { setSavedPortfolios([]); localStorage.removeItem('portfolio_history_local'); } }} className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] hover:text-rose-400">RESET</button>
                </div>
                <div className="flex-grow overflow-y-auto custom-scrollbar p-8 space-y-6 bg-slate-50/30">
                    <button onClick={saveToHistory} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        Save Current Version
                    </button>
                    {savedPortfolios.length === 0 ? <p className="text-slate-300 text-center py-20 italic">No saved versions</p> : savedPortfolios.map(item => (
                        <div key={item.id} className="p-6 bg-white border border-slate-100 rounded-3xl hover:border-indigo-500/30 hover:shadow-2xl transition-all group relative">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg">🎨</div>
                                    <div><div className="text-xs font-black text-slate-900">{new Date(item.timestamp).toLocaleDateString()}</div><div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{new Date(item.timestamp).toLocaleTimeString()}</div></div>
                                </div>
                                <div className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 uppercase tracking-widest`}>{item.data.theme.template}</div>
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="text-[11px] text-slate-500 font-medium uppercase tracking-tight flex gap-2">
                                    <span>{item.data.projects.length} Projects</span>
                                    <span>•</span>
                                    <span>{item.data.userProfile.role || 'No Role'}</span>
                                </div>
                                <button 
                                    onClick={() => { setPortfolioData(item.data); setShowHistoryPanel(false); }}
                                    className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 transition-all shadow-md"
                                >
                                    Restore
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {publishSuccessUrl && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-[2rem] w-full max-w-lg p-10 text-center shadow-2xl relative">
                  <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white text-4xl mb-6 mx-auto shadow-lg shadow-emerald-200">✓</div>
                  <h2 className="text-3xl font-black text-slate-900 mb-2">Portfolio Published!</h2>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 flex items-center gap-3"><input type="text" readOnly value={publishSuccessUrl} className="bg-transparent w-full text-xs font-bold text-slate-600 outline-none" /><button onClick={() => copyToClipboard(publishSuccessUrl)} className="text-indigo-600 font-black text-xs uppercase hover:underline">{copySuccess ? 'COPIED' : 'COPY'}</button></div>
                  <div className="flex gap-4"><a href={publishSuccessUrl} target="_blank" rel="noreferrer" className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all">Open Link</a><button onClick={() => setPublishSuccessUrl(null)} className="flex-1 py-4 bg-white border-2 border-slate-100 text-slate-500 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Close</button></div>
              </div>
          </div>
      )}

      {activeModalId && <ProjectViewerModal project={portfolioData.projects.find(x => x.id === activeModalId)!} onClose={() => setActiveModalId(null)} onDelete={isEditing ? handleDeleteProject : undefined} lang={lang as Language} />}
    </div>
  );
};
