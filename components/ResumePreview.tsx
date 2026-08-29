
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from "motion/react";
import { ResumeContent, Experience, PortfolioData, Template, ReferenceItem, Project, EducationItem } from '../types';
import { TRANSLATIONS } from '../constants';
import { supabase } from '../services/supabaseClient';

interface ResumePreviewProps {
  content: ResumeContent;
  allOriginalExperiences?: Experience[]; 
  allOriginalVolunteer?: Experience[];   
  coverLetter?: string;
  missingKeywords?: string[];
  jdText: string;
  onUpdate: (newContent: ResumeContent) => void;
  onUpdateCoverLetter: (newCL: string) => void;
  onReOptimize?: (newJd: string) => void; 
  lang: 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'de' | 'fr' | 'ar';
  portfolioData: PortfolioData;
  setPortfolioData: React.Dispatch<React.SetStateAction<PortfolioData>>;
  onOpenHistory?: () => void;
  historySnapshot?: any;
  onHistoryRestored?: () => void;
  onSaveSuccess?: () => void;
  careerData?: any;
  interviewData?: any;
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onBack?: () => void;
  onSettingsUpdate?: (settings: any) => void;
  onSaveHistory?: (silent: boolean) => void;
}

const COLORS = {
  indigo: '#4f46e5',
  emerald: '#059669',
  slate: '#1e293b',
  rose: '#e11d48',
  blue: '#2563eb',
  royal: '#1e3a8a',
  teal: '#0d9488',
  purple: '#a855f7',
};

const FONT_OPTIONS = [
  { name: 'Jakarta', value: 'Plus Jakarta Sans' },
  { name: 'Inter', value: 'Inter' },
  { name: 'Lora', value: 'Lora' },
  { name: 'Merriweather', value: 'Merriweather' },
  { name: 'Playfair', value: 'Playfair Display' },
  { name: 'System', value: 'system-ui' },
];

const CL_TEMPLATES = [
  { name: 'Elegant', value: 'elegant', description: '(Decorative)' },
  { name: 'Professional', value: 'business', description: '(Business)' },
];

interface PageSettings {
  lineHeight: number;
  margin: number; 
  fontSize: number; 
  nameSize: number;   
  headerSize: number; 
  avatarSize: number;
}

const DEFAULT_SETTINGS: PageSettings = {
  lineHeight: 1.4,
  margin: 15, 
  fontSize: 10,
  nameSize: 28,
  headerSize: 11,
  avatarSize: 110
};

