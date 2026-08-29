
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileText, Mail, Briefcase, TrendingUp, Mic, Download, Globe, CircleDollarSign } from 'lucide-react';
import { InputSection } from './components/InputSection';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { ResumePreview } from './components/ResumePreview';
import { ProjectDisplay } from './components/ProjectDisplay'; 
import { AIChatbot } from './components/AIChatbot';
import { PortfolioGenerator } from './components/PortfolioGenerator'; 
import { MockInterview } from './components/MockInterview'; 
import { CareerPathPredictor } from './components/CareerPathPredictor';
import CareerAgent from './components/CareerAgent';
import { AnalysisResult, ResumeContent, JobMarket, Language, PortfolioData, Project, ApplicationWithJob } from './types';
import { analyzeResume, analyzeProjectMedia, generatePortfolioBio, FileInput } from './services/geminiService';
import { supabase, authedFetch } from './services/supabaseClient';
import { TRANSLATIONS, LANGUAGES } from './constants';
import { PricingModal } from './components/PricingModal';
import { CREDIT_COSTS, DAILY_FREE_CREDITS } from './credits';

// --- Error Boundary Component ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-slate-50">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-4xl mb-6">⚠️</div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 uppercase tracking-tighter">Something went wrong</h1>
          <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium leading-relaxed">The application encountered an unexpected error. Please try refreshing the page.</p>
          <pre className="text-[10px] bg-slate-900 text-slate-400 p-6 rounded-2xl max-w-2xl overflow-x-auto text-left mb-8 shadow-2xl border border-white/5">{this.state.error?.message}</pre>
          <button onClick={() => window.location.reload()} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl">Refresh Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [jdText, setJdText] = useState(''); 
  const [loadingCount, setLoadingCount] = useState(0);
  const loading = loadingCount > 0;
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [resumeContent, setResumeContent] = useState<ResumeContent | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  /**
   * Which job market the user is applying into — not which language they read.
   *
   * These are different questions and conflating them harms exactly the people
   * this product is for: a Chinese speaker applying in Melbourne needs a
   * Chinese-language interface and a Western resume. A Chinese resume normally
   * carries a photo and an age; an Australian one that does is discriminatory
   * to ask for and marks the candidate down. One setting cannot serve both, so
   * the market is chosen separately and the language switcher is untouched.
   */
  const [market, setMarket] = useState<JobMarket | null>(() => {
    try {
      const saved = localStorage.getItem('market');
      return saved === 'CN' || saved === 'AU' ? saved : null;
    } catch { return null; }
  });

  useEffect(() => {
    try {
      if (market) localStorage.setItem('market', market);
    } catch { /* private mode */ }
  }, [market]);

  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('lang') as Language | null;
      if (saved && TRANSLATIONS[saved]) return saved;
      // Set per deployment (DEFAULT_LANG), so one instance can open in Chinese
      // and another in English without either being a separate build.
      const fromServer = (window as any).__DEFAULT_LANG__ as Language | undefined;
      return fromServer && TRANSLATIONS[fromServer] ? fromServer : 'en';
    } catch (e) {
      return 'en';
    }
  });

  // History version restoration state
  const [historySnapshot, setHistorySnapshot] = useState<any>(null);
  
  const [activeModule, setActiveModule] = useState<'resume' | 'portfolio' | 'interview' | 'career' | 'agent'>('resume');
  // Set when an interview is started from a Career Agent application, so the
  // saved transcript links back to it. Cleared when leaving the Interview
  // module so a later standalone interview is not misattributed.
  const [interviewApplicationId, setInterviewApplicationId] = useState<number | null>(null);
  const [lastResumeInput, setLastResumeInput] = useState<{ mimeType: string; data: string } | string | undefined>();
  const [coachTrigger, setCoachTrigger] = useState<{ role: string; timestamp: number } | null>(null);

  // --- History State (Moved to Global) ---
  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(() => {
    if (typeof window !== 'undefined') {
        try {
            return localStorage.getItem('showHistoryDrawer') === 'true';
        } catch (e) {
            return false;
        }
    }
    return false;
  });
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showHistorySavedModal, setShowHistorySavedModal] = useState(false);
  const [dontShowHistoryReminder, setDontShowHistoryReminder] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('dont_show_history_reminder') === 'true';
    }
    return false;
  });
  
  // Unified history data for modules
  const [careerData, setCareerData] = useState<any>(null);
  const [interviewData, setInterviewData] = useState<any>(null);
  const [lastResumeSettings, setLastResumeSettings] = useState<any>(null);

  const saveGlobalHistory = async (silent = false) => {
    try {
        const snapshot = {
            resumeContent: resumeContent,
            portfolioData: portfolioData,
            careerData: careerData,
            interviewData: interviewData,
            uiSettings: lastResumeSettings
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
              handleHistorySaveSuccess();
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
          handleHistorySaveSuccess();
        }
    } catch (err: any) {
        console.error("Global Save Error:", err);
    }
  };

  useEffect(() => {
      try {
          localStorage.setItem('showHistoryDrawer', String(showHistoryDrawer));
      } catch (e) {}
  }, [showHistoryDrawer]);

  // --- Animation State ---
  const [isLogoAnimating, setIsLogoAnimating] = useState(false);

  // --- Auth & Profile State ---
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState<number>(0);
  const [isInfinite, setIsInfinite] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const [loginMessage, setLoginMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const loginModalRef = useRef<HTMLDivElement>(null);

  const fetchCredits = useCallback(async (currentUser: any) => {
    if (!currentUser?.id) return;
    try {
      const res = await authedFetch('/api/user-stats', { cache: 'no-store' });
      if (!res.ok) {
        console.error('Failed to fetch credits:', res.status, await res.text());
        return;
      }
      const data = await res.json();
      setCredits(data.credits ?? 0);
      setIsInfinite(!!data.isInfinite);

      if (data.bonusApplied) {
        const msg = lang === 'zh'
          ? `每日福利：已为您自动补充至 ${DAILY_FREE_CREDITS} 个积分！`
          : `Daily Bonus: Your credits have been topped up to ${DAILY_FREE_CREDITS}!`;
        setLoginMessage({ text: msg, type: 'success' });
        setTimeout(() => setLoginMessage(null), 5000);
      }
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
    }
  }, [lang]);

  /**
   * Gate an action before doing any work. Purely a check — nothing is spent
   * here, because the balance must not move until the user has something to
   * show for it.
   */
  const ensureCredits = async (amount: number): Promise<boolean> => {
    if (!user) {
      setIsLoginModalOpen(true);
      return false;
    }
    if (isInfinite) return true;
    if (credits < amount) {
      setPricingMessage(
        lang === 'zh'
          ? `积分不足：此操作需要 ${amount} 个积分，您当前有 ${credits} 个。`
          : `Not enough credits: this needs ${amount}, you have ${credits}.`
      );
      setIsPricingModalOpen(true);
      return false;
    }
    return true;
  };

  /**
   * Charge for work that has already succeeded. Called after the AI returns,
   * never before: a failed or timed-out request must not cost anything.
   */
  const spendCredits = async (amount: number): Promise<void> => {
    if (!user || isInfinite) return;
    try {
      const res = await authedFetch('/api/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.remaining);
      } else {
        // The work is already delivered; re-sync rather than punishing the user.
        console.error('Deduct failed:', res.status);
        fetchCredits(user);
      }
    } catch (err) {
      console.error('Failed to deduct credits:', err);
    }
  };

  // --- Portfolio & Share State ---
  const getInitialShareId = () => {
      if (typeof window === 'undefined') return null;
      const hash = window.location.hash;
      const hashMatch = hash.match(/share\/([^/?#]+)/);
      if (hashMatch) return hashMatch[1];
      const pathMatch = window.location.pathname.match(/share\/([^/?#]+)/);
      if (pathMatch) return pathMatch[1];
      return null;
  };

  const [shareId, setShareId] = useState<string | null>(getInitialShareId());
  const [isSharedView, setIsSharedView] = useState(!!shareId);
  const [sharedLoading, setSharedLoading] = useState(!!shareId);
  const [shareError, setShareError] = useState(false);

  // Handle hash changes for dynamic routing
  useEffect(() => {
    const handleHashChange = () => {
      const newShareId = getInitialShareId();
      setShareId(newShareId);
      setIsSharedView(!!newShareId);
      if (newShareId) {
        setSharedLoading(true);
        setShareError(false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Safety check: if isSharedView is true but shareId is null, reset it
  useEffect(() => {
      if (isSharedView && !shareId) {
          setIsSharedView(false);
          setSharedLoading(false);
      }
  }, [isSharedView, shareId]);

  const [portfolioData, setPortfolioData] = useState<PortfolioData>({
    userProfile: { country: 'AU', role: 'Student', photo: null, bio: '' },
    theme: { color: 'indigo', template: 'Minimalist' }, 
    projects: [],
    healthScore: 0,
    jobPackage: { resume: null, coverLetter: null },
  });

  useEffect(() => {
    document.body.className = lang === 'ar' ? 'rtl' : '';
    try {
      localStorage.setItem('lang', lang);
    } catch (e) {}
  }, [lang]);

  // --- Lock Body Scroll for Editor/Portfolio ---
  useEffect(() => {
    const isFixedMode = (activeModule === 'resume' && showEditor) || activeModule === 'portfolio';
    if (isFixedMode) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [activeModule, showEditor]);

  // --- Supabase Auth Listener ---
  //
  // supabase-js is configured with detectSessionInUrl + PKCE, so it completes
  // the OAuth code exchange itself on load. All the popup / postMessage /
  // polling / manual setSession machinery this used to carry has been removed:
  // it was where every login bug lived.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchCredits(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setCredits(0);
        setIsInfinite(false);
        return;
      }
      if (session?.user) {
        setUser(session.user);
        setIsLoginModalOpen(false);
        if (event === 'SIGNED_IN') {
          fetchCredits(session.user);
          // Strip the auth code out of the address bar once it is spent.
          if (window.location.search.includes('code=')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.hash);
          }
        }
      }
    });

    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
      if (loginModalRef.current && !loginModalRef.current.contains(e.target as Node)) {
        setIsLoginModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [fetchCredits]);

  // --- History Fetching Logic ---
  const fetchHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
        const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
        
        if (!user) {
            setDbHistory(localHist);
            return;
        }

        const { data, error } = await supabase
            .from('resume_history')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
            
        if (error) {
            console.warn("Cloud history fetch failed, using local", error);
            setDbHistory(localHist);
        } else {
            // Merge local and cloud history if needed, or just prefer cloud + local
            // For simplicity, let's just show both, sorted by date
            const dataArr = Array.isArray(data) ? data : [];
            const combined = [...dataArr, ...localHist].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            // Remove duplicates by ID if any
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
            setDbHistory(unique);
        }
    } catch (e) {
        console.error("Fetch History Error", e);
        // Fallback to local
        const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
        setDbHistory(localHist);
    } finally {
        setIsHistoryLoading(false);
    }
  }, [user]);

  const deleteHistoryItem = async (e: React.MouseEvent, id: any) => {
    e.stopPropagation();
    if (!id) return;
    
    const isZh = lang === 'zh';
    const msg = isZh ? '确定要删除这条历史记录吗？' : 'Are you sure you want to delete this history record?';
    if (!confirm(msg)) return;
    
    try {
        const idStr = String(id);
        if (idStr.startsWith('local-')) {
            const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
            const updated = localHist.filter((i: any) => String(i.id) !== idStr);
            localStorage.setItem('resume_history_local', JSON.stringify(updated));
            setDbHistory(prev => prev.filter(i => String(i.id) !== idStr));
        } else {
            const { error } = await supabase.from('resume_history').delete().eq('id', id);
            if (error) throw error;
            
            // Immediate UI update
            setDbHistory(prev => prev.filter(i => String(i.id) !== String(id)));
            // Sync with server
            fetchHistory();
        }
        
        setLoginMessage({ 
            text: isZh ? "记录已删除" : "Record deleted", 
            type: 'success' 
        });
        setTimeout(() => setLoginMessage(null), 2000);
    } catch (err) {
        console.error("Delete History Error", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        alert(isZh ? `删除失败: ${errMsg}` : `Failed to delete: ${errMsg}`);
    }
  };

  const handleHistorySaveSuccess = () => {
    fetchHistory();
    if (!dontShowHistoryReminder) {
        setShowHistorySavedModal(true);
    }
  };

  useEffect(() => {
    if (user) fetchHistory();
  }, [user, fetchHistory]);

  const restoreFromHistory = (item: any) => {
    const isZh = lang === 'zh';
    const msg = isZh ? "要恢复此版本吗？当前未保存的修改将丢失。" : "Restore this version? Current unsaved changes will be lost.";
    
    if (confirm(msg)) {
        try {
            // Check if it's the new complex structure or old simple one
            const snapshot = item.content;
            if (snapshot && typeof snapshot === 'object' && snapshot.resumeContent) {
                console.log("Restoring complex history snapshot", snapshot);
                setResumeContent(JSON.parse(JSON.stringify(snapshot.resumeContent)));
                if (snapshot.portfolioData) setPortfolioData(JSON.parse(JSON.stringify(snapshot.portfolioData)));
                if (snapshot.careerData) setCareerData(JSON.parse(JSON.stringify(snapshot.careerData)));
                if (snapshot.interviewData) setInterviewData(JSON.parse(JSON.stringify(snapshot.interviewData)));
                
                // Explicitly reload current module if needed or just switch to resume
                if (snapshot.careerData && activeModule === 'career') setCareerData(snapshot.careerData);
                if (snapshot.interviewData && activeModule === 'interview') setInterviewData(snapshot.interviewData);

                // Pass the rest of the settings to ResumePreview via snapshot prop
                setHistorySnapshot(snapshot);
            } else {
                console.log("Restoring old history structure", snapshot);
                setResumeContent(JSON.parse(JSON.stringify(snapshot)));
                setHistorySnapshot(null);
            }
            
            setShowEditor(true);
            setActiveModule('resume');
            setShowHistoryDrawer(false);
            
            // Scroll to editor
            setTimeout(() => { 
                const editor = document.getElementById('resume-editor');
                if (editor) editor.scrollIntoView({ behavior: 'smooth' });
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 300);
            
            setLoginMessage({ 
                text: isZh ? "版本已恢复！" : "Version restored successfully!", 
                type: 'success' 
            });
            setTimeout(() => setLoginMessage(null), 3000);
        } catch (e) {
            console.error("Restoration error:", e);
            alert("Failed to restore this version. Data might be corrupted.");
        }
    }
  };

  // --- Auto Sync Logic ---
  useEffect(() => {
      if (!user) return;

      const syncData = async () => {
          const syncPayload = {
              user_id: user.id,
              resume_content: resumeContent,
              portfolio_data: portfolioData,
              last_updated: new Date().toISOString()
          };

          try {
              // Table 'resumes' does not exist in the current Supabase instance.
              // Disabling cloud sync to prevent errors.
              /*
              const { error } = await supabase
                  .from('resumes')
                  .upsert([syncPayload], { onConflict: 'user_id' });
              
              if (error) console.error("Cloud Sync Error:", error.message);
              */
          } catch (e) {
              console.error("Failed to sync with cloud");
          }
      };

      if (resumeContent || portfolioData.projects.length > 0) {
          const timer = setTimeout(syncData, 2000); 
          return () => clearTimeout(timer);
      }
  }, [user, resumeContent, portfolioData]);

  const handleGoogleLogin = async () => {
    setLoginMessage(null);
    try {
      // Plain full-page redirect. supabase-js finishes the PKCE exchange when
      // the browser lands back on the app.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error("Google sign-in failed:", error);
      setLoginMessage({ text: error?.message || 'Could not start Google sign-in.', type: 'error' });
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoadingCount(prev => prev + 1);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      
      if (error) throw error;
      
      setLoginMessage({ text: "Magic link sent! Please check your inbox.", type: 'success' });
      setTimeout(() => setLoginMessage(null), 5000);
      setIsLoginModalOpen(false);
      setEmail('');
    } catch (error: any) {
      setLoginMessage({ text: error.message, type: 'error' });
      setTimeout(() => setLoginMessage(null), 5000);
    } finally {
      setLoadingCount(prev => prev - 1);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsProfileOpen(false);
    setDbHistory([]);
    setResumeContent(null);
    setShowEditor(false);
    setUser(null);
  };

  const handleLanguageChange = (l: Language) => setLang(l);

  useEffect(() => {
      if (shareId) {
          console.log("Fetching shared portfolio for ID:", shareId);
          const fetchShared = async () => {
              try {
                  // Resolved through a security-definer RPC that returns exactly
                  // one row for an exact slug. The table itself is no longer
                  // readable by anonymous visitors, so published portfolios
                  // (which contain names, phone numbers and work history)
                  // cannot be enumerated with the public anon key.
                  const { data, error } = await supabase
                      .rpc('get_shared_portfolio', { p_slug: shareId })
                      .maybeSingle<{ slug: string; content: unknown }>();
                  
                  if (error || !data) {
                      console.error("Shared portfolio fetch error:", error);
                      setShareError(true);
                  }
                  else if (data.content) {
                      const content = data.content as PortfolioData;
                      console.log("Parsed content:", content);
                      if (content && content.userProfile && content.theme) {
                          // Ensure arrays and nested objects exist to prevent render crashes
                          const safeContent: PortfolioData = {
                              ...content,
                              theme: {
                                  color: content.theme.color || 'indigo',
                                  template: content.theme.template || 'Minimalist'
                              },
                              projects: content.projects || [],
                              jobPackage: content.jobPackage || { resume: null, coverLetter: null },
                              healthScore: content.healthScore || 0
                          };
                          setPortfolioData(safeContent);
                      } else {
                          console.error("Malformed shared portfolio content:", content);
                          setShareError(true);
                      }
                  } else {
                      console.error("Shared portfolio data has no content field:", data);
                      setShareError(true);
                  }
              } catch (e) {
                  console.error("Shared portfolio exception:", e);
                  setShareError(true);
              } finally {
                  setSharedLoading(false);
              }
          };
          fetchShared();
      }
  }, [shareId]);

  useEffect(() => {
    const calculateHealthScore = () => {
      let score = 0;
      if (portfolioData.projects.length > 0) {
        score += Math.min(portfolioData.projects.length * 10, 50); 
        const starProjects = portfolioData.projects.filter(p => p.description && p.description.toLowerCase().includes('situation') && p.description.toLowerCase().includes('result'));
        score += Math.min(starProjects.length * 10, 50); 
      }
      setPortfolioData(prev => ({ ...prev, healthScore: Math.min(score, 100) }));
    };
    calculateHealthScore();
  }, [portfolioData.projects]);

  // Enhanced Bio Generation Effect
  useEffect(() => {
      if (isSharedView) return;
      if (!portfolioData.userProfile.bio && (portfolioData.jobPackage.resume || portfolioData.projects.length > 0)) {
          const timer = setTimeout(async () => {
              try {
                 const bioResult = await generatePortfolioBio(portfolioData.projects, portfolioData.jobPackage.resume, lang);
                 setPortfolioData(prev => ({ ...prev, userProfile: { ...prev.userProfile, bio: bioResult.bio, role: bioResult.role } }));
              } catch (e) {}
          }, 2000); 
          return () => clearTimeout(timer);
      }
  }, [portfolioData.projects, portfolioData.jobPackage.resume, isSharedView, lang, portfolioData.userProfile.bio]);

  const handleLogoClick = () => {
    setIsLogoAnimating(true);
    setTimeout(() => setIsLogoAnimating(false), 200); 

    if (isSharedView) { window.history.pushState(null, "", "/"); window.location.reload(); return; }
    setActiveModule('resume');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleModuleChange = (module: typeof activeModule) => {
    // Leaving the interview via the nav means the next interview is a fresh
    // standalone one, not a continuation of the application that opened it.
    if (activeModule === 'interview' && module !== 'interview') setInterviewApplicationId(null);
    setActiveModule(module);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Career Agent -> Interview handoff: load the application's JD and record
   * which application the resulting transcript belongs to. */
  const handlePrepareInterview = (application: ApplicationWithJob) => {
    setJdText(application.job.descriptionText);
    setInterviewApplicationId(application.id);
    setActiveModule('interview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerate = async (resumeInput?: string | FileInput) => {
    console.log('handleGenerate called', { resumeInput: !!resumeInput, loadingCount });
    const input = resumeInput || lastResumeInput;
    if (!input) return;
    
    if (loadingCount > 0) {
      console.log('Already loading, skipping...');
      return;
    }

    // Gate on the balance, but do not spend yet — a failed analysis must be free.
    if (!(await ensureCredits(CREDIT_COSTS.resumeOptimization))) return;

    setLoadingCount(prev => prev + 1);
    setShowEditor(false); 
    setLastResumeInput(input);
    
    try {
      const result = await analyzeResume(jdText, input, lang, 'American', market ?? 'AU');
      await spendCredits(CREDIT_COSTS.resumeOptimization);
      setAnalysisResult(result);
      setCoverLetter(result.coverLetter || '');
      setResumeContent(null); 
      setPortfolioData(prev => ({ ...prev, jobPackage: { resume: result.optimizedResume, coverLetter: result.coverLetter } }));
      setTimeout(() => { 
        const el = document.getElementById('analysis-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' }); 
      }, 300);
    } catch (error: any) { 
      console.error("Analysis Error:", error);
      alert(error?.message || "Analysis failed. You have not been charged."); 
    } 
    finally { 
      console.log('handleGenerate finished');
      setLoadingCount(prev => Math.max(0, prev - 1)); 
    }
  };

  const handleManualStart = () => {
      const emptyResume: ResumeContent = {
          fullName: "Your Name",
          contactInfo: "City, Country | email@example.com | +1 234 567 890",
          summary: "Professional summary goes here. Describe your key strengths, years of experience, and what you bring to the role.",
          technicalSkills: ["Skill 1", "Skill 2", "Skill 3"],
          softSkills: ["Leadership", "Communication"],
          experiences: [
              {
                  id: 'exp-1',
                  role: 'Job Title',
                  company: 'Company Name',
                  period: '2023 - Present',
                  bullets: ['Achievement or responsibility 1', 'Achievement or responsibility 2'],
                  isMatch: false,
              }
          ],
          education: [
              {
                  id: 'edu-1',
                  school: 'University Name',
                  degree: 'Degree / Field of Study',
                  startDate: '2019',
                  endDate: '2023',
                  gpa: '3.8/4.0'
              }
          ],
          references: [],
          volunteer: [],
          schoolProjects: [],
          awards: ["Award or Honour Name"]
      };
      setResumeContent(emptyResume);
      setAnalysisResult(null); 
      setCoverLetter(''); 
      setShowEditor(true); 
      setPortfolioData(prev => ({ ...prev, jobPackage: { resume: emptyResume, coverLetter: null } }));
      setTimeout(() => { document.getElementById('resume-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  };

  const handleGenerateProject = async (fileInput: { mimeType: string; data: string; fileName: string; analysisData?: string; analysisMimeType?: string }, section?: string) => {
    if (!(await ensureCredits(CREDIT_COSTS.portfolioProject))) return;

    setLoadingCount(prev => prev + 1);
    try {
      const newProjectData = await analyzeProjectMedia(fileInput.analysisData || fileInput.data, fileInput.analysisMimeType || fileInput.mimeType, fileInput.fileName, lang);
      await spendCredits(CREDIT_COSTS.portfolioProject);
      const newProject: Project = { 
        id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
        originalFileName: fileInput.fileName, 
        originalMimeType: fileInput.mimeType, 
        base64Data: fileInput.data, 
        section: section || newProjectData.category || 'Visual Design',
        ...newProjectData 
      };
      setPortfolioData(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
    } catch (error: any) { 
      console.error("Project Analysis Error:", error);
      alert(error?.message || "Project analysis failed. You have not been charged."); 
    } 
    finally { setLoadingCount(prev => prev - 1); }
  };

  const handleConfirmExperiences = (selectedIds: string[], selectedVolunteerIds: string[], selectedProjectIds: string[]) => {
      if (!analysisResult || !analysisResult.optimizedResume) return;
      const newResumeContent = { 
          ...analysisResult.optimizedResume, 
          experiences: (analysisResult.optimizedResume.experiences || []).filter(exp => selectedIds.includes(exp.id)), 
          volunteer: (analysisResult.optimizedResume.volunteer || []).filter(vol => selectedVolunteerIds.includes(vol.id)), 
          schoolProjects: (analysisResult.optimizedResume.schoolProjects || []).filter(p => selectedProjectIds.includes(p.id)) 
      };
      setResumeContent(newResumeContent);
      setPortfolioData(prev => ({ ...prev, jobPackage: { resume: newResumeContent, coverLetter: prev.jobPackage.coverLetter } }));
      setShowEditor(true);
      setTimeout(() => { document.getElementById('resume-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
  };

  /**
   * Career Agent -> Resume editor. A tailored resume is generated as an
   * AnalysisResult, which is the same shape the Resume Builder produces, so it
   * can be handed straight to the existing editor rather than needing its own
   * viewer, templates and PDF export.
   */
  const handleOpenTailoredResume = (result: AnalysisResult) => {
    const resume = result.optimizedResume;
    if (!resume) return;
    setResumeContent(resume);
    setPortfolioData(prev => ({
      ...prev,
      jobPackage: { resume, coverLetter: result.coverLetter || prev.jobPackage.coverLetter },
    }));
    setAnalysisResult(result);
    setShowEditor(true);
    setActiveModule('resume');
    setTimeout(() => {
      document.getElementById('resume-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  };

  // Fall back rather than crash: an unrecognised value here (a stale entry in
  // localStorage, a language removed in a later version) previously took down
  // the whole app with "cannot read properties of undefined".
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  if (sharedLoading) return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  );

  if (isSharedView && shareId) {
      if (sharedLoading) return (
        <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">Loading Portfolio...</p>
        </div>
      );

      if (shareError) return (
        <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-4xl mb-6">✕</div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Portfolio Not Found</h1>
            <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium leading-relaxed">The link you followed may be broken or the portfolio has been removed.</p>
            <a href="/" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl">Create Your Own</a>
        </div>
      );

      return (
        <ErrorBoundary>
          <div className="min-h-screen bg-white text-[#0f172a] flex flex-col">
              <header className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all">
                  <div className="max-w-7xl mx-auto w-full px-4 md:px-12">
                      <div className="flex justify-between items-center h-16 md:h-20 relative">
                          <div className="flex items-center gap-3 cursor-pointer group shrink-0 select-none z-50" onClick={() => window.open(window.location.origin, '_blank')}>
                              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl md:rounded-[1.25rem] flex items-center justify-center shadow-lg relative transition-all duration-300 ease-out group-hover:rotate-[15deg] group-hover:scale-110">
                                <svg viewBox="0 0 24 24" className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" fill="white" stroke="white" />
                                </svg>
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center text-xl md:text-3xl font-black tracking-tighter leading-none">
                                  <span className="text-indigo-600 mr-1.5">AI</span>
                                  <span className="italic text-slate-900">Fast</span>
                                  <span className="text-indigo-600 ml-0.5">Resume</span>
                                </div>
                                <span className="hidden sm:block text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/80 leading-none mt-1">ATS Optimised</span>
                              </div>
                          </div>
                          <a href="/" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">Create Your Own</a>
                      </div>
                  </div>
              </header>
              <div className="pt-16 flex-grow">
                 <PortfolioGenerator portfolioData={portfolioData} setPortfolioData={setPortfolioData} onGenerateProject={() => {}} isLoading={false} readOnly={true} lang={lang} />
              </div>
          </div>
        </ErrorBoundary>
      );
  }

  const isEditorMode = (activeModule === 'resume' && showEditor) || activeModule === 'portfolio';

  return (
    <div className={`${isEditorMode ? 'h-screen overflow-hidden' : 'min-h-screen overflow-x-hidden'} ${activeModule === 'career' ? 'bg-[#0b1120]' : 'bg-white'} text-[#0f172a] selection:bg-indigo-100 flex flex-col relative transition-colors duration-500`}>
      {/* --- Header --- */}
      <header className="fixed top-0 w-full z-50 glass-header border-b border-slate-100 shadow-sm transition-all bg-white/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-12">
          
          {/* Main Row: Logo + Desktop Nav + Controls */}
          <div className="flex justify-between items-center h-16 md:h-20 relative">
            {/* Logo */}
            <div className="flex items-center gap-3 cursor-pointer group shrink-0 select-none z-50" onClick={handleLogoClick}>
                <div className={`w-10 h-10 md:w-12 md:h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl md:rounded-[1.25rem] flex items-center justify-center shadow-lg relative transition-all duration-300 ease-out ${isLogoAnimating ? 'scale-90 rotate-[15deg]' : 'group-hover:rotate-[15deg] group-hover:scale-110'}`}>
                  <svg viewBox="0 0 24 24" className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" fill="white" stroke="white" />
                  </svg>
                  {/* Online Status Indicator */}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-[3px] border-white rounded-full shadow-sm z-10" title="Online">
                      <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center text-xl md:text-3xl font-black tracking-tighter leading-none">
                    <span className="text-indigo-600 mr-1.5">AI</span>
                    <span className="italic text-slate-900">Fast</span>
                    <span className="text-indigo-600 ml-0.5">Resume</span>
                  </div>
                  <span className="hidden sm:block text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/80 leading-none mt-1">ATS Optimised</span>
                </div>
            </div>

            {/* Desktop Navigation (Moved back to first row) */}
            <div className="hidden lg:flex items-center bg-indigo-50/50 p-1 rounded-[1.25rem] border border-indigo-100/50 shadow-sm mx-4">
               <button onClick={() => handleModuleChange('resume')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'resume' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.resumeBuilder}</button>
               <button onClick={() => handleModuleChange('portfolio')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'portfolio' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.portfolioAi}</button>
               <button onClick={() => handleModuleChange('interview')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'interview' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.interview}</button>
               <button onClick={() => handleModuleChange('career')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'career' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.careerPath}</button>
               <button onClick={() => handleModuleChange('agent')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'agent' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>Career Agent</button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
               {/* Language Icon Selector */}
               <div className="hidden sm:flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-1 relative group">
                  <div className="p-2 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer">
                     <Globe className="w-4 h-4" />
                  </div>
                  <select 
                     value={lang} 
                     onChange={(e) => handleLanguageChange(e.target.value as Language)} 
                     className="absolute inset-0 opacity-0 cursor-pointer no-print appearance-none"
                  >
                     {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                  </select>
               </div>

               {user ? (
                 <div className="flex items-center gap-2">
                   {/* Unified Pricing & Credits Badge */}
                   <div 
                     className="flex items-center bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100/50 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all group overflow-hidden" 
                     onClick={() => setIsPricingModalOpen(true)}
                   >
                     <div className="px-2.5 py-1.5 border-r border-indigo-100/30 flex items-center gap-1.5 hover:bg-white/50 transition-colors">
                        <div className="w-4 h-4 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:rotate-12 transition-transform">
                           <svg className="w-2.5 h-2.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                           </svg>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700">
                           {isInfinite ? (lang === 'zh' ? '无限' : 'Infinite') : credits}
                        </span>
                     </div>
                     <div className="px-2.5 py-1.5 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all">
                        <CircleDollarSign className="w-4 h-4" />
                     </div>
                   </div>
                   <div className="relative" ref={profileRef}>
                      <div 
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-indigo-100 bg-indigo-50 flex items-center justify-center shadow-sm cursor-pointer hover:scale-105 transition-all no-print"
                      >
                        {user.user_metadata?.avatar_url ? (
                          <img src={user.user_metadata.avatar_url} className="w-full h-full object-cover" alt="User Profile" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-indigo-600 font-bold text-xs md:text-sm">{user.email?.[0].toUpperCase()}</span>
                        )}
                      </div>
                      {isProfileOpen && (
                          <div className="absolute top-[calc(100%+12px)] right-0 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-[100] no-print">
                              <div className="px-3 py-2 border-b border-slate-50 mb-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account</p>
                                  <p className="text-[11px] font-bold text-slate-900 truncate">{user.email}</p>
                              </div>
                              <div className="sm:hidden px-3 py-2 border-b border-slate-50 mb-1 flex items-center justify-between">
                                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Credits</span>
                                  <span className="text-[11px] font-black text-indigo-600">{isInfinite ? (lang === 'zh' ? '无限' : 'Infinite') : credits}</span>
                              </div>
                              <button 
                                onClick={() => setShowHistoryDrawer(true)}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 text-indigo-600 rounded-xl transition-colors text-[11px] font-black uppercase tracking-wider text-left"
                              >
                                {t.history || 'History'}
                              </button>
                              <button 
                                onClick={handleLogout}
                                className="w-full flex items-center gap-2 px-3 py-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors text-[11px] font-black uppercase tracking-wider text-left"
                              >
                                Logout
                              </button>
                          </div>
                      )}
                   </div>
                 </div>
               ) : (
                  <div className="flex items-center gap-2 md:gap-3">
                    {/* Unified Pricing & Credits Badge (Logged Out) */}
                    <div 
                      className="flex items-center bg-slate-50 rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:bg-slate-100 transition-all group overflow-hidden" 
                      onClick={() => setIsPricingModalOpen(true)}
                    >
                      <div className="px-2.5 py-1.5 border-r border-slate-200 flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:rotate-12 transition-transform">
                           <svg className="w-2.5 h-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                           </svg>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">0</span>
                      </div>
                      <div className="px-2.5 py-1.5 text-slate-600 hover:text-indigo-600 transition-colors">
                        <CircleDollarSign className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Login Button */}
                    <button 
                        onClick={() => setIsLoginModalOpen(true)}
                        className="px-4 py-2 md:px-6 md:py-2.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 no-print"
                    >
                        Login
                    </button>
                  </div>
               )}
            </div>
          </div>

          {/* Desktop Navigation (Moved back to first row) */}
          {/* Mobile Navigation Bar */}
          <div className="lg:hidden flex overflow-x-auto gap-2 pb-3 -mx-4 px-4 no-scrollbar items-center border-t border-slate-50 pt-3 md:justify-center md:overflow-visible">
              <div className="flex items-center bg-indigo-50/50 p-1 rounded-2xl border border-indigo-100/50">
                  <button onClick={() => handleModuleChange('resume')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'resume' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.resumeBuilder}</button>
                  <button onClick={() => handleModuleChange('portfolio')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'portfolio' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.portfolioAi}</button>
                  <button onClick={() => handleModuleChange('interview')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'interview' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.interview}</button>
                  <button onClick={() => handleModuleChange('career')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'career' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.careerPath}</button>
                  <button onClick={() => handleModuleChange('agent')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'agent' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>Career Agent</button>
              </div>
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className={`flex flex-col flex-grow w-full max-w-full pt-36 lg:pt-[4.5rem] min-h-0 ${activeModule === 'resume' && !showEditor ? 'pe-10 md:pe-0' : ''} ${((activeModule === 'resume' && showEditor) || activeModule === 'portfolio') ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {activeModule === 'resume' && (
          <div className={`animate-fade-in w-full ${showEditor ? 'flex-grow flex flex-col min-h-0' : 'pt-4 md:pt-12 pb-20'}`}>
             {!showEditor ? (
               <>
                 <InputSection 
                    jdText={jdText} 
                    setJdText={setJdText} 
                    onGenerate={handleGenerate} 
                    onGenerateProject={handleGenerateProject} 
                    isLoading={loading} 
                    lang={lang} 
                    onLanguageDetect={setLang}
                    onManualStart={handleManualStart} 
                    onOpenHistory={() => setShowHistoryDrawer(true)}
                    isLoggedIn={!!user}
                    onOpenModule={handleModuleChange}
                    market={market}
                    onMarketChange={setMarket}
                    historyCount={dbHistory.length}
                    onLogin={() => setIsLoginModalOpen(true)}
                 />
                  {portfolioData.projects.length > 0 && <div className="mt-16 md:mt-24"><ProjectDisplay projects={portfolioData.projects} lang={lang} /></div>}
                  {analysisResult && (
                    <div id="analysis-section" className="mt-16 md:mt-24">
                       <div className="py-16 md:py-24 bg-slate-50 border-y border-slate-100 shadow-inner relative z-10 text-center rounded-[2rem] md:rounded-[3rem] mx-auto overflow-hidden">
                            <h2 className="text-3xl md:text-6xl font-black tracking-tight mb-4">{t.matchScore}</h2>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-8">{t.basedOn}</p>
                            <AnalysisDashboard data={analysisResult} onConfirmExperiences={handleConfirmExperiences} lang={lang} />
                       </div>
                    </div>
                  )}
               </>
             ) : (
               resumeContent && (
                 <div id="resume-editor" className="relative z-0 w-full flex-grow flex flex-col min-h-0">
                    <ResumePreview 
                      content={resumeContent} 
                      allOriginalExperiences={analysisResult?.optimizedResume?.experiences} 
                      allOriginalVolunteer={analysisResult?.optimizedResume?.volunteer} 
                      coverLetter={coverLetter} 
                      missingKeywords={analysisResult?.missingSkills} 
                      jdText={jdText} 
                      onUpdate={setResumeContent} 
                      onUpdateCoverLetter={setCoverLetter} 
                      lang={lang} 
                      portfolioData={portfolioData} 
                      setPortfolioData={setPortfolioData} 
                      onOpenHistory={() => setShowHistoryDrawer(true)} 
                      historySnapshot={historySnapshot}
                      onHistoryRestored={() => setHistorySnapshot(null)}
                      onSaveSuccess={handleHistorySaveSuccess}
                      careerData={careerData}
                      interviewData={interviewData}
                      onSettingsUpdate={setLastResumeSettings}
                      onSaveHistory={() => saveGlobalHistory(true)}
                      isLoggedIn={!!user} 
                      onLogin={() => setIsLoginModalOpen(true)}
                      onBack={() => setShowEditor(false)}
                                          />
                 </div>
               )
             )}
          </div>
        )}
        {activeModule === 'portfolio' && <div className="w-full flex-grow flex flex-col min-h-0"><PortfolioGenerator portfolioData={portfolioData} setPortfolioData={setPortfolioData} onGenerateProject={handleGenerateProject} isLoading={loading} onCancelLoading={() => setLoadingCount(0)} lang={lang} isLoggedIn={!!user} onLogin={() => setIsLoginModalOpen(true)} onSaveHistory={() => saveGlobalHistory(true)} /></div>}
        {activeModule === 'career' && <div className="pt-4 md:pt-0"><CareerPathPredictor projects={portfolioData.projects} resume={portfolioData.jobPackage.resume} onDownloadComplete={(r) => setCoachTrigger({role: r, timestamp: Date.now()})} lang={lang} isLoggedIn={!!user} onLogin={() => setIsLoginModalOpen(true)} onCheckCredits={ensureCredits} onSpendCredits={spendCredits} initialData={careerData} onDataUpdate={setCareerData} onSaveHistory={() => saveGlobalHistory(true)} /></div>}
        {activeModule === 'interview' && <div className="w-full min-h-screen md:h-[calc(100vh-160px)] pt-4 md:pt-0"><MockInterview market={market ?? 'AU'} jdText={jdText} portfolioData={portfolioData} lang={lang} isLoggedIn={!!user} onLogin={() => setIsLoginModalOpen(true)} onCheckCredits={ensureCredits} onSpendCredits={spendCredits} initialData={interviewData} onDataUpdate={setInterviewData} onSaveHistory={() => saveGlobalHistory(true)} applicationId={interviewApplicationId} /></div>}
        {activeModule === 'agent' && <div className="pt-4 md:pt-0"><CareerAgent lang={lang} isLoggedIn={!!user} userId={user?.id ?? null} baseResume={resumeContent} onLogin={() => setIsLoginModalOpen(true)} onCheckCredits={ensureCredits} onSpendCredits={spendCredits} onPrepareInterview={handlePrepareInterview} onOpenTailoredResume={handleOpenTailoredResume} /></div>}
        
        {!((activeModule === 'resume' && showEditor) || activeModule === 'portfolio') && (
          <footer className={`py-6 text-center border-t mt-auto px-6 transition-colors duration-500 ${activeModule === 'career' ? 'bg-[#0b1120] border-white/5' : 'bg-white border-slate-100'}`}>
             <div className="max-w-lg mx-auto w-full space-y-2">
                <p className={`text-[10px] font-medium leading-relaxed transition-opacity ${activeModule === 'career' ? 'text-slate-500/60' : 'text-slate-400/60'}`}>
                  {t.disclaimer}
                </p>
                <div className={`h-px w-12 mx-auto ${activeModule === 'career' ? 'bg-white/5' : 'bg-slate-100'}`}></div>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-default ${activeModule === 'career' ? 'text-slate-600 hover:text-slate-500' : 'text-slate-300 hover:text-slate-400'}`}>
                  Copyright © 2026 AI Fast Resume. All Rights Reserved.
                </p>
             </div>
          </footer>
        )}
      </main>

      {/* --- Global History Drawer --- */}
      {/* The collapsed tab is fixed to the right edge, so on narrow screens it
          used to sit on top of the hero copy. It is slimmer on mobile and the
          page reserves matching space for it (see `pe-10 md:pe-0` on <main>). */}
      {activeModule === 'resume' && (
        <div className={`fixed top-24 right-0 h-[calc(100vh-140px)] z-[2001] transition-all duration-700 flex no-print ${showHistoryDrawer ? 'translate-x-0' : 'translate-x-[calc(100%-2.5rem)] md:translate-x-[calc(100%-3.5rem)]'}`}>
              <button onClick={() => setShowHistoryDrawer(!showHistoryDrawer)} className="w-10 md:w-14 bg-white/95 backdrop-blur-xl h-64 my-auto rounded-s-[2rem] flex flex-col items-center justify-center gap-6 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all group md:hover:w-16 order-1 cursor-pointer">
                  <div style={{ writingMode: 'vertical-rl', textOrientation: ['zh', 'ja', 'ko'].includes(lang) ? 'upright' : 'mixed' }} className={`${['zh', 'ja', 'ko'].includes(lang) ? '' : 'rotate-180'} text-[11px] font-black tracking-[0.5em] uppercase`}>{t.history || 'HISTORY'}</div>
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{dbHistory.length}</div>
              </button>
              <div className="w-80 h-full bg-white border-s border-slate-100 shadow-[-50px_0_100px_rgba(0,0,0,0.05)] flex flex-col order-2">
                  <div className="p-10 border-b border-slate-50 flex justify-between items-end">
                      <div>
                          <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{t.history || 'History'}</h3>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">VERSION CONTROL</p>
                      </div>
                      <button onClick={() => setShowHistoryDrawer(false)} className="text-slate-400 hover:text-slate-900 transition-colors">✕</button>
                  </div>
                  <div className="flex-grow overflow-y-auto custom-scrollbar p-8 space-y-6 bg-slate-50/30">
                      {!user ? (
                          <div className="mb-6 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 text-center">
                              <p className="text-xs font-bold text-indigo-900 mb-3 uppercase tracking-tight">Login Required</p>
                              <p className="text-[10px] text-indigo-600 mb-4 font-medium leading-relaxed">Login with Google to sync and restore your resume versions across devices.</p>
                              <button onClick={() => setIsLoginModalOpen(true)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs">LOGIN NOW</button>
                          </div>
                      ) : isHistoryLoading ? (
                          <div className="flex flex-col items-center justify-center py-20 opacity-20"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                      ) : dbHistory.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full opacity-30 select-none">
                              <p className="text-slate-400 text-lg font-black italic">No records found</p>
                          </div>
                      ) : (
                          dbHistory.map((item, idx) => (
                              <div key={item.id || idx} onClick={() => restoreFromHistory(item)} className="p-6 bg-white border border-slate-100 rounded-3xl hover:border-indigo-500/30 hover:shadow-2xl transition-all cursor-pointer group relative">
                                  <div className="flex justify-between items-start mb-2">
                                      <div>
                                          <div className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Version {dbHistory.length - idx}</div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                              {lang === 'zh' 
                                                  ? `${new Date(item.created_at).getFullYear()}年${new Date(item.created_at).getMonth()+1}月${new Date(item.created_at).getDate()}日 ${String(new Date(item.created_at).getHours()).padStart(2, '0')}:${String(new Date(item.created_at).getMinutes()).padStart(2, '0')}`
                                                  : new Date(item.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { 
                                                      year: 'numeric', month: 'short', day: 'numeric', 
                                                      hour: '2-digit', minute: '2-digit', hour12: false 
                                                  })
                                              }
                                          </div>
                                      </div>
                                      <button 
                                          onClick={(e) => deleteHistoryItem(e, item.id)}
                                          className="p-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 text-slate-300 rounded-lg transition-all"
                                          title="Delete this version"
                                      >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mb-3">
                                      <span className="px-2 py-0.5 bg-slate-50 text-[8px] font-black text-slate-400 rounded uppercase border border-slate-100">Resume</span>
                                      {item.content?.portfolioData && <span className="px-2 py-0.5 bg-indigo-50 text-[8px] font-black text-indigo-400 rounded uppercase border border-indigo-100">Portfolio</span>}
                                      {item.content?.careerData?.result && <span className="px-2 py-0.5 bg-emerald-50 text-[8px] font-black text-emerald-600 rounded uppercase border border-emerald-100">Career</span>}
                                      {item.content?.interviewData?.messages?.length > 0 && <span className="px-2 py-0.5 bg-amber-50 text-[8px] font-black text-amber-600 rounded uppercase border border-amber-100">Interview</span>}
                                      {String(item.id).startsWith('local-') && <span className="px-2 py-0.5 bg-slate-100 text-[8px] font-black text-slate-400 rounded uppercase border border-dashed border-slate-200">Local Only</span>}
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter opacity-60">Restore this snapshot</p>
                                  {idx === 0 && <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-6 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>}
                              </div>
                          ))
                      )}
                  </div>
              </div>
        </div>
      )}

      <AIChatbot portfolioData={portfolioData} resumeContent={resumeContent} jdText={jdText} activeModule={activeModule} coachTrigger={coachTrigger} lang={lang} />
      
      <PricingModal 
          isOpen={isPricingModalOpen} 
          onClose={() => {
              setIsPricingModalOpen(false);
              setPricingMessage(undefined);
          }} 
          userId={user?.id || ''} 
          userEmail={user?.email || ''} 
          message={pricingMessage}
          onLogin={() => {
              setIsPricingModalOpen(false);
              setIsLoginModalOpen(true);
          }}
      />
      
      {/* --- Login Modal --- */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={() => setIsLoginModalOpen(false)}></div>
            <div ref={loginModalRef} className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-8 md:p-12 animate-scale-in">
                <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-6 right-8 text-slate-300 hover:text-slate-900 transition-colors text-xl">✕</button>
                
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-6 relative">
                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" fill="white" stroke="white" />
                        </svg>
                        {/* Online Status Indicator - Added to match brand identity */}
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-[4px] border-white rounded-full shadow-sm z-10">
                            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></span>
                        </div>
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Welcome Back</h2>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Sign in to sync your career data</p>
                </div>

                <div className="space-y-4">
                    <button 
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center gap-4 px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm group"
                    >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Continue with Google
                    </button>

                    <div className="relative flex items-center justify-center py-4">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                        <span className="relative px-4 bg-white text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">or</span>
                    </div>

                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                            <input 
                                type="email" 
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-200 transition-all"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            className="w-full py-4 bg-white border-2 border-slate-900 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all shadow-lg active:scale-95"
                        >
                            Sign in with Email
                        </button>
                    </form>
                </div>
                
                <p className="mt-8 text-[9px] text-slate-400 font-medium text-center leading-relaxed">
                    By continuing, you agree to our <span className="underline cursor-pointer">Terms of Service</span> and <span className="underline cursor-pointer">Privacy Policy</span>.
                </p>
            </div>
        </div>
      )}

      {/* --- History Saved Modal --- */}
      {showHistorySavedModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in" onClick={() => setShowHistorySavedModal(false)}></div>
            <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-10 text-center animate-scale-in">
                <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-200 mx-auto mb-8">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">{lang === 'zh' ? '已存入历史记录' : 'Saved to History'}</h3>
                <p className="text-slate-500 font-medium text-xs uppercase tracking-widest leading-relaxed mb-10">
                    {lang === 'zh' ? '您的修改已自动备份。您随时可以在 History 面板中找回。' : 'Your changes have been automatically backed up. Access them anytime in the History panel.'}
                </p>
                <div className="space-y-4">
                    <button onClick={() => setShowHistorySavedModal(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl">
                        {lang === 'zh' ? '知道了' : 'Got it'}
                    </button>
                    <button 
                        onClick={() => {
                            localStorage.setItem('dont_show_history_reminder', 'true');
                            setDontShowHistoryReminder(true);
                            setShowHistorySavedModal(false);
                        }} 
                        className="w-full py-4 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 hover:text-slate-600 transition-all"
                    >
                        {lang === 'zh' ? '不再提醒' : "Don't show again"}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- Toast Notification --- */}
      {loginMessage && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[4000] animate-bounce-in">
            <div className={`px-8 py-4 rounded-[2rem] shadow-2xl border-2 flex items-center gap-4 backdrop-blur-xl ${loginMessage.type === 'success' ? 'bg-emerald-50/90 border-emerald-100 text-emerald-600' : 'bg-rose-50/90 border-rose-100 text-rose-600'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${loginMessage.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {loginMessage.type === 'success' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                </div>
                <span className="text-xs font-black uppercase tracking-widest">{loginMessage.text}</span>
            </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bounce-in {
          0% { transform: translate(-50%, 100%); opacity: 0; }
          60% { transform: translate(-50%, -20%); opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-scale-in { animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-bounce-in { animation: bounce-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
    </div>
  );
}

export default App;