export const ResumePreview: React.FC<ResumePreviewProps> = ({ 
  content, 
  allOriginalExperiences = [],
  allOriginalVolunteer = [],
  coverLetter = '',
  jdText,
  onUpdate, 
  onUpdateCoverLetter,
  onReOptimize,
  lang,
  portfolioData,
  setPortfolioData,
  onOpenHistory,
  historySnapshot,
  onHistoryRestored,
  onSaveSuccess,
  careerData,
  interviewData,
  isLoggedIn = false,
  onLogin,
  onBack,
  onSettingsUpdate,
  onSaveHistory
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  const RESUME_TEMPLATES: { name: string; value: Template; description: string }[] = [
    { name: t.tmplMinimalist || 'Minimalist', value: 'Minimalist', description: t.tmplMinimalistDesc || 'Clean & modern (Sans-serif)' },
    { name: t.tmplProfessional || 'Professional', value: 'Professional', description: t.tmplProfessionalDesc || 'Classic & structured (Serif)' },
    { name: t.tmplCreative || 'Creative', value: 'Creative', description: t.tmplCreativeDesc || 'Two-column, visually engaging' },
    { name: t.tmplAcademic || 'Academic', value: 'Academic', description: t.tmplAcademicDesc || 'Education-first, detail-focused' },
    { name: t.tmplGrid || 'Grid', value: 'Grid', description: t.tmplGridDesc || 'Modern sidebar layout' },
  ];

  const [activeFont, setActiveFont] = useState<string>('Plus Jakarta Sans');
  const [activeTab, setActiveTab] = useState<'resume' | 'coverLetter'>('resume');
  const [clLayout, setClLayout] = useState<'elegant' | 'business'>('business');
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [zoom, setZoom] = useState(0.65); 
  const [activeEditingPage, setActiveEditingPage] = useState<number>(0);
  const [showHistoryPool, setShowHistoryPool] = useState(false);
  const [manualPageMap, setManualPageMap] = useState<Record<string, number>>({});
  const [manualPageCount, setManualPageCount] = useState<number>(1);
  const [coverLetterPageCount, setCoverLetterPageCount] = useState<number>(1);
  
  // Restore handling
  useEffect(() => {
    if (historySnapshot && historySnapshot.uiSettings) {
        const s = historySnapshot.uiSettings;
        if (s.activeFont) setActiveFont(s.activeFont);
        if (s.clLayout) setClLayout(s.clLayout);
        if (s.sectionTitles) setSectionTitles(s.sectionTitles);
        if (s.allPageSettings) setAllPageSettings(s.allPageSettings);
        if (s.manualPageMap) setManualPageMap(s.manualPageMap);
        if (s.manualPageCount) setManualPageCount(s.manualPageCount);
        if (s.coverLetterPageCount) setCoverLetterPageCount(s.coverLetterPageCount);
        if (s.showPortfolio !== undefined) setShowPortfolio(s.showPortfolio);
        if (s.activeTab) setActiveTab(s.activeTab);
        
        onHistoryRestored?.();
    }
  }, [historySnapshot, onHistoryRestored]);
  
  const saveToHistory = async (silent = false) => {
    if (onSaveHistory) {
        onSaveHistory(silent);
        return;
    }
    // Fallback if not provided (though we expect it to be)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const snapshot = {
          resumeContent: content,
          portfolioData: portfolioData,
          careerData: careerData,
          interviewData: interviewData,
          uiSettings: {
              activeFont,
              activeTab,
              clLayout,
              sectionTitles,
              allPageSettings,
              manualPageMap,
              manualPageCount,
              coverLetterPageCount,
              showPortfolio
          }
      };

      const saveLocal = () => {
          try {
            const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
            const newItem = {
                id: `local-${Date.now()}`,
                user_id: 'guest',
                content: snapshot,
                created_at: new Date().toISOString()
            };
            const updatedHist = [newItem, ...localHist].slice(0, 50);
            localStorage.setItem('resume_history_local', JSON.stringify(updatedHist));
            if (!silent) alert("Resume saved to local history!");
          } catch (e) {
            console.error("Local save failed", e);
          }
      };

      if (!user) {
        saveLocal();
        return;
      }

      const { error } = await supabase.from('resume_history').insert([
        {
          user_id: user.id,
          content: snapshot,
          created_at: new Date().toISOString()
        }
      ]);
      
      if (error) {
        console.warn("Cloud save failed, using local fallback", error);
        saveLocal();
      } else {
        onSaveSuccess?.();
        if (!silent) alert("Resume saved to history successfully!");
      }
    } catch (err: any) {
      console.error("Save to History Error:", err);
      if (!silent) alert(`Failed to save: ${err.message}`);
    }
  };

  // Handling split content for cover letter pagination manually
  const [clPages, setClPages] = useState<string[]>(['']);

  const [customTitles, setCustomTitles] = useState({ portfolio: "Portfolio Highlights" });
  
  // Custom Section Titles State
  const [sectionTitles, setSectionTitles] = useState({
      summary: "PROFESSIONAL SUMMARY",
      education: "EDUCATION",
      experience: "PROFESSIONAL EXPERIENCE",
      projects: "PROJECTS",
      awards: "HONORS & AWARDS",
      skills: "SKILLS",
      references: "REFERENCES",
      volunteering: "VOLUNTEER EXPERIENCE"
  });

  const [undoStack, setUndoStack] = useState<ResumeContent[]>([]);
  const [redoStack, setRedoStack] = useState<ResumeContent[]>([]);

  // State to toggle Portfolio Page visibility
  const [showPortfolio, setShowPortfolio] = useState(portfolioData.projects.length > 0);

  // Draggable State for Quick Add Panel
  const [dragPosition, setDragPosition] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Mobile Settings Drawer State
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  useEffect(() => {
      if (portfolioData.projects.length > 0) {
          setShowPortfolio(true);
      }
  }, [portfolioData.projects.length]);

  useEffect(() => {
      // Initialize Cover Letter Page 1
      if (coverLetter && clPages[0] === '') {
          setClPages([coverLetter]);
      }
  }, [coverLetter]);

  // Drag Handlers
  const handleDragStart = (e: React.MouseEvent) => {
      if (!isEditing || activeTab !== 'resume') return;
      setIsDragging(true);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!isDragging) return;
          setDragPosition({
              x: e.clientX - dragOffset.current.x,
              y: e.clientY - dragOffset.current.y
          });
      };
      const handleMouseUp = () => setIsDragging(false);

      if (isDragging) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDragging]);

  const handleUpdateCoverLetterPage = (idx: number, text: string) => {
      const newPages = [...clPages];
      newPages[idx] = text;
      setClPages(newPages);
      // Join with double newline to keep data sync, though visual pages are separate
      onUpdateCoverLetter(newPages.join('\n\n'));
  };

  const handleUpdateWithHistory = useCallback((newContent: ResumeContent) => {
      setUndoStack(prev => [...prev, content]);
      setRedoStack([]); 
      onUpdate(newContent);
  }, [content, onUpdate]);

  const handleUndo = useCallback(() => {
      if (undoStack.length === 0) return;
      const previous = undoStack[undoStack.length - 1];
      setRedoStack(prev => [content, ...prev]);
      setUndoStack(prev => prev.slice(0, -1));
      onUpdate(previous);
  }, [undoStack, content, onUpdate]);

  const handleRedo = useCallback(() => {
      if (redoStack.length === 0) return;
      const next = redoStack[0];
      setUndoStack(prev => [...prev, content]);
      setRedoStack(prev => prev.slice(1));
      onUpdate(next);
  }, [redoStack, content, onUpdate]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
              e.preventDefault();
              if (e.shiftKey) {
                  handleRedo();
              } else {
                  handleUndo();
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const [newItem, setNewItem] = useState<{
      role: string;
      company: string;
      period: string;
      type: 'work' | 'volunteer' | 'project';
      description: string;
  }>({
      role: '',
      company: '',
      period: '',
      type: 'work',
      description: ''
  });

  const [allPageSettings, setAllPageSettings] = useState<Record<number, PageSettings>>({
    0: { ...DEFAULT_SETTINGS },
    1: { ...DEFAULT_SETTINGS },
    100: { ...DEFAULT_SETTINGS } 
  });

  const previewRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const currentThemeHex = (COLORS as any)[portfolioData.theme.color] || portfolioData.theme.color;
  const currentTemplate = portfolioData.theme.template;

  useEffect(() => {
    onSettingsUpdate?.({
        activeFont,
        activeTab,
        clLayout,
        sectionTitles,
        allPageSettings,
        manualPageMap,
        manualPageCount,
        coverLetterPageCount,
        showPortfolio
    });
  }, [
    activeFont, activeTab, clLayout, sectionTitles, 
    allPageSettings, manualPageMap, manualPageCount, 
    coverLetterPageCount, showPortfolio, onSettingsUpdate
  ]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const img = new Image();
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  let width = img.width; let height = img.height;
                  const MAX_DIMENSION = 400; // Avatar doesn't need to be huge
                  if (width > height) { if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; } } 
                  else { if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; } }
                  canvas.width = width; canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) { 
                      ctx.drawImage(img, 0, 0, width, height); 
                      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                      setPortfolioData(prev => ({ ...prev, userProfile: { ...prev.userProfile, photo: base64 } }));
                  }
              };
              img.src = ev.target?.result as string;
          };
          reader.readAsDataURL(file);
      }
  };

  const getItemPage = (id: string, index: number, type: 'work' | 'volunteer' | 'project'): number => {
      if (manualPageMap[id] !== undefined) return manualPageMap[id];
      if (type === 'work') return index < 3 ? 0 : 1;
      if (type === 'volunteer') return 1;
      if (type === 'project') return 1;
      return 0;
  };

  // Helper to determine if a section header should be shown on a specific page
  const shouldShowHeader = (pageItems: any[], allItems: any[], type: 'work' | 'volunteer' | 'project', pageIdx: number) => {
      if (!pageItems || pageItems.length === 0) return false;
      if (pageIdx === 0) return true;
      const prevPageHasItems = allItems.some((item, index) => getItemPage(item.id, index, type) === pageIdx - 1);
      return !prevPageHasItems;
  };

  const maxResumePageIdx = useMemo(() => {
    let max = manualPageCount - 1;
    (content.experiences || []).forEach((e, i) => {
        const p = getItemPage(e.id, i, 'work');
        if (p > max) max = p;
    });
    (content.volunteer || []).forEach((v, i) => {
        const p = getItemPage(v.id, i, 'volunteer');
        if (p > max) max = p;
    });
    (content.schoolProjects || []).forEach((proj, i) => {
        const pg = getItemPage(proj.id, i, 'project');
        if (pg > max) max = pg;
    });
    return Math.max(0, max);
  }, [content.experiences, content.volunteer, content.schoolProjects, manualPageMap, manualPageCount]);

  const resumePageCount = maxResumePageIdx + 1;

  const currentSettings = activeTab === 'coverLetter' 
    ? (allPageSettings[100] || DEFAULT_SETTINGS) 
    : (allPageSettings[activeEditingPage] || DEFAULT_SETTINGS);

  const updateSettings = (newSettings: Partial<PageSettings>) => {
    const targetIdx = activeTab === 'coverLetter' ? 100 : activeEditingPage;
    setAllPageSettings(prev => ({
      ...prev,
      [targetIdx]: { ...prev[targetIdx], ...newSettings }
    }));
  };

  const handleSetThemeColor = (color: string) => {
    setPortfolioData(prev => ({ ...prev, theme: { ...prev.theme, color } }));
  };

  const handleSetTemplate = (template: Template) => {
    setPortfolioData(prev => ({ ...prev, theme: { ...prev.theme, template } }));
  };

  // --- Add / Remove Handlers ---

  const handleAddReference = () => {
    const newRef: ReferenceItem = {
      id: `ref-${Date.now()}`,
      fullName: 'New Reference',
      jobTitle: 'Job Title',
      company: 'Company',
      contactInfo: 'Email / Phone',
      relationship: 'Professional Relationship'
    };
    handleUpdateWithHistory({ ...content, references: [...(content.references || []), newRef] });
  };

  const handleAddAward = () => {
      const newAwards = [...(content.awards || []), 'New Honour or Award'];
      handleUpdateWithHistory({ ...content, awards: newAwards });
  };

  const handleAddEducation = () => {
      const newEdu: EducationItem = {
          id: `edu-${Date.now()}`,
          school: 'University/College Name',
          degree: 'Degree / Major',
          startDate: '2020',
          endDate: '2024',
          gpa: '3.8/4.0'
      };
      handleUpdateWithHistory({ ...content, education: [...(content.education || []), newEdu] });
  };

  const handleAddSkill = () => {
      handleUpdateWithHistory({ ...content, technicalSkills: [...(content.technicalSkills || []), 'New Skill'] });
  };

  const handleRemoveAward = (idx: number) => {
      const newAwards = (content.awards || []).filter((_, i) => i !== idx);
      handleUpdateWithHistory({ ...content, awards: newAwards });
  };

  const handleRemoveSkill = (idx: number) => {
      const newSkills = (content.technicalSkills || []).filter((_, i) => i !== idx);
      handleUpdateWithHistory({ ...content, technicalSkills: newSkills });
  };

  const handleRemoveReference = (id: string) => {
    handleUpdateWithHistory({ ...content, references: (content.references || []).filter(r => r.id !== id) });
  };
  
  const handleRemoveEducation = (id: string) => {
      handleUpdateWithHistory({ ...content, education: (content.education || []).filter(e => e.id !== id) });
  };

  const handleAddNewFromModal = () => {
      const newExp: Experience = {
          id: `new-${Date.now()}`,
          role: newItem.role || 'New Role',
          company: newItem.company || 'New Company',
          period: newItem.period || 'Present',
          bullets: newItem.description ? newItem.description.split('\n') : ['Description...'],
          isMatch: false,
      };

      if (newItem.type === 'volunteer') {
          handleUpdateWithHistory({ ...content, volunteer: [...(content.volunteer || []), newExp] });
      } else if (newItem.type === 'project') {
          handleUpdateWithHistory({ ...content, schoolProjects: [...(content.schoolProjects || []), newExp] });
      } else {
          handleUpdateWithHistory({ ...content, experiences: [...(content.experiences || []), newExp] });
      }
      
      setNewItem({ role: '', company: '', period: '', type: 'work', description: '' });
      setShowHistoryPool(false);
  };
  
  const handleRemoveExperience = (id: string) => {
      handleUpdateWithHistory({ ...content, experiences: (content.experiences || []).filter(e => e.id !== id) });
  };
  
  const handleRemoveVolunteer = (id: string) => {
      handleUpdateWithHistory({ ...content, volunteer: (content.volunteer || []).filter(v => v.id !== id) });
  };

  const handleRemoveSchoolProject = (id: string) => {
      handleUpdateWithHistory({ ...content, schoolProjects: (content.schoolProjects || []).filter(p => p.id !== id) });
  };

  const handleAddReferenceField = (id: string, field: keyof ReferenceItem, value: string) => {
    handleUpdateWithHistory({
      ...content,
      references: (content.references || []).map(r => r.id === id ? { ...r, [field]: value } : r)
    });
  };

  const handleUpdateExperience = (id: string, field: keyof Experience, value: any) => {
      handleUpdateWithHistory({
          ...content,
          experiences: (content.experiences || []).map(e => e.id === id ? { ...e, [field]: value } : e)
      });
  };
  
  const handleUpdateVolunteer = (id: string, field: keyof Experience, value: any) => {
      handleUpdateWithHistory({
          ...content,
          volunteer: (content.volunteer || []).map(v => v.id === id ? { ...v, [field]: value } : v)
      });
  };

  const handleUpdateSchoolProject = (id: string, field: keyof Experience, value: any) => {
      handleUpdateWithHistory({
          ...content,
          schoolProjects: (content.schoolProjects || []).map(p => p.id === id ? { ...p, [field]: value } : p)
      });
  };

  const handleMoveToPage = (id: string, pageIdx: number) => {
      setManualPageMap(prev => ({ ...prev, [id]: pageIdx }));
  };

  const handleAddPage = () => {
      if (activeTab === 'coverLetter') {
          setCoverLetterPageCount(prev => prev + 1);
          setClPages(prev => [...prev, '']);
      } else {
          setManualPageCount(prev => prev + 1);
      }
  };
  
  const handleRemovePortfolio = (e?: React.MouseEvent) => {
      if (e) {
          e.preventDefault();
          e.stopPropagation();
      }
      setShowPortfolio(false);
  };

  const handleAddPortfolio = () => {
      if (portfolioData.projects.length === 0) {
          const placeholder: Project = {
              id: 'placeholder-' + Date.now(),
              title: "Project Title",
              type: "Document",
              category: "Marketing Strategy",
              originalMimeType: "text/plain",
              base64Data: "",
              originalFileName: "placeholder.txt",
              description: "Description of your project goes here. Click 'Edit Content' to update this text or go to Portfolio AI to upload real files.",
              associatedSkills: ["Skill 1", "Skill 2"]
          };
          setPortfolioData(prev => ({ ...prev, projects: [placeholder] }));
      }
      setShowPortfolio(true);
  };

  const handleRemovePage = () => {
      if (activeTab === 'coverLetter') {
          if (coverLetterPageCount > 1) {
              setCoverLetterPageCount(prev => prev - 1);
              setClPages(prev => prev.slice(0, -1));
          }
      } else {
          if (showPortfolio) {
              handleRemovePortfolio();
              return;
          }
          handleDeletePage(resumePageCount - 1);
      }
  };

  const handleDeletePage = (targetPage: number) => {
      if (activeTab === 'coverLetter') {
          if (coverLetterPageCount <= 1) return;
          setCoverLetterPageCount(prev => prev - 1);
          setClPages(prev => prev.filter((_, i) => i !== targetPage));
          return;
      }

      if (resumePageCount === 1) {
          if (confirm("This is the only resume page. Clear all content?")) {
              const emptyContent = { ...content, experiences: [], education: [], volunteer: [], schoolProjects: [], summary: '', awards: [] };
              handleUpdateWithHistory(emptyContent);
          }
          return;
      }

      const newMap = { ...manualPageMap };
      const processList = (list: Experience[], type: 'work' | 'volunteer' | 'project') => {
          list.forEach((item, index) => {
              const currentPage = getItemPage(item.id, index, type);
              if (currentPage === targetPage) {
                  newMap[item.id] = Math.max(0, targetPage - 1);
              } else if (currentPage > targetPage) {
                  newMap[item.id] = currentPage - 1;
              }
          });
      };

      processList(content.experiences || [], 'work');
      processList(content.volunteer || [], 'volunteer');
      processList(content.schoolProjects || [], 'project');

      setManualPageMap(newMap);
      setManualPageCount(prev => Math.max(1, prev - 1));
  };

  /**
   * Export through the browser's own print engine.
   *
   * This used to go through html2pdf, which rasterises the DOM with html2canvas
   * and embeds the result as a single JPEG. The resulting file contained zero
   * text: extracting from it returned an empty string, so any ATS parsing the
   * "ATS optimised" resume received a blank document. Printing renders the same
   * HTML and CSS through Chrome/Safari/Firefox's PDF writer instead, which
   * emits real selectable, extractable, searchable text.
   *
   * An isolated iframe is used rather than printing the page itself so the
   * output cannot depend on every surrounding element being tagged .no-print.
   */
  const handleExportPDF = async () => {
    if (!isLoggedIn) {
        onLogin?.();
        return;
    }
    if (isExporting) return;
    if (isEditing) {
        alert("Please save changes (click 'Save Changes') before exporting.");
        return;
    }

    const pages = Array.from(document.querySelectorAll('.a4-page'));
    if (pages.length === 0) {
        alert("There is nothing to export yet.");
        return;
    }

    setIsExporting(true);

    // --- AUTO SAVE TO HISTORY ---
    saveToHistory(true);

    const safeName = content.fullName.replace(/\s+/g, '_') || 'Resume';
    const rawJobTitle = activeTab === 'coverLetter'
        ? (content.targetJobTitle || content.jobTitle || 'Job')
        : (content.jobTitle || content.targetJobTitle || 'Job');
    const jobTitle = rawJobTitle.replace(/\s+/g, '_');
    const docType = activeTab === 'coverLetter' ? 'Cover_Letter' : 'Resume';

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText =
        'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(frame);

    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        frame.remove();
        setIsExporting(false);
    };

    try {
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        if (!doc || !win) throw new Error('Could not create the print document.');

        doc.open();
        doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
        doc.close();

        // Browsers seed the "Save as PDF" filename from the document title.
        doc.title = `${safeName}_${jobTitle}_${docType}`;

        // Carry over every stylesheet the preview is rendered with, so the
        // printed document is styled exactly like what the user is looking at.
        const pendingSheets: Promise<void>[] = [];
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
            const clone = doc.head.appendChild(node.cloneNode(true)) as HTMLElement;
            if (clone.tagName === 'LINK') {
                pendingSheets.push(new Promise<void>((resolve) => {
                    clone.addEventListener('load', () => resolve(), { once: true });
                    clone.addEventListener('error', () => resolve(), { once: true });
                    setTimeout(resolve, 3000);
                }));
            }
        });

        const printCss = doc.createElement('style');
        printCss.textContent = `
            @page { size: A4; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            /* Browsers drop background colours when printing unless told not to,
               which would flatten the coloured sidebar in Creative and Grid. */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .a4-page {
                width: 210mm; height: 296.8mm; overflow: hidden;
                box-shadow: none !important; margin: 0 !important; border: none !important;
                background: #fff; position: relative; break-after: page; page-break-after: always;
            }
            .a4-page:last-child { break-after: auto; page-break-after: auto; }
        `;
        doc.head.appendChild(printCss);

        pages.forEach((page) => {
            const clone = page.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('.no-print').forEach((el) => el.remove());
            // Screen-only transforms and animations must not reach the printer.
            clone.style.transform = 'none';
            clone.style.opacity = '1';
            clone.style.animation = 'none';
            clone.style.transition = 'none';
            // The two-column templates need their sidebar to run full height.
            ['.theme-creative', '.theme-grid'].forEach((selector) => {
                const themed = clone.querySelector(selector) as HTMLElement | null;
                if (!themed) return;
                themed.style.height = '100%';
                const sidebar = themed.firstElementChild as HTMLElement | null;
                if (sidebar) sidebar.style.height = '100%';
            });
            doc.body.appendChild(clone);
        });

        // Wait for the copied stylesheets and the webfonts, otherwise the first
        // print can go out in a fallback font at the wrong metrics.
        await Promise.all(pendingSheets);
        if ((doc as any).fonts?.ready) await (doc as any).fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 250));

        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        // print() blocks until the dialog closes in Chrome and Firefox; Safari
        // does not always fire afterprint, so cover both.
        cleanup();
    } catch (err) {
        console.error("PDF Export Error:", err);
        alert("Could not open the print dialog. Please try again.");
        cleanup();
    }
  };

  const FullEditable = ({ value, onChange, style: extraStyle = {}, tagName: Tag = "div", multiLine = false, className = "", placeholder = "", dark = false }: any) => {
    const baseStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', ...extraStyle };
    if (!isEditing) return <Tag className={className} style={baseStyle}>{value || ''}</Tag>;
    return (
      <Tag
        contentEditable suppressContentEditableWarning
        onBlur={(e: any) => onChange(e.target.innerText)}
        className={`${className} outline-none ring-2 ring-indigo-500/20 rounded px-1 transition-all bg-indigo-50/10 hover:bg-white focus:bg-white ${dark ? 'focus:!text-slate-900' : ''} z-20 relative`}
        style={baseStyle}
        data-placeholder={placeholder}
      >{value || ''}</Tag>
    );
  };

  const AwardsSection = ({ bodyStyle, headerStyle, dark = false }: { bodyStyle: any, headerStyle?: any, dark?: boolean }) => {
    if (!content.awards || content.awards.length === 0) return null;
    return (
        <section className="mb-6">
            <h3 className="uppercase font-black tracking-widest mb-3 border-b border-slate-100 pb-2" style={{ color: dark ? 'white' : currentThemeHex, ...headerStyle }}>
                <FullEditable dark={dark} value={sectionTitles.awards} onChange={(v: string) => setSectionTitles(p => ({...p, awards: v}))} />
            </h3>
            <ul className="list-disc ml-4 space-y-1" style={bodyStyle}>
                {content.awards.map((award, i) => (
                    <li key={i} className="group relative">
                        {isEditing && <button onClick={() => handleRemoveAward(i)} className="absolute -left-6 top-0 no-print text-rose-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">×</button>}
                        <FullEditable dark={dark} value={award} onChange={(v: string) => {
                            const newAwards = [...content.awards!];
                            newAwards[i] = v;
                            handleUpdateWithHistory({ ...content, awards: newAwards });
                        }} />
                    </li>
                ))}
            </ul>
        </section>
    );
  };

  const SkillsSection = ({ bodyStyle, headerStyle, dark = false }: { bodyStyle: any, headerStyle?: any, dark?: boolean }) => {
    const skills = content.technicalSkills || [];
    if (!skills || skills.length === 0) return null;
    return (
      <section className="mb-6">
        <h3 className="uppercase font-black tracking-widest mb-3 border-b border-slate-100 pb-2" style={{ color: dark ? 'white' : currentThemeHex, ...headerStyle }}>
            <FullEditable dark={dark} value={sectionTitles.skills} onChange={(v: string) => setSectionTitles(p => ({...p, skills: v}))} />
        </h3>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill, i) => (
            <span key={i} className={`${dark ? 'bg-white/20 text-white border border-white/10' : 'bg-slate-100 text-slate-700'} px-2 py-1 rounded text-[9pt] font-bold relative group`}>
                {isEditing && <button onClick={() => handleRemoveSkill(i)} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity no-print">×</button>}
                <FullEditable dark={dark} tagName="span" value={skill} onChange={(v: string) => {
                    const newSkills = [...content.technicalSkills!];
                    newSkills[i] = v;
                    handleUpdateWithHistory({ ...content, technicalSkills: newSkills });
                }} />
            </span>
          ))}
        </div>
      </section>
    );
  };

  const ReferenceSection = ({ bodyStyle, headerStyle, dark = false }: { bodyStyle: any, headerStyle?: any, dark?: boolean }) => {
    if (!content.references || content.references.length === 0) return null;
    return (
      <section className="mt-8 pt-6 border-t border-slate-200">
        <h3 className="uppercase font-black tracking-widest mb-4" style={{ color: dark ? 'white' : currentThemeHex, ...headerStyle }}>
            <FullEditable dark={dark} value={sectionTitles.references} onChange={(v: string) => setSectionTitles(p => ({...p, references: v}))} />
        </h3>
        <div className="grid grid-cols-2 gap-6">
          {content.references.map((ref) => (
            <div key={ref.id} className="relative group">
               {isEditing && <button onClick={() => handleRemoveReference(ref.id)} className="absolute -right-2 top-0 no-print text-rose-500 font-bold text-xs opacity-0 group-hover:opacity-100">x</button>}
               <FullEditable dark={dark} tagName="div" value={ref.fullName} onChange={(v: string) => handleAddReferenceField(ref.id, 'fullName', v)} style={{ fontWeight: 800, fontSize: `${parseFloat(bodyStyle.fontSize) + 1}pt`, color: dark ? 'white' : 'inherit' }} />
               <div className={`${dark ? 'text-white/70' : 'text-slate-500'} text-[9pt]`}>
                 <FullEditable dark={dark} value={`${ref.jobTitle} at ${ref.company}`} onChange={() => {}} />
                 <FullEditable dark={dark} value={ref.contactInfo} onChange={(v: string) => handleAddReferenceField(ref.id, 'contactInfo', v)} />
               </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const EducationSection = ({ bodyStyle, headerStyle, simple = false, dark = false }: { bodyStyle: any, headerStyle?: any, simple?: boolean, dark?: boolean }) => {
      if (!content.education || content.education.length === 0) return null;
      return (
        <section className="mb-6">
           <h3 className="uppercase font-black tracking-widest mb-3 border-b border-slate-100 pb-2" style={{ color: dark ? 'white' : currentThemeHex, ...headerStyle }}>
                <FullEditable dark={dark} value={sectionTitles.education} onChange={(v: string) => setSectionTitles(p => ({...p, education: v}))} />
           </h3>
           {content.education.map((edu, i) => (
               <div key={edu.id || i} className="mb-5 relative group">
                   {isEditing && <button onClick={() => handleRemoveEducation(edu.id)} className={`absolute -right-2 top-0 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity no-print z-50`}>×</button>}
                   {simple ? (
                       <div className={`text-sm ${dark ? 'text-white' : 'text-slate-900'}`}>
                           <FullEditable dark={dark} value={edu.school} className="font-bold" onChange={(v: string) => {
                                const newEdu = [...(content.education || [])];
                                newEdu[i] = { ...newEdu[i], school: v };
                                handleUpdateWithHistory({ ...content, education: newEdu });
                           }} />
                           <div className={`flex justify-between ${dark ? 'text-white/60' : 'text-slate-500'} italic text-xs`}>
                               <FullEditable dark={dark} value={edu.degree} onChange={(v: string) => {
                                    const newEdu = [...(content.education || [])];
                                    newEdu[i] = { ...newEdu[i], degree: v };
                                    handleUpdateWithHistory({ ...content, education: newEdu });
                               }} />
                               <FullEditable dark={dark} value={edu.endDate} onChange={(v: string) => {
                                    const newEdu = [...(content.education || [])];
                                    newEdu[i] = { ...newEdu[i], endDate: v };
                                    handleUpdateWithHistory({ ...content, education: newEdu });
                               }} />
                           </div>
                           <div className={`text-[8pt] font-black ${dark ? 'text-white/80' : 'text-indigo-600'} mt-0.5 relative group/gpa inline-block`}>
                               GPA: <FullEditable dark={dark} tagName="span" value={edu.gpa || '3.5/4.0'} onChange={(v: string) => {
                                    const newEdu = [...(content.education || [])];
                                    newEdu[i] = { ...newEdu[i], gpa: v };
                                    handleUpdateWithHistory({ ...content, education: newEdu });
                               }} />
                           </div>
                       </div>
                   ) : (
                       dark ? (
                           <div className="text-white">
                               <div className="mb-1">
                                   <FullEditable dark={true} value={edu.school} className="font-black text-[10.5pt] leading-tight" onChange={(v: string) => {
                                        const newEdu = [...(content.education || [])];
                                        newEdu[i] = { ...newEdu[i], school: v };
                                        handleUpdateWithHistory({ ...content, education: newEdu });
                                   }} />
                               </div>
                               <div className="mb-3">
                                   <FullEditable dark={true} value={edu.degree} className="text-[9pt] italic text-white/90" onChange={(v: string) => {
                                        const newEdu = [...(content.education || [])];
                                        newEdu[i] = { ...newEdu[i], degree: v };
                                        handleUpdateWithHistory({ ...content, education: newEdu });
                                   }} />
                               </div>
                               <div className="flex justify-between items-center">
                                   <div className="flex gap-2 items-center bg-white/10 px-3 py-1.5 rounded-lg text-[8.5pt] text-white/90 font-medium shadow-sm">
                                       <FullEditable dark={true} value={edu.startDate} placeholder="Start" onChange={(v: string) => {
                                            const newEdu = [...(content.education || [])];
                                            newEdu[i] = { ...newEdu[i], startDate: v };
                                            handleUpdateWithHistory({ ...content, education: newEdu });
                                       }} />
                                       <span className="opacity-50 text-[8px]">-</span>
                                       <FullEditable dark={true} value={edu.endDate} placeholder="End" onChange={(v: string) => {
                                            const newEdu = [...(content.education || [])];
                                            newEdu[i] = { ...newEdu[i], endDate: v };
                                            handleUpdateWithHistory({ ...content, education: newEdu });
                                       }} />
                                   </div>
                                   
                                   {edu.gpa ? (
                                       <div className="group/gpa flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg ml-2 relative transition-all hover:bg-white/20 shadow-sm">
                                          <span className="font-black text-[7px] uppercase tracking-wider opacity-70">GPA</span>
                                          <FullEditable dark={true} tagName="span" value={edu.gpa} className="font-bold text-[8.5pt] text-white" onChange={(v: string) => {
                                                const newEdu = [...(content.education || [])];
                                                newEdu[i] = { ...newEdu[i], gpa: v };
                                                handleUpdateWithHistory({ ...content, education: newEdu });
                                          }} />
                                          {isEditing && (
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newEdu = [...(content.education || [])];
                                                    newEdu[i] = { ...newEdu[i], gpa: undefined };
                                                    handleUpdateWithHistory({ ...content, education: newEdu });
                                                }}
                                                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold opacity-0 group-hover/gpa:opacity-100 transition-opacity shadow-sm cursor-pointer z-50"
                                                title="Remove GPA"
                                              >×</button>
                                          )}
                                       </div>
                                   ) : (
                                       isEditing && (
                                           <button 
                                            onClick={() => {
                                                const newEdu = [...(content.education || [])];
                                                newEdu[i] = { ...newEdu[i], gpa: '3.8/4.0' };
                                                handleUpdateWithHistory({ ...content, education: newEdu });
                                            }}
                                            className="text-[8px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white/50 hover:text-white transition-all ml-2"
                                           >
                                               + GPA
                                           </button>
                                       )
                                   )}
                               </div>
                           </div>
                       ) : (
                           <div className="text-slate-900">
                               <div className="flex justify-between font-bold text-[10.5pt]">
                                   <FullEditable value={edu.school} onChange={(v: string) => {
                                        const newEdu = [...(content.education || [])];
                                        newEdu[i] = { ...newEdu[i], school: v };
                                        handleUpdateWithHistory({ ...content, education: newEdu });
                                   }} />
                                   <div className="flex gap-1 text-slate-400 font-medium text-[9pt]">
                                       <FullEditable value={edu.startDate} onChange={(v: string) => {
                                            const newEdu = [...(content.education || [])];
                                            newEdu[i] = { ...newEdu[i], startDate: v };
                                            handleUpdateWithHistory({ ...content, education: newEdu });
                                       }} />
                                       <span>-</span>
                                       <FullEditable value={edu.endDate} onChange={(v: string) => {
                                            const newEdu = [...(content.education || [])];
                                            newEdu[i] = { ...newEdu[i], endDate: v };
                                            handleUpdateWithHistory({ ...content, education: newEdu });
                                       }} />
                                   </div>
                               </div>
                               <div className="flex justify-between items-baseline">
                                   <FullEditable value={edu.degree} className="text-slate-600 italic text-[9.5pt]" onChange={(v: string) => {
                                        const newEdu = [...(content.education || [])];
                                        newEdu[i] = { ...newEdu[i], degree: v };
                                        handleUpdateWithHistory({ ...content, education: newEdu });
                                   }} />
                                   {edu.gpa ? (
                                       <div className="text-[9pt] font-black text-indigo-600 relative group/gpa">
                                           <span className="mr-1 text-[8px] uppercase text-slate-400 font-bold">GPA</span>
                                           <FullEditable tagName="span" value={edu.gpa} onChange={(v: string) => {
                                                const newEdu = [...(content.education || [])];
                                                newEdu[i] = { ...newEdu[i], gpa: v };
                                                handleUpdateWithHistory({ ...content, education: newEdu });
                                           }} />
                                           {isEditing && <button onClick={() => {
                                              const newEdu = [...(content.education || [])];
                                              newEdu[i] = { ...newEdu[i], gpa: undefined }; 
                                              handleUpdateWithHistory({ ...content, education: newEdu });
                                           }} className="ml-1 text-rose-500 font-bold opacity-0 group-hover/gpa:opacity-100 transition-opacity text-[10px] no-print px-1 hover:bg-rose-50 rounded cursor-pointer absolute -top-2 -right-2">x</button>}
                                       </div>
                                   ) : (
                                       isEditing && <button onClick={() => {
                                            const newEdu = [...(content.education || [])];
                                            newEdu[i] = { ...newEdu[i], gpa: '3.8/4.0' }; 
                                            handleUpdateWithHistory({ ...content, education: newEdu });
                                       }} className="text-[9px] text-indigo-400 hover:text-indigo-600 font-bold">+ GPA</button>
                                   )}
                               </div>
                           </div>
                       )
                   )}
               </div>
           ))}
        </section>
      );
  }

  const ExperienceItem: React.FC<{ exp: Experience, bodyStyle: any, type?: 'work' | 'volunteer' | 'project', dark?: boolean }> = ({ exp, bodyStyle, type = 'work', dark = false }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [localBullets, setLocalBullets] = useState((exp.bullets || []).join('\n'));

    useEffect(() => {
        setLocalBullets((exp.bullets || []).join('\n'));
    }, [exp.bullets]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [isEditing, localBullets]);

    const updateField = (field: keyof Experience, val: any) => {
        if (type === 'volunteer') handleUpdateVolunteer(exp.id, field, val);
        else if (type === 'project') handleUpdateSchoolProject(exp.id, field, val);
        else handleUpdateExperience(exp.id, field, val);
    };

    const removeSelf = () => {
        if (type === 'volunteer') handleRemoveVolunteer(exp.id);
        else if (type === 'project') handleRemoveSchoolProject(exp.id);
        else handleRemoveExperience(exp.id);
    };

    return (
        <div className="relative mb-6 group">
        {isEditing && (
            <div className="absolute -top-5 right-0 flex gap-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                <button onClick={() => handleMoveToPage(exp.id, 0)} className="bg-slate-200 text-slate-600 text-[9px] font-bold px-2 py-1 rounded shadow-sm hover:bg-slate-300">P1</button>
                <button onClick={() => handleMoveToPage(exp.id, 1)} className="bg-slate-200 text-slate-600 text-[9px] font-bold px-2 py-1 rounded shadow-sm hover:bg-slate-300">P2</button>
                <button onClick={removeSelf} className="bg-rose-500 text-white text-[9px] font-bold px-2 py-1 rounded shadow-sm hover:bg-rose-600 ml-2">REMOVE</button>
            </div>
        )}
        <div className="flex justify-between items-baseline mb-1">
            <FullEditable dark={dark} tagName="span" value={exp.role} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 1}pt`, fontWeight: 800, color: dark ? 'white' : '#1e293b' }} onChange={(v: string) => updateField('role', v)} />
            <FullEditable dark={dark} tagName="span" value={exp.period} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) - 1}pt`, color: dark ? 'rgba(255,255,255,0.5)' : '#64748b', fontWeight: 600 }} onChange={(v: string) => updateField('period', v)} />
        </div>
        <FullEditable dark={dark} tagName="div" value={exp.company} style={{ fontSize: `${parseFloat(bodyStyle.fontSize)}pt`, color: dark ? 'white' : currentThemeHex, fontWeight: 700, marginBottom: '6px' }} onChange={(v: string) => updateField('company', v)} />
        
        <div className={`pl-4 ${isEditing ? 'border-l-2 border-indigo-100/50' : ''}`}>
            {isEditing ? (
                <textarea 
                    ref={textareaRef}
                    className={`w-full ${dark ? 'bg-white/10 text-white' : 'bg-indigo-50/20 text-slate-700'} p-2 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-100 resize-none overflow-hidden`}
                    value={localBullets}
                    onChange={(e) => setLocalBullets(e.target.value)}
                    onBlur={() => updateField('bullets', localBullets.split('\n'))}
                    style={{ fontSize: `${parseFloat(bodyStyle.fontSize)}pt`, lineHeight: 1.4 }}
                />
            ) : (
                <ul className="bullet-list-ul space-y-1.5" style={{...bodyStyle, color: dark ? 'rgba(255,255,255,0.9)' : undefined}}>
                    {(exp.bullets || []).map((b: string, i: number) => (
                        <li key={i} className="relative">
                            <span>{b}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
        </div>
    );
  };

  const FloatingToolbar = () => {
      if (!isEditing) return null;
      return (
      <div className="fixed bottom-10 left-0 w-full flex justify-center z-[100] pointer-events-none no-print">
          <motion.div 
              drag
              dragMomentum={false}
              className="flex gap-2 p-3 bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl cursor-grab active:cursor-grabbing pointer-events-auto"
              style={{ touchAction: 'none' }}
          >
              <div className="flex items-center justify-center px-2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
              </div>
              <button onClick={() => setShowHistoryPool(true)} className="px-4 py-2 bg-[#4f46e5] text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200/50">
                  <span>+ EXP</span>
              </button>
              <button onClick={handleAddEducation} className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors">
                  <span>+ EDU</span>
              </button>
              <button onClick={handleAddSkill} className="px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors">
                  <span>+ SKILL</span>
              </button>
              <button onClick={handleAddAward} className="px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors">
                  <span>+ AWARD</span>
              </button>
              <button onClick={handleAddReference} className="px-4 py-2 bg-[#eff6ff] text-[#4f46e5] hover:bg-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors">
                  <span>+ REF</span>
              </button>
          </motion.div>
      </div>
      );
  };

  const MinimalistLayout = ({ pageIdx }: { pageIdx: number }) => {
    const settings = allPageSettings[pageIdx] || DEFAULT_SETTINGS;
    const bodyStyle = { fontSize: `${settings.fontSize}pt`, lineHeight: settings.lineHeight };
    const headerStyle = { fontSize: `${settings.headerSize}pt` };
    const pageExps = (content.experiences || []).filter((e, idx) => getItemPage(e.id, idx, 'work') === pageIdx);
    const pageVols = (content.volunteer || []).filter((v, idx) => getItemPage(v.id, idx, 'volunteer') === pageIdx);
    const pageProjs = (content.schoolProjects || []).filter((p, idx) => getItemPage(p.id, idx, 'project') === pageIdx);
    const isLastPage = pageIdx === resumePageCount - 1;

    return (
      <div className="a4-page-content theme-minimalist h-full flex flex-col" style={{ padding: `${settings.margin}mm`, fontFamily: activeFont }}>
        {pageIdx === 0 && (
          <header className="mb-10">
            <FullEditable tagName="h1" value={content.fullName} style={{ fontSize: `${settings.nameSize}pt`, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }} onChange={(v: string) => handleUpdateWithHistory({...content, fullName: v})} />
            <FullEditable tagName="h2" value={content.jobTitle || 'Job Title'} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 2}pt`, fontWeight: 600, color: currentThemeHex, marginTop: '4px' }} onChange={(v: string) => handleUpdateWithHistory({...content, jobTitle: v})} />
            <div className="h-1.5 w-16 mt-4 mb-4 rounded-full" style={{ backgroundColor: currentThemeHex }}></div>
            <FullEditable tagName="p" value={content.contactInfo} className="text-slate-500 font-bold uppercase tracking-widest text-[10px]" onChange={(v: string) => handleUpdateWithHistory({...content, contactInfo: v})} />
          </header>
        )}
        <div className="space-y-8 flex-grow">
           {pageIdx === 0 && (
             <section>
               <h3 className="uppercase font-black tracking-widest mb-4 border-b border-slate-100 pb-2" style={{ color: currentThemeHex, ...headerStyle }}>
                   <FullEditable value={sectionTitles.summary} onChange={(v: string) => setSectionTitles(p => ({...p, summary: v}))} />
               </h3>
               <FullEditable multiLine value={content.summary} style={bodyStyle} onChange={(v: string) => handleUpdateWithHistory({...content, summary: v})} />
             </section>
           )}
           {pageIdx === 0 && <EducationSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
           {pageIdx === 0 && <AwardsSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
           {pageIdx === 0 && <SkillsSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
           {(pageExps.length > 0) && (
             <section>
               {shouldShowHeader(pageExps, content.experiences, 'work', pageIdx) && 
                   <h3 className="uppercase font-black tracking-widest mb-6 border-b border-slate-100 pb-2" style={{ color: currentThemeHex, ...headerStyle }}>
                       <FullEditable value={sectionTitles.experience} onChange={(v: string) => setSectionTitles(p => ({...p, experience: v}))} />
                   </h3>
               }
               {pageExps.map((exp, idx) => <ExperienceItem key={exp.id} exp={exp} bodyStyle={bodyStyle} type="work" />)}
             </section>
           )}
           {(pageProjs.length > 0) && (
             <section>
                {shouldShowHeader(pageProjs, content.schoolProjects, 'project', pageIdx) && 
                    <h3 className="uppercase font-black tracking-widest mb-6 border-b border-slate-100 pb-2" style={{ color: currentThemeHex, ...headerStyle }}>
                        <FullEditable value={sectionTitles.projects} onChange={(v: string) => setSectionTitles(p => ({...p, projects: v}))} />
                    </h3>
                }
                {pageProjs.map((proj, idx) => <ExperienceItem key={proj.id} exp={proj} bodyStyle={bodyStyle} type="project" />)}
             </section>
           )}
           {(pageVols.length > 0) && (
             <section>
               {shouldShowHeader(pageVols, content.volunteer, 'volunteer', pageIdx) && 
                   <h3 className="uppercase font-black tracking-widest mb-6 border-b border-slate-100 pb-2" style={{ color: currentThemeHex, ...headerStyle }}>
                       <FullEditable value={sectionTitles.volunteering} onChange={(v: string) => setSectionTitles(p => ({...p, volunteering: v}))} />
                   </h3>
               }
               {pageVols.map((vol, idx) => (
                 <div key={vol.id} className="relative">
                   <ExperienceItem key={vol.id} exp={vol} bodyStyle={bodyStyle} type="volunteer" />
                 </div>
               ))}
             </section>
           )}
           {isLastPage && <ReferenceSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
        </div>
      </div>
    );
  };

  const ProfessionalLayout = ({ pageIdx }: { pageIdx: number }) => {
    const settings = allPageSettings[pageIdx] || DEFAULT_SETTINGS;
    const bodyStyle = { fontSize: `${settings.fontSize}pt`, lineHeight: settings.lineHeight };
    const headerStyle = { fontSize: `${settings.headerSize}pt` };
    const pageExps = (content.experiences || []).filter((e, idx) => getItemPage(e.id, idx, 'work') === pageIdx);
    const pageVols = (content.volunteer || []).filter((v, idx) => getItemPage(v.id, idx, 'volunteer') === pageIdx);
    const pageProjs = (content.schoolProjects || []).filter((p, idx) => getItemPage(p.id, idx, 'project') === pageIdx);
    const isLastPage = pageIdx === resumePageCount - 1; 

    return (
      <div className="a4-page-content theme-professional h-full flex flex-col" style={{ padding: `${settings.margin}mm`, fontFamily: activeFont === 'System' ? 'Times New Roman' : activeFont }}>
        {pageIdx === 0 && (
          <header className="mb-8 text-center border-b-2 border-slate-800 pb-6">
            <FullEditable tagName="h1" value={content.fullName} style={{ fontSize: `${settings.nameSize}pt`, fontWeight: 700, color: '#000', lineHeight: 1.1, marginBottom: '10px' }} onChange={(v: string) => handleUpdateWithHistory({...content, fullName: v})} />
            <FullEditable tagName="h2" value={content.jobTitle || 'Job Title'} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 2}pt`, fontWeight: 600, color: currentThemeHex, marginBottom: '8px' }} onChange={(v: string) => handleUpdateWithHistory({...content, jobTitle: v})} />
            <FullEditable tagName="p" value={content.contactInfo} className="text-slate-600 font-medium text-[10pt]" onChange={(v: string) => handleUpdateWithHistory({...content, contactInfo: v})} />
          </header>
        )}
        <div className="space-y-6 flex-grow">
           {pageIdx === 0 && (
             <section>
               <h3 className="uppercase font-bold tracking-wider mb-3 border-b border-slate-300 pb-1" style={{ color: currentThemeHex, ...headerStyle }}>
                   <FullEditable value={sectionTitles.summary} onChange={(v: string) => setSectionTitles(p => ({...p, summary: v}))} />
               </h3>
               <FullEditable multiLine value={content.summary} style={bodyStyle} onChange={(v: string) => handleUpdateWithHistory({...content, summary: v})} />
             </section>
           )}
           {pageIdx === 0 && <EducationSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
           {pageIdx === 0 && <AwardsSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
           {pageIdx === 0 && <SkillsSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
           {(pageExps.length > 0) && (
             <section>
               {shouldShowHeader(pageExps, content.experiences, 'work', pageIdx) && 
                   <h3 className="uppercase font-bold tracking-wider mb-4 border-b border-slate-300 pb-1" style={{ color: currentThemeHex, ...headerStyle }}>
                       <FullEditable value={sectionTitles.experience} onChange={(v: string) => setSectionTitles(p => ({...p, experience: v}))} />
                   </h3>
               }
               {pageExps.map((exp, idx) => <ExperienceItem key={exp.id} exp={exp} bodyStyle={bodyStyle} type="work" />)}
             </section>
           )}
           {pageProjs.length > 0 && (
              <section>
                  {shouldShowHeader(pageProjs, content.schoolProjects, 'project', pageIdx) && 
                      <h3 className="uppercase font-bold tracking-wider mb-4 border-b border-slate-300 pb-1" style={{ color: currentThemeHex, ...headerStyle }}>
                          <FullEditable value={sectionTitles.projects} onChange={(v: string) => setSectionTitles(p => ({...p, projects: v}))} />
                      </h3>
                  }
                  {pageProjs.map((p, idx) => <ExperienceItem key={p.id} exp={p} bodyStyle={bodyStyle} type="project" />)}
              </section>
           )}
           {(pageVols.length > 0) && (
             <section>
               {shouldShowHeader(pageVols, content.volunteer, 'volunteer', pageIdx) && 
                   <h3 className="uppercase font-bold tracking-wider mb-4 border-b border-slate-300 pb-1" style={{ color: currentThemeHex, ...headerStyle }}>
                       <FullEditable value={sectionTitles.volunteering} onChange={(v: string) => setSectionTitles(p => ({...p, volunteering: v}))} />
                   </h3>
               }
               {pageVols.map((vol, idx) => <ExperienceItem key={vol.id} exp={vol} bodyStyle={bodyStyle} type="volunteer" />)}
             </section>
           )}
           {isLastPage && <ReferenceSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
        </div>
      </div>
    );
  };

  const CreativeLayout = ({ pageIdx }: { pageIdx: number }) => {
      const settings = allPageSettings[pageIdx] || DEFAULT_SETTINGS;
      const bodyStyle = { fontSize: `${settings.fontSize}pt`, lineHeight: settings.lineHeight };
      const headerStyle = { fontSize: `${settings.headerSize}pt` };
      const pageExps = (content.experiences || []).filter((e, idx) => getItemPage(e.id, idx, 'work') === pageIdx);
      const pageVols = (content.volunteer || []).filter((v, idx) => getItemPage(v.id, idx, 'volunteer') === pageIdx);
      const pageProjs = (content.schoolProjects || []).filter((p, idx) => getItemPage(p.id, idx, 'project') === pageIdx);
      const isLastPage = pageIdx === resumePageCount - 1; 

      return (
        <div className="a4-page-content theme-creative h-full flex min-h-[297mm]" style={{ fontFamily: activeFont }}>
          <div className="w-[30%] bg-slate-50 h-full p-8 border-r border-slate-100 flex flex-col gap-8 relative z-10 min-h-[297mm]" style={{ padding: `${settings.margin}mm` }}>
              {pageIdx === 0 && (
                  <div className="mb-4">
                      <div style={{ width: settings.avatarSize, height: settings.avatarSize }} className="rounded-full bg-slate-200 mb-6 overflow-hidden relative cursor-pointer group z-20" onClick={() => isEditing && avatarInputRef.current?.click()}>
                          {portfolioData.userProfile.photo 
                              ? <img src={`data:image/jpeg;base64,${portfolioData.userProfile.photo}`} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-slate-400" style={{backgroundColor: currentThemeHex, color: 'white'}}>{content.fullName.charAt(0)}</div>
                          }
                      </div>
                      <FullEditable tagName="h1" value={content.fullName} style={{ fontSize: `${settings.nameSize}pt`, fontWeight: 900, color: currentThemeHex, lineHeight: 1.1, marginBottom: '10px' }} onChange={(v: string) => handleUpdateWithHistory({...content, fullName: v})} />
                      <FullEditable tagName="h2" value={content.jobTitle || 'Job Title'} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 2}pt`, fontWeight: 700, color: '#0f172a', marginBottom: '12px' }} onChange={(v: string) => handleUpdateWithHistory({...content, jobTitle: v})} />
                      <FullEditable tagName="div" value={content.contactInfo} className="text-slate-500 font-bold text-[9pt] leading-relaxed" onChange={(v: string) => handleUpdateWithHistory({...content, contactInfo: v})} />
                  </div>
              )}
              {pageIdx === 0 && <EducationSection bodyStyle={{...bodyStyle, fontSize: '9pt'}} headerStyle={headerStyle} simple />}
              {pageIdx === 0 && <AwardsSection bodyStyle={{...bodyStyle, fontSize: '9pt'}} headerStyle={headerStyle} />}
              {pageIdx === 0 && <SkillsSection bodyStyle={{...bodyStyle, fontSize: '9pt'}} headerStyle={headerStyle} />}
          </div>
          <div className="w-[70%] p-8 flex flex-col z-0" style={{ padding: `${settings.margin}mm` }}>
              <div className="space-y-8 flex-grow">
                 {pageIdx === 0 && <section><h3 className="uppercase font-black mb-4" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.summary} onChange={(v: string) => setSectionTitles(p => ({...p, summary: v}))} /></h3><FullEditable multiLine value={content.summary} style={bodyStyle} onChange={(v: string) => handleUpdateWithHistory({...content, summary: v})} /></section>}
                 {(pageExps.length > 0) && <section>{shouldShowHeader(pageExps, content.experiences, 'work', pageIdx) && <h3 className="uppercase font-black mb-6" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.experience} onChange={(v: string) => setSectionTitles(p => ({...p, experience: v}))} /></h3>}{pageExps.map((exp, idx) => <ExperienceItem key={exp.id} exp={exp} bodyStyle={bodyStyle} type="work" />)}</section>}
                 {pageProjs.length > 0 && <section>{shouldShowHeader(pageProjs, content.schoolProjects, 'project', pageIdx) && <h3 className="uppercase font-black mb-6" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.projects} onChange={(v: string) => setSectionTitles(p => ({...p, projects: v}))} /></h3>}{pageProjs.map((p, idx) => <ExperienceItem key={p.id} exp={p} bodyStyle={bodyStyle} type="project" />)}</section>}
                 {pageVols.length > 0 && <section>{shouldShowHeader(pageVols, content.volunteer, 'volunteer', pageIdx) && <h3 className="uppercase font-black mb-6" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.volunteering} onChange={(v: string) => setSectionTitles(p => ({...p, volunteering: v}))} /></h3>}{pageVols.map((vol, idx) => <ExperienceItem key={vol.id} exp={vol} bodyStyle={bodyStyle} type="volunteer" />)}</section>}
                 {isLastPage && <ReferenceSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
                 {/* Removed BottomActions */}
              </div>
          </div>
        </div>
      );
  };

  const AcademicLayout = ({ pageIdx }: { pageIdx: number }) => {
      const settings = allPageSettings[pageIdx] || DEFAULT_SETTINGS;
      const bodyStyle = { fontSize: `${settings.fontSize}pt`, lineHeight: settings.lineHeight };
      const headerStyle = { fontSize: `${settings.headerSize}pt` };
      const pageExps = (content.experiences || []).filter((e, idx) => getItemPage(e.id, idx, 'work') === pageIdx);
      const pageVols = (content.volunteer || []).filter((v, idx) => getItemPage(v.id, idx, 'volunteer') === pageIdx);
      const pageProjs = (content.schoolProjects || []).filter((p, idx) => getItemPage(p.id, idx, 'project') === pageIdx);
      const isLastPage = pageIdx === resumePageCount - 1; 
      
      return (
        <div className="a4-page-content theme-academic h-full flex flex-col" style={{ padding: `${settings.margin}mm`, fontFamily: 'Times New Roman, serif' }}>
            {pageIdx === 0 && (
                <header className="mb-6 text-center border-b-2 border-black pb-4">
                    <FullEditable tagName="h1" value={content.fullName} style={{ fontSize: `${settings.nameSize}pt`, fontWeight: 'bold' }} onChange={(v: string) => handleUpdateWithHistory({...content, fullName: v})} />
                    <FullEditable tagName="h2" value={content.jobTitle || 'Job Title'} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 2}pt`, fontWeight: 'bold', marginTop: '4px' }} onChange={(v: string) => handleUpdateWithHistory({...content, jobTitle: v})} />
                    <FullEditable tagName="p" value={content.contactInfo} style={{ fontSize: '10pt', marginTop: '4px' }} onChange={(v: string) => handleUpdateWithHistory({...content, contactInfo: v})} />
                </header>
            )}
            <div className="space-y-6">
                 {pageIdx === 0 && <section><h3 className="uppercase font-bold border-b border-black mb-3" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.summary} onChange={(v: string) => setSectionTitles(p => ({...p, summary: v}))} /></h3><FullEditable multiLine value={content.summary} style={bodyStyle} onChange={(v: string) => handleUpdateWithHistory({...content, summary: v})} /></section>}
                 {pageIdx === 0 && <EducationSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
                 {pageIdx === 0 && <AwardsSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
                 {pageIdx === 0 && <SkillsSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
                 {(pageExps.length > 0) && <section>{shouldShowHeader(pageExps, content.experiences, 'work', pageIdx) && <h3 className="uppercase font-bold border-b border-black mb-3" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.experience} onChange={(v: string) => setSectionTitles(p => ({...p, experience: v}))} /></h3>}{pageExps.map((exp, idx) => <div key={exp.id} className="mb-4"><ExperienceItem exp={exp} bodyStyle={bodyStyle} type="work" /></div>)}</section>}
                 {(pageProjs.length > 0) && <section>{shouldShowHeader(pageProjs, content.schoolProjects, 'project', pageIdx) && <h3 className="uppercase font-bold border-b border-black mb-3" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.projects} onChange={(v: string) => setSectionTitles(p => ({...p, projects: v}))} /></h3>}{pageProjs.map((p, idx) => <div key={p.id} className="mb-4"><ExperienceItem exp={p} bodyStyle={bodyStyle} type="project" /></div>)}</section>}
                 {(pageVols.length > 0) && <section>{shouldShowHeader(pageVols, content.volunteer, 'volunteer', pageIdx) && <h3 className="uppercase font-bold border-b border-black mb-3" style={{ color: currentThemeHex, ...headerStyle }}><FullEditable value={sectionTitles.volunteering} onChange={(v: string) => setSectionTitles(p => ({...p, volunteering: v}))} /></h3>}{pageVols.map((v, idx) => <div key={v.id} className="mb-4"><ExperienceItem exp={v} bodyStyle={bodyStyle} type="volunteer" /></div>)}</section>}
            </div>
            {isLastPage && <ReferenceSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
        </div>
      );
  };

  const GridLayout = ({ pageIdx }: { pageIdx: number }) => {
      const settings = allPageSettings[pageIdx] || DEFAULT_SETTINGS;
      const bodyStyle = { fontSize: `${settings.fontSize}pt`, lineHeight: settings.lineHeight };
      const headerStyle = { fontSize: `${settings.headerSize}pt` };
      const pageExps = (content.experiences || []).filter((e, idx) => getItemPage(e.id, idx, 'work') === pageIdx);
      const pageVols = (content.volunteer || []).filter((v, idx) => getItemPage(v.id, idx, 'volunteer') === pageIdx);
      const pageProjs = (content.schoolProjects || []).filter((p, idx) => getItemPage(p.id, idx, 'project') === pageIdx);
      const isLastPage = pageIdx === resumePageCount - 1;
      
      return (
        <div className="a4-page-content theme-grid h-full flex min-h-[297mm]" style={{ fontFamily: activeFont, backgroundColor: 'white' }}>
            {/* Left Sidebar - Colored */}
            <div className="w-[35%] h-full p-8 text-white flex flex-col gap-6 min-h-[297mm]" style={{ backgroundColor: currentThemeHex, padding: `${settings.margin}mm` }}>
                {pageIdx === 0 && (
                    <div className="text-center mb-8 flex flex-col items-center">
                        <div style={{ width: settings.avatarSize, height: settings.avatarSize }} className="rounded-full bg-white/10 mb-4 overflow-hidden relative cursor-pointer group border-4 border-white/10 shadow-lg" onClick={() => isEditing && avatarInputRef.current?.click()}>
                             {portfolioData.userProfile.photo 
                                ? <img src={`data:image/jpeg;base64,${portfolioData.userProfile.photo}`} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-white/30">{content.fullName.charAt(0)}</div>
                             }
                             {isEditing && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[9px] font-black text-white uppercase">Change</span>
                                </div>
                             )}
                        </div>
                        <FullEditable dark tagName="h1" value={content.fullName} style={{ fontSize: `${settings.nameSize * 0.7}pt` }} className="font-black mb-2 leading-tight tracking-tight" onChange={(v: string) => handleUpdateWithHistory({...content, fullName: v})} />
                        <FullEditable dark tagName="h2" value={content.jobTitle || 'Job Title'} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 1}pt` }} className="font-bold mb-2 opacity-90 tracking-wide" onChange={(v: string) => handleUpdateWithHistory({...content, jobTitle: v})} />
                        <div className="w-10 h-1 bg-white/30 rounded-full mb-4"></div>
                        <FullEditable dark tagName="p" value={content.contactInfo} className="text-[8pt] opacity-80 break-words font-medium uppercase tracking-wider" onChange={(v: string) => handleUpdateWithHistory({...content, contactInfo: v})} />
                    </div>
                )}
                
                {pageIdx === 0 && <EducationSection bodyStyle={{...bodyStyle, fontSize: '9pt'}} headerStyle={headerStyle} dark />}
                {pageIdx === 0 && <AwardsSection bodyStyle={{...bodyStyle, fontSize: '9pt'}} headerStyle={headerStyle} dark />}
                {pageIdx === 0 && <SkillsSection bodyStyle={{...bodyStyle, fontSize: '9pt'}} headerStyle={headerStyle} dark />}
            </div>
            
            {/* Right Content - White */}
            <div className="w-[65%] h-full flex flex-col gap-8 min-h-[297mm]" style={{ padding: `${settings.margin}mm` }}>
                 {pageIdx === 0 && (
                     <section>
                         <h3 className="font-black uppercase mb-3 text-slate-900 border-b-2 border-slate-900 pb-2 inline-block" style={headerStyle}>
                             <FullEditable value={sectionTitles.summary} onChange={(v: string) => setSectionTitles(p => ({...p, summary: v}))} />
                         </h3>
                         <FullEditable multiLine value={content.summary} style={bodyStyle} onChange={(v:string)=>handleUpdateWithHistory({...content, summary:v})} />
                     </section>
                 )}
                 
                 {(pageExps.length > 0) && (
                     <section>
                         {shouldShowHeader(pageExps, content.experiences, 'work', pageIdx) && 
                             <h3 className="font-black uppercase mb-6 text-slate-900 border-b-2 border-slate-900 pb-2 inline-block" style={headerStyle}>
                                 <FullEditable value={sectionTitles.experience} onChange={(v: string) => setSectionTitles(p => ({...p, experience: v}))} />
                             </h3>
                         }
                         {pageExps.map((e) => <ExperienceItem key={e.id} exp={e} bodyStyle={bodyStyle} type="work"/>)}
                     </section>
                 )}
                 
                 {(pageProjs.length > 0) && (
                     <section>
                         {shouldShowHeader(pageProjs, content.schoolProjects, 'project', pageIdx) && 
                             <h3 className="font-black uppercase mb-6 text-slate-900 border-b-2 border-slate-900 pb-2 inline-block" style={headerStyle}>
                                 <FullEditable value={sectionTitles.projects} onChange={(v: string) => setSectionTitles(p => ({...p, projects: v}))} />
                             </h3>
                         }
                         {pageProjs.map((p) => <ExperienceItem key={p.id} exp={p} bodyStyle={bodyStyle} type="project"/>)}
                     </section>
                 )}
                 
                 {(pageVols.length > 0) && (
                     <section>
                         {shouldShowHeader(pageVols, content.volunteer, 'volunteer', pageIdx) && 
                             <h3 className="font-black uppercase mb-6 text-slate-900 border-b-2 border-slate-900 pb-2 inline-block" style={headerStyle}>
                                 <FullEditable value={sectionTitles.volunteering} onChange={(v: string) => setSectionTitles(p => ({...p, volunteering: v}))} />
                             </h3>
                         }
                         {pageVols.map((v) => <ExperienceItem key={v.id} exp={v} bodyStyle={bodyStyle} type="volunteer"/>)}
                     </section>
                 )}
                 
                 {isLastPage && <ReferenceSection bodyStyle={bodyStyle} headerStyle={headerStyle} />}
                 {/* Removed BottomActions */}
            </div>
        </div>
      );
  };

  const PortfolioLayout = ({ pageIdx }: { pageIdx: number }) => {
    return (
        <div className="a4-page-content theme-portfolio flex flex-col" style={{ padding: '20mm', fontFamily: activeFont }}>
            <div className="flex justify-between items-center mb-8 border-b-2 pb-2" style={{ borderColor: currentThemeHex }}>
                <FullEditable 
                    tagName="h2" 
                    value={customTitles.portfolio}
                    className="text-xl font-black uppercase tracking-widest" 
                    style={{ color: currentThemeHex }} 
                    onChange={(v: string) => setCustomTitles({...customTitles, portfolio: v})} 
                />
            </div>
            
            <div className="grid grid-cols-2 gap-x-8 gap-y-10">
                {portfolioData.projects.slice(0, 4).map((p) => (
                    <div key={p.id} className="break-inside-avoid">
                        <div className="aspect-[4/3] bg-slate-50 rounded-lg overflow-hidden border border-slate-200 mb-4 shadow-sm relative flex items-center justify-center">
                            {p.originalMimeType.startsWith('image/') ? <img src={`data:${p.originalMimeType};base64,${p.base64Data}`} className="w-full h-full object-contain"/> : <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-50 font-bold text-[10px] uppercase tracking-widest">Document</div>}
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 mb-2 leading-tight">{p.title}</h3>
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-4">{p.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
  };

  const CoverLetterPreview = ({ pageIdx }: { pageIdx: number }) => {
    const settings = allPageSettings[100] || DEFAULT_SETTINGS;
    const bodyStyle = { fontSize: `${settings.fontSize}pt`, lineHeight: settings.lineHeight };
    const isElegant = clLayout === 'elegant';
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === coverLetterPageCount - 1;

    return (
        <div className="a4-page-content theme-coverletter h-full flex flex-col" style={{ padding: `${settings.margin}mm`, fontFamily: activeFont }}>
            {isFirstPage && (
                <header className={`mb-8 ${isElegant ? 'text-center border-b pb-6 border-slate-100' : ''}`}>
                    <FullEditable tagName="h1" value={content.fullName} style={{ fontSize: `${settings.nameSize}pt`, fontWeight: 900, color: isElegant ? currentThemeHex : '#0f172a', lineHeight: 1.1 }} onChange={(v: string) => handleUpdateWithHistory({...content, fullName: v})} />
                    <FullEditable tagName="h2" value={content.jobTitle || 'Job Title'} style={{ fontSize: `${parseFloat(bodyStyle.fontSize) + 2}pt`, fontWeight: 600, color: isElegant ? '#0f172a' : currentThemeHex, marginTop: '4px' }} onChange={(v: string) => handleUpdateWithHistory({...content, jobTitle: v})} />
                    <FullEditable tagName="p" value={content.contactInfo} className={`text-slate-500 font-bold uppercase tracking-widest text-[9pt] mt-2 ${isElegant ? 'justify-center' : ''}`} onChange={(v: string) => handleUpdateWithHistory({...content, contactInfo: v})} />
                </header>
            )}
            
            {isFirstPage && (
                <div className="mb-6 text-[10pt] text-slate-800">
                    <div className="mb-4 font-bold text-slate-400 text-xs uppercase tracking-widest">{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    <div className="mb-4 font-black text-sm uppercase tracking-wider text-indigo-600 border-b border-indigo-100 pb-1 inline-block">
                        RE: <FullEditable value={content.targetJobTitle || 'Job Application'} onChange={(v: string) => handleUpdateWithHistory({...content, targetJobTitle: v})} />
                    </div>
                    <div className="space-y-1"><FullEditable value={content.recipientName || 'Hiring Manager'} className="font-black" onChange={(v: string) => handleUpdateWithHistory({...content, recipientName: v})} /><FullEditable value={content.targetCompany || 'Target Company'} className="font-medium" onChange={(v: string) => handleUpdateWithHistory({...content, targetCompany: v})} /><FullEditable value={content.targetAddress || ''} placeholder="Company Address" className="text-slate-500" onChange={(v: string) => handleUpdateWithHistory({...content, targetAddress: v})} /></div>
                </div>
            )}

            <div className="flex-grow relative">
                 <FullEditable 
                    multiLine 
                    value={clPages[pageIdx] || (isFirstPage ? 'Dear Hiring Manager...' : '')} 
                    style={bodyStyle} 
                    onChange={(v: string) => handleUpdateCoverLetterPage(pageIdx, v)} 
                    className="min-h-[200px]"
                    placeholder={isFirstPage ? "Write your cover letter..." : "Additional text..."}
                 />
            </div>

            {isLastPage && (
                <div className="mt-8"><p className="font-bold text-[10pt] mb-4 text-slate-900">Sincerely,</p>{isElegant && <div className="font-['Dancing_Script'] text-3xl text-slate-800 mb-2">{content.fullName}</div>}<FullEditable value={content.fullName} className="font-black text-[12pt] text-slate-900" onChange={() => {}} /></div>
            )}
        </div>
    );
  };

  return (
    <div className="w-full flex-grow min-h-0 bg-white flex flex-col lg:flex-row border-t border-slate-200 relative overflow-hidden">
      <FloatingToolbar />
      {/* Mobile Settings Toggle */}
      <button 
        onClick={() => setShowMobileSettings(true)}
        className="lg:hidden fixed bottom-6 right-6 z-[60] w-14 h-14 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center animate-fade-in hover:scale-110 transition-transform no-print"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </button>

      {/* Sidebar (Responsive) */}
      <aside className={`
        w-full lg:w-[380px] lg:flex-shrink-0 bg-white border-r border-slate-100 flex flex-col
        fixed lg:static z-50 lg:z-30 no-print
        transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${showMobileSettings ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
        bottom-0 lg:bottom-auto left-0 lg:left-auto h-[85vh] lg:h-full rounded-t-[2.5rem] lg:rounded-none shadow-[0_-20px_60px_rgba(0,0,0,0.15)] lg:shadow-none border-t lg:border-t-0 border-slate-200 lg:border-none
      `}>
                  <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar">
         <div className="p-8 flex flex-col min-h-0">
         {/* Mobile Handle */}
         <div className="lg:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8" onClick={() => setShowMobileSettings(false)}></div>
         
                  {onBack && (
          <div className="flex-shrink-0">
            <button onClick={onBack} className="hidden lg:flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors mb-8 group">
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Back to Analysis</span>
            </button>
          </div>
         )}

         <div className="lg:hidden flex justify-between items-center mb-8">
             <h2 className="text-xl font-black text-slate-900 tracking-tight">Editor Settings</h2>
             <button onClick={() => setShowMobileSettings(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">×</button>
         </div>

         <div className="space-y-12">
          <div className="space-y-6">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">
              {activeTab === 'resume' ? (t.resumeLayouts || 'Resume Layouts') : 'Cover Letter Layouts'}
            </h2>
            <div className={`grid ${activeTab === 'resume' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {activeTab === 'resume' ? (
                RESUME_TEMPLATES.map(opt => (
                  <button key={opt.value} onClick={() => handleSetTemplate(opt.value)} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 ${currentTemplate === opt.value ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-white border-slate-50 text-slate-400 hover:border-indigo-200'}`}>
                    <span className="text-[11px] font-black">{opt.name}</span>
                    <span className="text-[8px] opacity-70 font-medium leading-tight">{opt.description}</span>
                  </button>
                ))
              ) : (
                CL_TEMPLATES.map(opt => (
                  <button key={opt.value} onClick={() => setClLayout(opt.value as any)} className={`p-5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center ${clLayout === opt.value ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-white border-slate-50 text-slate-400 hover:border-indigo-100'}`}>
                    <span className="text-[12px] font-black uppercase tracking-wider">{opt.name} {opt.description}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          
          <div className="space-y-6 pt-6 border-t border-slate-50">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">{t.fontSelection || 'Font Selection'}</h2>
            <div className="grid grid-cols-2 gap-3">
               {FONT_OPTIONS.map(f => (
                 <button key={f.name} onClick={() => setActiveFont(f.value)} className={`py-4 rounded-xl border-2 transition-all text-[11px] font-black ${activeFont === f.value ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-50 text-slate-400 hover:border-indigo-100'}`} style={{ fontFamily: f.value }}>
                   {f.name}
                 </button>
               ))}
            </div>
          </div>
          <div className="space-y-10 pt-6 border-t border-slate-50">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Fine-tune View</h2>
            <div className="space-y-5 px-2">
              {[{ label: 'Margins', key: 'margin', unit: 'MM', min: 5, max: 40, step: 1 }, { label: 'Name Size', key: 'nameSize', unit: 'PT', min: 18, max: 60, step: 1 }, { label: 'Header Size', key: 'headerSize', unit: 'PT', min: 8, max: 18, step: 1 }, { label: 'Font Size', key: 'fontSize', unit: 'PT', min: 8, max: 14, step: 0.5 }, { label: 'Line Spacing', key: 'lineHeight', unit: '', min: 1.0, max: 2.0, step: 0.1 }, { label: 'Avatar Size', key: 'avatarSize', unit: 'px', min: 40, max: 200, step: 5 }].map(slider => (
                <div key={slider.key} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{slider.label}</label>
                    <div className="bg-indigo-50 px-4 py-1.5 rounded-lg text-[10px] font-black text-indigo-600 flex items-center gap-1 min-w-[60px] justify-center"><span>{(currentSettings as any)[slider.key]}</span>{slider.unit && <span className="opacity-50 ml-1">{slider.unit}</span>}</div>
                  </div>
                  <input type="range" min={slider.min} max={slider.max} step={slider.step} value={(currentSettings as any)[slider.key]} onChange={(e) => updateSettings({ [slider.key]: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                </div>
              ))}
            </div>
          </div>
          
          <div className="pt-6 border-t border-slate-50">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest text-center mb-4">Theme Colour</h2>
            <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
                <div className="flex flex-wrap justify-center gap-3">
                    {(Object.keys(COLORS) as Array<keyof typeof COLORS>).map(c => (
                        <button
                            key={c}
                            onClick={() => handleSetThemeColor(c)}
                            className={`w-9 h-9 rounded-full transition-all duration-300 relative flex items-center justify-center ${portfolioData.theme.color === c ? 'scale-110 shadow-lg ring-2 ring-offset-2 ring-indigo-100' : 'hover:scale-110 hover:shadow-md'}`}
                            style={{ backgroundColor: COLORS[c] }}
                        >
                            {portfolioData.theme.color === c && <span className="text-white text-xs">✓</span>}
                        </button>
                    ))}
                    <div className={`relative w-9 h-9 rounded-full overflow-hidden transition-all duration-300 cursor-pointer group ${!COLORS[portfolioData.theme.color as keyof typeof COLORS] ? 'ring-2 ring-offset-2 ring-indigo-100 scale-110' : 'hover:scale-110'}`}>
                        <div className="absolute inset-0 bg-[conic-gradient(at_center,_red,_orange,_yellow,_green,_blue,_indigo,_violet)] opacity-80 group-hover:opacity-100 transition-opacity"></div>
                        <input
                            type="color"
                            value={currentThemeHex}
                            onChange={(e) => handleSetThemeColor(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        {!COLORS[portfolioData.theme.color as keyof typeof COLORS] && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white text-xs drop-shadow-md">✓</div>
                        )}
                    </div>
                </div>
            </div>
          </div>
          
          <div className="space-y-6 pt-6 border-t border-slate-50">
             <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">Document Structure</h2>
             <div className="flex flex-col gap-3">
                 <div className="flex gap-2">
                     <button onClick={handleAddPage} className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white hover:shadow-md transition-all">+ Add Page</button>
                     <button onClick={handleRemovePage} className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white hover:shadow-md transition-all">- Remove Page</button>
                 </div>
                 {activeTab === 'resume' && (
                     <>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${showPortfolio ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                <span className="text-xs font-bold text-slate-600">Portfolio Highlights</span>
                            </div>
                            {portfolioData.projects.length > 0 ? (
                                <button onClick={() => setShowPortfolio(!showPortfolio)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${showPortfolio ? 'bg-white text-emerald-600 shadow-sm' : 'bg-slate-200 text-slate-500'}`}>{showPortfolio ? 'ON' : 'OFF'}</button>
                            ) : (
                                <button onClick={handleAddPortfolio} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-md hover:bg-indigo-700 transition-all">+ Add</button>
                            )}
                        </div>
                        <button onClick={onOpenHistory} className="w-full py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            View History
                        </button>
                     </>
                 )}
             </div>
             <p className="text-[10px] text-center text-slate-400">Pages: {activeTab === 'coverLetter' ? coverLetterPageCount : resumePageCount + (showPortfolio ? 1 : 0)}</p>
         </div>

          <div className="pt-8 space-y-3 pb-8 lg:pb-0">
             <div className="flex gap-2 mb-2 justify-center">
                 <button onClick={handleUndo} disabled={undoStack.length === 0} className="p-3 bg-slate-100 rounded-lg text-slate-600 disabled:opacity-30 hover:bg-slate-200 transition-all font-bold text-xs" title="Undo (Ctrl+Z)">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                 </button>
                 <button onClick={handleRedo} disabled={redoStack.length === 0} className="p-3 bg-slate-100 rounded-lg text-slate-600 disabled:opacity-30 hover:bg-slate-200 transition-all font-bold text-xs" title="Redo (Ctrl+Shift+Z)">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                 </button>
             </div>
             <button onClick={() => {
               if (isEditing) saveToHistory(true);
               setIsEditing(!isEditing);
             }} className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all ${isEditing ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100' : 'bg-slate-900 text-white hover:bg-black shadow-lg'}`}>{isEditing ? (t.saveChanges || 'Save Changes') : (t.editContent || 'Edit Content')}</button>
             <button onClick={handleExportPDF} disabled={isExporting} className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50">
               {isExporting ? (t.analyzing || 'Generating...') : (t.intDownloadPdf || 'Download PDF')}
             </button>
             {onBack && (
                 <button onClick={onBack} className="w-full py-4 rounded-2xl bg-white border-2 border-slate-100 text-slate-400 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 hover:text-slate-600 hover:border-slate-200 transition-all">
                    Create New Resume
                 </button>
             )}
          </div>
         </div>
         </div>
         <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
      </div>
      </aside>

      {/* Main Content Area */}
      <section className="flex-grow min-h-0 flex flex-col bg-[#f8fafc] relative">
        <div className="w-full flex justify-center py-6 z-40 bg-[#f8fafc]/90 backdrop-blur-sm border-b border-slate-200/50 shrink-0">
           <div className="bg-white p-1.5 rounded-full border border-slate-200 shadow-sm flex gap-1 no-print">
              <button onClick={() => setActiveTab('resume')} className={`px-8 md:px-12 py-2.5 rounded-full text-[10px] font-black tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'resume' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-indigo-600'}`}>{t.resume || 'RESUME'}</button>
              <button onClick={() => setActiveTab('coverLetter')} className={`px-8 md:px-12 py-2.5 rounded-full text-[10px] font-black tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'coverLetter' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-indigo-600'}`}>{t.coverLetter || 'COVER LETTER'}</button>
           </div>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar px-4 md:px-16 py-8 flex flex-col items-center relative">
          <div className="w-full flex justify-center pb-20" style={{ transform: isExporting ? 'none' : `scale(${zoom})`, transformOrigin: 'top center' }}>
           <div ref={previewRef} className="a4-desk">
              {activeTab === 'resume' ? (
                <>
                    {Array.from({ length: resumePageCount }).map((_, idx) => (
                      <div key={idx} className="relative group">
                        <div className="absolute -left-12 top-0 text-slate-300 font-black text-4xl opacity-50 select-none no-print hidden lg:block">0{idx+1}</div>
                        <div className="a4-page shadow-2xl">
                            {currentTemplate === 'Professional' ? <ProfessionalLayout pageIdx={idx} /> : 
                            currentTemplate === 'Creative' ? <CreativeLayout pageIdx={idx} /> :
                            currentTemplate === 'Academic' ? <AcademicLayout pageIdx={idx} /> :
                            currentTemplate === 'Grid' ? <GridLayout pageIdx={idx} /> :
                            <MinimalistLayout pageIdx={idx} />}
                        </div>
                        {resumePageCount > 1 && (
                            <div className="absolute top-4 right-4 z-50 no-print opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleDeletePage(idx)} className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold border border-rose-100 hover:bg-rose-100 shadow-sm">REMOVE PAGE</button>
                            </div>
                        )}
                      </div>
                    ))}
                    {showPortfolio && (
                      <div className="relative group">
                          <div className="a4-page shadow-2xl relative z-0">
                             <PortfolioLayout pageIdx={resumePageCount} />
                          </div>
                          <div className="absolute top-6 right-6 z-[500] no-print opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <button onClick={(e) => handleRemovePortfolio(e)} className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black border border-rose-700 shadow-md transform hover:scale-105 transition-all">REMOVE PAGE</button>
                          </div>
                      </div>
                    )}
                </>
              ) : (
                <>
                    {Array.from({ length: coverLetterPageCount }).map((_, idx) => (
                      <div key={idx} className="relative group">
                        <div className="absolute -left-12 top-0 text-slate-300 font-black text-4xl opacity-50 select-none no-print hidden lg:block">0{idx+1}</div>
                        <div className="a4-page shadow-2xl animate-fade-in">
                            <CoverLetterPreview pageIdx={idx} />
                        </div>
                        {coverLetterPageCount > 1 && (
                            <div className="absolute top-4 right-4 z-50 no-print opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleDeletePage(idx)} className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold border border-rose-100 hover:bg-rose-100 shadow-sm">REMOVE PAGE</button>
                            </div>
                        )}
                      </div>
                    ))}
                </>
              )}
           </div>
        </div>
        
        </div>
      </section>

      <div className="fixed bottom-24 right-6 md:bottom-10 md:right-10 flex items-center bg-white border border-slate-200 p-2 rounded-2xl shadow-2xl gap-3 z-[50] no-print">
         <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="w-10 h-10 rounded-xl hover:bg-slate-50 font-black text-slate-500 transition-colors">-</button>
         <span className="text-[11px] font-black text-indigo-600 min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
         <button onClick={() => setZoom(z => Math.min(1.2, z + 0.1))} className="w-10 h-10 rounded-xl hover:bg-slate-50 font-black text-slate-500 transition-colors">+</button>
      </div>

      {showHistoryPool && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 no-print animate-fade-in">
           <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Experience Management</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Select from history or add a new role</p>
                 </div>
                 <button onClick={() => setShowHistoryPool(false)} className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all font-bold text-xl flex items-center justify-center shadow-sm">&times;</button>
              </div>
              <div className="p-8 overflow-y-auto custom-scrollbar flex-grow bg-slate-50/30">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-8">
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-4">Add Custom Item</h4>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                          <input type="text" placeholder="Role / Title" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" value={newItem.role} onChange={e => setNewItem({...newItem, role: e.target.value})} />
                          <input type="text" placeholder="Company / School" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" value={newItem.company} onChange={e => setNewItem({...newItem, company: e.target.value})} />
                          <input type="text" placeholder="Time (e.g. 2021 - Present)" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" value={newItem.period} onChange={e => setNewItem({...newItem, period: e.target.value})} />
                          <div className="flex items-center gap-4 px-1">
                              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="itemType" checked={newItem.type === 'work'} onChange={() => setNewItem({...newItem, type: 'work'})} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-bold text-slate-600">Work</span></label>
                              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="itemType" checked={newItem.type === 'project'} onChange={() => setNewItem({...newItem, type: 'project'})} className="w-4 h-4 text-amber-500 focus:ring-amber-500" /><span className="text-sm font-bold text-slate-600">Project</span></label>
                              <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="itemType" checked={newItem.type === 'volunteer'} onChange={() => setNewItem({...newItem, type: 'volunteer'})} className="w-4 h-4 text-emerald-500 focus:ring-emerald-500" /><span className="text-sm font-bold text-slate-600">Volunteer</span></label>
                          </div>
                      </div>
                      <textarea placeholder="Description (Enter to separate bullets)" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 resize-none mb-4" rows={3} value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} />
                      <button onClick={handleAddNewFromModal} disabled={!newItem.role} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">ADD NEW EXPERIENCE</button>
                  </div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Experience Pool</h4>
                  <div className="space-y-3">
                     {[...(allOriginalExperiences || []), ...(allOriginalVolunteer || [])]
                        .filter(orig => !content.experiences?.some(curr => curr.id === orig.id) && !content.volunteer?.some(curr => curr.id === orig.id))
                        .map(exp => (
                        <div key={exp.id} className="group p-5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all cursor-pointer flex justify-between items-center">
                           <div><h5 className="font-bold text-slate-900">{exp.role}</h5><p className="text-xs font-bold text-slate-400 uppercase">{exp.company} • {exp.period}</p></div>
                           <div className="flex gap-2">
                               <button onClick={() => handleUpdateWithHistory({ ...content, experiences: [...(content.experiences || []), exp] })} className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase hover:bg-indigo-100">ADD WORK</button>
                               <button onClick={() => handleUpdateWithHistory({ ...content, schoolProjects: [...(content.schoolProjects || []), exp] })} className="px-3 py-2 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase hover:bg-amber-100">ADD PROJ</button>
                               <button onClick={() => handleUpdateWithHistory({ ...content, volunteer: [...(content.volunteer || []), exp] })} className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-100">ADD VOL</button>
                           </div>
                        </div>
                     ))}
                  </div>
              </div>
           </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .bullet-list-ul { list-style-type: none; padding-left: 0; margin-top: 8px; text-align: left; }
        .bullet-list-ul li { position: relative; padding-left: 1.5em; margin-bottom: 6px; text-align: left; }
        .bullet-list-ul li::before { content: "•"; position: absolute; left: 0.2em; color: ${currentThemeHex}; font-weight: 900; font-size: 1.2em; line-height: 1; top: 0.1em; }
        [contenteditable][data-placeholder]:empty:before { content: attr(data-placeholder); color: #cbd5e1; font-style: italic; pointer-events: none; }
      `}} />
    </div>
  );
};
