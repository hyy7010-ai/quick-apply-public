
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { GenerateContentResponse } from "@google/genai";
import { JobMarket, PortfolioData, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { callGeminiWithRetry, generateContentFromBackend } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { interviewCost } from '../credits';
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Download, RefreshCw, ChevronRight, MessageSquare, Mic, MicOff, Video, VideoOff, Send, X, History, ChevronLeft, Award, Clock } from 'lucide-react';

// Enhanced Message Interface
interface Message {
  role: 'ai' | 'user';
  text: string;
  timestamp: number;
  feedback?: {
    score: number; // 1-10
    pros: string;
    cons: string;
    tips: string;
  };
}

interface InterviewHistoryItem {
    id: string;
    timestamp: number;
    overallScore: number;
    summary: string;
    durationMinutes: number;
    interviewer: string;
    mode: string;
    jdSource: 'sync' | 'custom';
    customJdPreview: string;
    fullJd: string; 
    transcript: Message[];
    reportData?: any;
}

interface MockInterviewProps {
  /** Which market's interview this is rehearsing for. */
  market?: JobMarket;
    jdText?: string;
    portfolioData?: PortfolioData;
    lang?: Language;
    isLoggedIn?: boolean;
    onLogin?: () => void;
    onCheckCredits?: (cost: number) => Promise<boolean>;
    onSpendCredits?: (cost: number) => Promise<void>;
    initialData?: any;
    onDataUpdate?: (data: any) => void;
    onSaveHistory?: (silent: boolean) => void;
    /** Set when this interview was started from a Career Agent application,
     * so the saved transcript can be linked back to it. Null for standalone
     * interviews started from the Interview module directly. */
    applicationId?: number | null;
}

type InterviewerGender = 'female' | 'male';
type Duration = 5 | 10 | 15;

export const MockInterview: React.FC<MockInterviewProps> = ({ 
  market = 'AU',
  jdText: mainPageJd, 
  portfolioData, 
  lang = 'en', 
  isLoggedIn = false, 
  onLogin, 
  onCheckCredits,
  onSpendCredits,
  initialData,
  onDataUpdate,
  onSaveHistory,
  applicationId = null
}) => {
  // Status States
  const [interviewStatus, setInterviewStatus] = useState<'idle' | 'initializing' | 'active' | 'completed'>(initialData?.interviewStatus || 'idle');
  const [aiState, setAiState] = useState<'listening' | 'processing' | 'speaking' | 'idle'>('idle');
  
  // session states
  const [messages, setMessages] = useState<Message[]>(initialData?.messages || []);
  
  // Sync back to parent
  useEffect(() => {
    onDataUpdate?.({
        interviewStatus,
        messages
    });
  }, [interviewStatus, messages, onDataUpdate]);

  // Restore from props
  useEffect(() => {
    if (initialData) {
        if (initialData.interviewStatus !== undefined) setInterviewStatus(initialData.interviewStatus);
        if (initialData.messages !== undefined) setMessages(initialData.messages);
    }
  }, [initialData]);
  const [reportLoading, setReportLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0); 
  const [showHistoryPanel, setShowHistoryPanel] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('interview_history_panel_open') === 'true';
    }
    return false;
  });
  
  useEffect(() => {
      localStorage.setItem('interview_history_panel_open', String(showHistoryPanel));
  }, [showHistoryPanel]);
  
  // Configuration States
  const [duration, setDuration] = useState<Duration>(10);
  const [jdSource, setJdSource] = useState<'sync' | 'custom'>('sync');
  const [customJd, setCustomJd] = useState('');
  const [mode, setMode] = useState<'text' | 'voice' | 'face'>('voice');
  const [interviewerGender, setInterviewerGender] = useState<InterviewerGender>('female');
  const [isMuted, setIsMuted] = useState(false);

  // Session Data States
  const [currentInput, setCurrentInput] = useState('');
  const [history, setHistory] = useState<InterviewHistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<InterviewHistoryItem | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  
  // Real Video Analytics State
  const [attentionScore, setAttentionScore] = useState(0);
  const [expression, setExpression] = useState("Absent");
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<any>(null);
  const isInterviewActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambienceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const reportContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // MediaPipe Refs
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const requestRef = useRef<number>(0);

  const handleDownloadPDF = async () => {
    if (!selectedHistoryItem || !reportContainerRef.current) return;
    
    setIsExporting(true);
    try {
        if (onSaveHistory) onSaveHistory(true);

        const html2pdf = (window as any).html2pdf;
        if (!html2pdf) {
            alert("PDF library not loaded.");
            return;
        }

        const opt = {
          margin: [10, 10],
          filename: `Interview_Report_${Date.now()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(reportContainerRef.current).save();
    } catch (e) {
        console.error(e);
    } finally {
        setIsExporting(false);
    }
  };
  
  // Speech Queue Refs
  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);

  // Refs for closures
  const aiStateRef = useRef(aiState);
  const interviewStatusRef = useRef(interviewStatus);
  const modeRef = useRef(mode);
  const isMutedRef = useRef(isMuted);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const isCJK = ['zh', 'ja', 'ko'].includes(lang);
  const isRtl = lang === 'ar';

  useEffect(() => { aiStateRef.current = aiState; }, [aiState]);
  useEffect(() => { interviewStatusRef.current = interviewStatus; }, [interviewStatus]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);



  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    if (mode !== 'face') return;
    
    let isMounted = true;
    const setupMediaPipe = async () => {
        if (faceLandmarkerRef.current) return;
        try {
            console.log("Initializing MediaPipe FaceLandmarker...");
            const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
            );
            if (!isMounted) return;
            const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "CPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
            if (isMounted) {
                faceLandmarkerRef.current = landmarker;
                console.log("MediaPipe FaceLandmarker initialized successfully.");
            } else {
                landmarker.close();
            }
        } catch (error) {
            console.error("MediaPipe initialization error:", error);
        }
    };
    setupMediaPipe();
    return () => { 
        isMounted = false;
        // We don't necessarily want to close it immediately if they switch modes back and forth, 
        // but for cleanup on unmount it's handled by the ref check or a separate cleanup effect.
        // For now, let's keep the ref alive if they switch away and back.
    };
  }, [mode]);

  // Cleanup MediaPipe on unmount
  useEffect(() => {
      return () => {
          if (faceLandmarkerRef.current) {
              faceLandmarkerRef.current.close();
              faceLandmarkerRef.current = null;
          }
      };
  }, []);

  // Load History & Voices
  useEffect(() => {
    const saved = localStorage.getItem('interview_history_v7'); 
    if (saved) {
        try { setHistory(JSON.parse(saved)); } catch(e) {}
    }
    const loadVoices = () => {
      setTimeout(() => { setVoices(window.speechSynthesis.getVoices()); }, 50);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Cloud Sync Effect
  useEffect(() => {
    if (!isLoggedIn) return;
    const fetchCloudHistory = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { data, error } = await supabase
                .from('interview_history')
                .select('*')
                .eq('user_id', user.id)
                .order('timestamp', { ascending: false });
            
            if (data && data.length > 0) {
                // Merge cloud data with local data, preferring cloud
                const localHistory = JSON.parse(localStorage.getItem('interview_history_v7') || '[]');
                const merged = [...data];
                localHistory.forEach((localItem: any) => {
                    if (!merged.some((cloudItem: any) => cloudItem.id === localItem.id)) {
                        merged.push(localItem);
                    }
                });
                // Sort by timestamp descending
                merged.sort((a, b) => b.timestamp - a.timestamp);
                setHistory(merged);
                localStorage.setItem('interview_history_v7', JSON.stringify(merged));
            }
        } catch (e) { console.error("Cloud sync failed", e); }
    };
    fetchCloudHistory();
  }, [isLoggedIn]);

  // Timer Logic
  useEffect(() => {
    if (interviewStatus === 'active' && secondsRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) { handleStop(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else { clearInterval(timerIntervalRef.current); }
    return () => clearInterval(timerIntervalRef.current);
  }, [interviewStatus, secondsRemaining]);

  // Real-time Face Tracking Loop
  const predictWebcam = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (video && landmarker && video.currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
        lastVideoTimeRef.current = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            const nose = result.faceLandmarks[0][1]; 
            const dist = Math.sqrt(Math.pow(nose.x - 0.5, 2) + Math.pow(nose.y - 0.5, 2));
            setAttentionScore(Math.round(Math.max(0, Math.min(100, 100 - (dist * 150)))));
            const shapes = result.faceBlendshapes?.[0]?.categories;
            if (shapes) {
                const smile = shapes.find(c => c.categoryName === 'mouthSmileLeft')?.score || 0;
                const jawOpen = shapes.find(c => c.categoryName === 'jawOpen')?.score || 0;
                if (jawOpen > 0.15) setExpression("Speaking");
                else if (smile > 0.4) setExpression("Smiling");
                else setExpression("Neutral");
            } else { setExpression("Present"); }
        } else { setAttentionScore(0); setExpression("Absent"); }
    }
    if (interviewStatus === 'active' && mode === 'face') { requestRef.current = requestAnimationFrame(predictWebcam); }
  }, [interviewStatus, mode]);

  useEffect(() => {
      if (interviewStatus === 'active' && mode === 'face') {
          const startDelay = setTimeout(() => { requestRef.current = requestAnimationFrame(predictWebcam); }, 1000);
          return () => { clearTimeout(startDelay); cancelAnimationFrame(requestRef.current); };
      } else { cancelAnimationFrame(requestRef.current); setAttentionScore(0); }
  }, [interviewStatus, mode, predictWebcam]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, currentInput, aiState]);

  useEffect(() => {
      if (interviewStatus === 'active' && mode === 'face') {
          navigator.mediaDevices.getUserMedia({ video: true, audio: false })
              .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
              .catch(err => console.error("Video access denied:", err));
      }
      return () => {
          if (videoRef.current && videoRef.current.srcObject) {
              (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
          }
      };
  }, [interviewStatus, mode]);

  useEffect(() => {
      if (reportLoading) {
          setLoadingStep(0);
          const timer = setInterval(() => { setLoadingStep(prev => prev < 3 ? prev + 1 : prev); }, 1500);
          return () => clearInterval(timer);
      }
  }, [reportLoading]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getActiveJdText = () => jdSource === 'sync' ? (mainPageJd || "General Professional Interview") : (customJd || "General Professional Interview");

  const startAmbience = () => {
      try {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          if (!Ctx) return;
          const ctx = new Ctx(); audioContextRef.current = ctx;
          const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          let lastOut = 0;
          for (let i = 0; i < buffer.length; i++) {
              const white = Math.random() * 2 - 1;
              data[i] = (lastOut + (0.02 * white)) / 1.02;
              lastOut = data[i]; data[i] *= 3.5; 
          }
          const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
          const gainNode = ctx.createGain(); gainNode.gain.value = 0.01; 
          noise.connect(gainNode); gainNode.connect(ctx.destination);
          noise.start(); ambienceNodeRef.current = noise;
      } catch (e) {}
  };

  const stopAmbience = () => {
      if (ambienceNodeRef.current) ambienceNodeRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
  };

  const splitTextForTTS = (text: string) => {
      const chunks = text.match(/[^.!?。！？]+[.!?。！？]+["']?|[^.!?。！？]+$/g);
      return chunks ? chunks.map(s => s.trim()).filter(s => s.length > 0) : [text];
  };

  const getPreferredVoice = useCallback(() => {
      const isFemale = interviewerGender === 'female';
      const targetLangPrefix = lang.split('-')[0];
      let validVoices = voices.filter(v => v.lang.startsWith(targetLangPrefix));
      
      if (lang === 'en') {
          // Broaden to all English variants to find a male voice if needed
          validVoices = voices.filter(v => v.lang.startsWith('en'));
      }
      
      if (validVoices.length === 0) validVoices = voices; 
      
      let bestVoice = validVoices[0]; 
      let highestScore = -10000;
      
      validVoices.forEach(voice => {
          let score = 0;
          const lowerName = voice.name.toLowerCase();
          
          // Base quality score
          if (lowerName.includes('google') || lowerName.includes('natural') || lowerName.includes('premium') || lowerName.includes('neural')) score += 10;
          
          // Explicit gender tags
          const isExplicitlyMale = /\b(male|man|boy)\b/.test(lowerName);
          const isExplicitlyFemale = /\b(female|woman|girl)\b/.test(lowerName);
          
          // Known voice names by OS
          const maleNames = ['david', 'daniel', 'james', 'alex', 'mark', 'george', 'arthur', 'william', 'aaron', 'brian', 'carl', 'ryan', 'guy', 'fred', 'ralph', 'bruce', 'albert', 'richard', 'gordon'];
          const femaleNames = ['zira', 'samantha', 'siri', 'victoria', 'karen', 'tessa', 'moira', 'veena', 'fiona', 'ava', 'allison', 'susan', 'catherine', 'luciana', 'monica', 'hazel', 'heather', 'linda', 'laura', 'chloe', 'mia', 'olivia'];
          
          const hasMaleName = maleNames.some(n => new RegExp(`\\b${n}\\b`).test(lowerName));
          const hasFemaleName = femaleNames.some(n => new RegExp(`\\b${n}\\b`).test(lowerName));
          
          if (isFemale) {
              if (isExplicitlyFemale || hasFemaleName) score += 1000;
              if (isExplicitlyMale || hasMaleName) score -= 5000;
              if (lowerName === 'google us english') score += 500; // Known female
          } else {
              if (isExplicitlyMale || hasMaleName) score += 1000;
              if (isExplicitlyFemale || hasFemaleName) score -= 5000;
              if (lowerName === 'google uk english male') score += 500; // Known male
              if (lowerName === 'google us english') score -= 1000; // Explicitly avoid the default female Google voice for male
          }
          
          // Prefer exact language match
          if (voice.lang === lang) score += 50;
          else if (voice.lang.startsWith(targetLangPrefix)) score += 20;
          
          if (score > highestScore) { 
              highestScore = score; 
              bestVoice = voice; 
          }
      });
      
      return bestVoice;
  }, [voices, interviewerGender, lang]);

  const processSpeechQueue = useCallback(() => {
      if (!isInterviewActiveRef.current || speechQueueRef.current.length === 0) {
          isSpeakingRef.current = false;
          if (isInterviewActiveRef.current) { setAiState('listening'); setCurrentInput(''); }
          else setAiState('idle');
          return;
      }
      const chunk = speechQueueRef.current.shift();
      if (!chunk) { processSpeechQueue(); return; }
      isSpeakingRef.current = true;
      const utterance = new SpeechSynthesisUtterance(chunk);
      const voice = getPreferredVoice();
      if (voice) { 
          utterance.voice = voice; 
          
          // If we want a male voice but are forced to use a likely female one (or just to make it deeper)
          const isLikelyFemale = /\b(female|woman|girl|zira|samantha|siri|victoria|karen|tessa|moira|veena|fiona|ava|allison|susan|catherine|luciana|monica|hazel|heather|linda|laura|chloe|mia|olivia)\b/.test(voice.name.toLowerCase()) || voice.name.toLowerCase() === 'google us english';
          
          if (interviewerGender === 'male') {
              // Drastically lower pitch if the selected voice is female, otherwise slightly lower
              utterance.pitch = isLikelyFemale ? 0.3 : 0.7;
          } else {
              utterance.pitch = 1.0;
          }
          
          // Increase speed for Chinese to be more natural
          utterance.rate = (lang === 'zh' || voice.lang.includes('zh')) ? 1.2 : 0.9; 
      }
      utterance.onend = () => processSpeechQueue();
      utterance.onerror = () => processSpeechQueue();
      window.speechSynthesis.speak(utterance);
  }, [getPreferredVoice, interviewerGender, lang]);

  const speakText = useCallback((text: string) => {
      if (!isInterviewActiveRef.current || isMuted) { if(isInterviewActiveRef.current) setAiState('listening'); return; }
      window.speechSynthesis.cancel();
      speechQueueRef.current = splitTextForTTS(text.replace(/[*_#`]/g, '').trim());
      setAiState('speaking');
      processSpeechQueue();
  }, [isMuted, processSpeechQueue]);

  const getResumeContext = () => {
      const r = portfolioData?.jobPackage?.resume;
      if (!r) return "Not provided";
      return `Name: ${r.fullName}. Summary: ${r.summary}. History: ${r.experiences?.map(e => `${e.role} at ${e.company}`).join('; ')}. Skills: ${r.technicalSkills?.join(', ')}.`;
  };

  const handleSend = async (text: string) => {
      if (!isInterviewActiveRef.current || !text.trim() || aiStateRef.current !== 'listening') return;
      setAiState('processing');
      setMessages(prev => [...prev, { role: 'user', text, timestamp: Date.now() }]);
      setCurrentInput('');
      const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[lang || 'en'];
      
      /* A behavioural interview is a Western format. Chinese interviews open
         with 自我介绍, ask why you left your last job and where you see your
         career going, and a STAR answer to those reads as evasive. Asking the
         same questions in Chinese is a translation, not a rehearsal for the
         interview the candidate is actually going to sit. */
      const style = market === 'CN'
        ? `Conduct the interview in the Chinese style. Open with 自我介绍, then
           work through 为什么离职 / 为什么选择这个岗位 / 职业规划 / 你的优势和不足,
           mixed with specific questions drawn from the resume and the JD.
           Structured, direct, and businesslike. Do not ask for STAR-format
           answers; judge substance and clarity instead.`
        : `Conduct a professional behavioural interview. Expect and reward STAR
           structure: situation, task, action, result.`;

      const systemInstruction = `Role: ${interviewerGender === 'female' ? 'Olivia' : 'James'}, Senior Recruiter. 
Context: 
- Job Description: "${getActiveJdText().substring(0, 2000)}"
- Candidate Resume: "${getResumeContext().substring(0, 2000)}"
Task: ${style} Ask ONE question at a time. 
Do NOT recite the resume. Use the resume to ask specific questions about their experience relative to the JD.
Output JSON: {"feedback": {"pros": "...", "cons": "...", "tips": "...", "score": 8}, "next_question": "..."}. 
Score must be 1-10. Language: ${langName} ONLY.`;

      const historyContents = messages.map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }]
      }));
      historyContents.push({
          role: 'user',
          parts: [{ text: `Candidate Answer: ${text}` }]
      });

      try {
          const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
              model: 'gemini-2.5-flash',
              contents: historyContents,
              config: { systemInstruction, responseMimeType: "application/json" }
          }));
          if (!isInterviewActiveRef.current) return;
          const textRes = response.text || '{}';
          const cleanJson = textRes.replace(/```json|```/g, '').trim();
          const jsonRes = JSON.parse(cleanJson);
          setMessages(prev => {
              const hist = [...prev];
              if (hist[hist.length - 1].role === 'user') hist[hist.length - 1].feedback = jsonRes.feedback;
              return hist;
          });
          const nextQ = jsonRes.next_question || "Could you elaborate?";
          setMessages(prev => [...prev, { role: 'ai', text: nextQ, timestamp: Date.now() }]);
          speakText(nextQ);
      } catch (e) { 
          console.error("handleSend error:", e);
          setAiState('listening'); 
      }
  };

  const handleSkipQuestion = async () => {
      if (!isInterviewActiveRef.current) return;
      window.speechSynthesis.cancel(); speechQueueRef.current = []; setAiState('processing');
      setMessages(prev => [...prev, { role: 'user', text: "[Skipped]", timestamp: Date.now() }]);
      const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[lang || 'en'];
      
      const historyContents = messages.map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }]
      }));
      historyContents.push({
          role: 'user',
          parts: [{ text: "Candidate skipped the question. Ask a DIFFERENT interview question to move forward." }]
      });

      try {
          const res = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
              model: 'gemini-2.5-flash',
              contents: historyContents,
              config: { systemInstruction: `Role: Senior Recruiter. Language: ${langName}. Context: JD "${getActiveJdText().substring(0, 1000)}". Resume: "${getResumeContext().substring(0, 1000)}".` }
          }));
          if (!isInterviewActiveRef.current) return;
          const nextQ = res.text || "Let's move on.";
          setMessages(prev => [...prev, { role: 'ai', text: nextQ, timestamp: Date.now() }]);
          speakText(nextQ);
      } catch (e) { 
          console.error("handleSkip error:", e);
          setAiState('listening'); 
      }
  };

  const handleSendRef = useRef(handleSend);
  useEffect(() => { handleSendRef.current = handleSend; });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Recognition) return;
    const r = new Recognition(); r.continuous = true; r.interimResults = true;
    r.lang = lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' : 'en-US';
    
    let timeoutId: any = null;

    r.onresult = (e: any) => {
        if (!isInterviewActiveRef.current) return;
        let finalT = '';
        let interimT = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) finalT += e.results[i][0].transcript;
            else interimT += e.results[i][0].transcript;
        }
        const t = finalT + interimT;
        
        if (t.trim()) {
            setCurrentInput(t);
            if (modeRef.current !== 'text') {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => { 
                    if (isInterviewActiveRef.current && aiStateRef.current === 'listening') {
                        handleSendRef.current(t); 
                    }
                }, 2500);
            }
        }
    };
    
    r.onend = () => { 
        if (isInterviewActiveRef.current && modeRef.current !== 'text' && !isMutedRef.current && aiStateRef.current === 'listening') {
            try { r.start(); } catch(e) {} 
        }
    };
    
    recognitionRef.current = r;
    
    return () => {
        if (timeoutId) clearTimeout(timeoutId);
        try { r.stop(); } catch(e) {}
    };
  }, [lang]);

  useEffect(() => {
      const r = recognitionRef.current;
      if (r && interviewStatus === 'active' && aiState === 'listening' && mode !== 'text' && !isMuted) try { r.start(); } catch(e) {}
      else if (r) try { r.stop(); } catch(e) {}
  }, [aiState, interviewStatus, mode, isMuted]);


  const handleStart = async () => {
      if (!isLoggedIn && onLogin) {
          onLogin();
          return;
      }
      const cost = interviewCost(duration);
      if (onCheckCredits && !(await onCheckCredits(cost))) return;
      if (jdSource === 'custom' && !customJd.trim()) { alert("Enter JD."); return; }
      if (mode === 'face') await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(() => startAmbience()).catch(() => setMode('voice'));
      else if (mode === 'voice') await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => setMode('text'));
      isInterviewActiveRef.current = true; setInterviewStatus('initializing'); setSecondsRemaining(duration * 60); setMessages([]); setSelectedHistoryItem(null); setShowHistoryPanel(false);
      const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[lang || 'en'];
      
      const interviewerName = interviewerGender === 'female' ? 'Olivia' : 'James';
      
      try {
          const res = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
              model: 'gemini-2.5-flash',
              contents: `Act as a professional Recruiter named ${interviewerName}.
You are interviewing the candidate (me) for a job.
Context: 
- Job Description: "${getActiveJdText().substring(0, 2000)}"
- Candidate Resume: "${getResumeContext().substring(0, 2000)}"

Task: Start the interview. Greet the candidate professionally and ask for a brief self-introduction.
Constraints:
- Speak directly TO the candidate (use "you").
- Do NOT generate a script or options.
- Keep it short (under 2 sentences).
- Language: ${langName}.`
          }));
          if (!isInterviewActiveRef.current) return;
          await onSpendCredits?.(cost);
          setInterviewStatus('active'); setMessages([{ role: 'ai', text: res.text || 'Hello.', timestamp: Date.now() }]); speakText(res.text || 'Hello.');
      } catch (e: any) { 
          console.error("handleStart error:", e);
          // Do not fake a greeting and pretend the interview started — the
          // session would be unusable and the user would still be charged.
          isInterviewActiveRef.current = false;
          setInterviewStatus('idle');
          stopAmbience();
          alert(e?.message || "Could not start the interview. You have not been charged.");
      }
  };

  const handleStop = async () => {
      if (!isLoggedIn) {
          onLogin?.();
          return;
      }
      isInterviewActiveRef.current = false; window.speechSynthesis.cancel(); speechQueueRef.current = [];
      setInterviewStatus('completed'); setReportLoading(true); setAiState('idle'); stopAmbience(); if (recognitionRef.current) recognitionRef.current.stop();
      try {
          const transcript = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
          const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[lang || 'en'];
          const res = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
              model: 'gemini-2.5-flash',
              contents: `Analyze transcript. Output JSON: {
"overallScore": 85, 
"executiveSummary": "...", 
"strengths": [], 
"growthAreas": [], 
"qaAnalysis": [
  {"question": "...", "answer": "...", "score": 8, "feedback": "...", "improvedAnswer": "..."}
]
}. 
Language: ${langName}. 
Transcript: ${transcript}`,
              config: { responseMimeType: "application/json" }
          }));
          const textRes = res.text || '{}';
          const cleanJson = textRes.replace(/```json|```/g, '').trim();
          const data = JSON.parse(cleanJson);
          const item: InterviewHistoryItem = { id: Date.now().toString(), timestamp: Date.now(), overallScore: data.overallScore || 0, summary: data.executiveSummary || "", durationMinutes: duration, interviewer: interviewerGender === 'female' ? 'Olivia' : 'James', mode, jdSource, customJdPreview: getActiveJdText().substring(0, 50), fullJd: getActiveJdText(), transcript: messages, reportData: data };
          const updated = [item, ...history]; setHistory(updated); setSelectedHistoryItem(item); localStorage.setItem('interview_history_v7', JSON.stringify(updated));
          
          if (isLoggedIn) {
              supabase.auth.getUser().then(({ data: { user } }) => {
                  if (user) {
                      supabase.from('interview_history').insert([{
                          user_id: user.id,
                          id: item.id,
                          timestamp: item.timestamp,
                          overall_score: item.overallScore,
                          summary: item.summary,
                          duration_minutes: item.durationMinutes,
                          interviewer: item.interviewer,
                          mode: item.mode,
                          jd_source: item.jdSource,
                          custom_jd_preview: item.customJdPreview,
                          full_jd: item.fullJd,
                          transcript: item.transcript,
                          report_data: item.reportData,
                          application_id: applicationId
                      }]).then(({ error }) => { if(error) console.error("Save to cloud failed", error); });
                  }
              });
          }
      } catch (e) {} finally { setReportLoading(false); }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col md:flex-row bg-slate-50" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* SIDEBAR: Configuration */}
        <div className="w-full md:w-[360px] p-6 pt-10 flex flex-col gap-6 overflow-y-auto shrink-0 border-b md:border-b-0 md:border-e border-slate-200 bg-white z-20">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{t.intStudioTitle || "AI Recruiter Studio"}</h2>
            <div className="space-y-6">
                <div className={`space-y-6 ${interviewStatus === 'active' ? 'hidden md:block' : ''}`}>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t.recruiter || "Recruiter"}</label>
                        <div className="flex gap-4">
                            <button onClick={() => setInterviewerGender('female')} className={`flex-1 p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${interviewerGender === 'female' ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-100 hover:border-slate-200'}`}><span className="text-3xl">👩‍💼</span><span className="text-[10px] font-black uppercase tracking-widest">{t.intOlivia || "Olivia"}</span></button>
                            <button onClick={() => setInterviewerGender('male')} className={`flex-1 p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${interviewerGender === 'male' ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-100 hover:border-slate-200'}`}><span className="text-3xl">👨‍💼</span><span className="text-[10px] font-black uppercase tracking-widest">{t.intJames || "James"}</span></button>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t.duration || "Duration"}</label>
                        <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                            {[5, 10, 15].map(d => (
                                <button key={d} onClick={() => setDuration(d as Duration)} className={`flex-1 py-3 rounded-xl text-[11px] font-black transition-all ${duration === d ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:text-slate-600'}`}>{d}m</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t.mode || "Mode"}</label>
                        <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                            {['text', 'voice', 'face'].map(m => (
                                <button key={m} onClick={() => setMode(m as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${mode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                                    <span>{m === 'text' ? '💬' : m === 'voice' ? '🎙️' : '📹'}</span> {m === 'text' ? t.intModeText : m === 'voice' ? t.intModeVoice : t.intModeFace}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t.jdLabel || "Job Description"}</label>
                        <div className="flex bg-white rounded-xl border border-slate-100 overflow-hidden mb-3">
                            <button onClick={() => setJdSource('sync')} className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${jdSource === 'sync' ? 'bg-emerald-50 text-emerald-600 border-emerald-500' : 'text-slate-300'}`}>SYNC RESUME JD</button>
                            <button onClick={() => setJdSource('custom')} className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${jdSource === 'custom' ? 'bg-indigo-50 text-indigo-600 border-indigo-500' : 'text-slate-300'}`}>CUSTOM JD</button>
                        </div>
                        {jdSource === 'custom' && <textarea value={customJd} onChange={e => setCustomJd(e.target.value)} placeholder={t.intCustomPlaceholder} className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none focus:border-indigo-500 resize-none" />}
                    </div>
                </div>
                {interviewStatus === 'active' ? (
                    <button onClick={handleStop} className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 hover:bg-black transition-all active:scale-[0.98]">END SESSION</button>
                ) : (
                    <button onClick={handleStart} disabled={interviewStatus === 'initializing'} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98] text-lg disabled:opacity-50 flex flex-col items-center justify-center gap-1">
                        <span>{interviewStatus === 'initializing' ? 'INITIALIZING...' : t.startSession}</span>
                        {interviewStatus !== 'initializing' && <span className="text-[10px] opacity-70 tracking-widest font-bold">(Costs {interviewCost(duration)} Credits)</span>}
                    </button>
                )}
            </div>
        </div>

        {/* MAIN STUDIO AREA */}
        <div className="flex-grow flex flex-col p-4 md:p-12 items-center justify-center relative overflow-hidden bg-white min-h-[500px]">
            {interviewStatus !== 'completed' ? (
                <div className="w-full max-w-6xl h-full bg-[#0b1120] rounded-[2rem] md:rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col group border-4 border-slate-100">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#111827] to-black z-0"></div>
                    
                    {/* Inner White Status Bar & Feedback */}
                    {interviewStatus === 'active' && (
                        <div className="absolute top-0 left-0 right-0 p-4 md:p-8 flex justify-between items-start z-50 pointer-events-none">
                            <div className="p-3 md:p-4 bg-white/95 backdrop-blur-md rounded-2xl flex items-center gap-3 md:gap-6 shadow-xl border border-white/20 pointer-events-auto animate-slide-down">
                                <div className="flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-2.5 bg-rose-50 rounded-xl border border-rose-100 shadow-inner">
                                    <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-rose-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                    <span className="text-lg md:text-xl font-black text-rose-600 tabular-nums tracking-tight">{formatTime(secondsRemaining)}</span>
                                </div>
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] hidden md:inline">{t.intLiveVision || "LIVE VIDEO ANALYSIS"}</span>
                                <button onClick={handleSkipQuestion} className="px-4 md:px-6 py-2 md:py-2.5 bg-amber-50 text-amber-600 rounded-xl font-black text-[10px] md:text-[11px] uppercase tracking-widest border border-amber-100 hover:bg-amber-100 transition-all shadow-sm">SKIP</button>
                            </div>

                            {/* Live Feedback Card */}
                            {(() => {
                                const lastUserMsg = [...messages].reverse().find(m => m.role === 'user' && m.feedback);
                                if (!lastUserMsg?.feedback) return null;
                                const { score, tips } = lastUserMsg.feedback;
                                const scoreColor = score >= 8 ? 'text-emerald-500' : score >= 5 ? 'text-amber-500' : 'text-rose-500';
                                
                                return (
                                    <div className="w-64 bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-white/20 shadow-xl pointer-events-auto animate-slide-left ml-auto">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">LAST ANSWER SCORE</span>
                                            <div className={`flex items-baseline gap-1 ${scoreColor}`}>
                                                <span className="text-3xl font-black">{score}</span>
                                                <span className="text-sm font-bold opacity-60">/10</span>
                                            </div>
                                        </div>
                                        {tips && (
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 leading-relaxed line-clamp-3">{tips}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* AI Recruiter Centered View */}
                    <div className="flex-grow flex flex-col items-center justify-center relative z-10 px-4 md:px-8 py-20 md:py-4">
                        <div className="flex-grow flex flex-col items-center justify-center w-full">
                            <div className={`w-24 h-24 md:w-48 md:h-48 rounded-full flex items-center justify-center relative transition-all duration-700 ${aiState === 'speaking' ? 'scale-110 shadow-[0_0_80px_rgba(99,102,241,0.5)]' : 'shadow-2xl'}`}>
                                <div className={`absolute inset-0 bg-indigo-600/20 rounded-full blur-3xl animate-pulse ${aiState === 'speaking' ? 'opacity-100' : 'opacity-0'}`}></div>
                                <div className="w-full h-full bg-slate-800 rounded-full flex items-center justify-center border-4 md:border-8 border-slate-700/50 relative z-20 overflow-hidden shadow-inner">
                                     <span className="text-5xl md:text-8xl select-none">{interviewerGender === 'female' ? '👩‍💼' : '👨‍💼'}</span>
                                </div>
                                {aiState === 'speaking' && <div className="absolute inset-0 border-2 border-indigo-400/30 rounded-full animate-ping"></div>}
                            </div>
                            <div className="mt-6 md:mt-8 text-center animate-fade-in">
                                <h3 className="text-white font-black text-2xl md:text-3xl tracking-tighter mb-2 uppercase">{interviewerGender === 'female' ? (t.intOlivia || 'Olivia') : (t.intJames || 'James')}</h3>
                                <div className={`inline-flex items-center gap-2 px-4 md:px-5 py-1.5 md:py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] transition-all border ${aiState === 'speaking' ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg' : 'bg-slate-800/80 text-slate-400 border-slate-700'}`}>
                                    {aiState === 'speaking' ? 'SPEAKING...' : aiState === 'listening' ? 'LISTENING' : aiState === 'processing' ? 'THINKING' : 'READY'}
                                </div>
                            </div>
                        </div>
                        
                        {/* Subtitle / Transcript Area */}
                        <div className="w-full max-w-2xl text-center mt-auto pb-4 md:pb-0">
                            <div className="bg-black/40 backdrop-blur-md p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/5 shadow-2xl max-h-[30vh] overflow-y-auto custom-scrollbar">
                                <p className="text-base md:text-xl font-bold text-white/90 leading-relaxed italic">
                                    "{aiState === 'listening' ? (currentInput || "...") : messages[messages.length-1]?.text || "Initializing Studio..."}"
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* PIP User Video View: Matching user's request for better visibility */}
                    {mode === 'face' && (
                        <div className="absolute bottom-10 left-10 w-40 h-30 md:w-64 md:h-48 bg-black rounded-[2rem] overflow-hidden border-4 border-slate-700 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-[60] group-hover:scale-105 transition-transform duration-500">
                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
                            <div className="absolute top-4 left-4 flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse shadow-lg"></div>
                                <span className="text-[8px] font-black text-white/80 uppercase tracking-widest bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">LIVE FEED</span>
                            </div>
                            <div className="absolute bottom-4 left-4 right-4 p-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-between">
                                <div className="flex flex-col gap-1 w-full">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[8px] font-black text-indigo-300 uppercase tracking-widest">ATTENTION</span>
                                        <span className="text-[8px] font-black text-white">{attentionScore}%</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${attentionScore}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mode Specific Inputs */}
                    {mode === 'text' && interviewStatus === 'active' && (
                        <div className="absolute bottom-10 right-10 left-10 md:left-auto md:w-96 z-[60] animate-fade-in-up">
                            <div className="flex gap-3 items-center bg-white p-2 rounded-[2rem] shadow-2xl border border-slate-100">
                                <input type="text" value={currentInput} onChange={e => setCurrentInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend(currentInput)} placeholder={t.intTypeResponse} className="flex-grow bg-transparent border-none px-6 py-4 text-sm font-bold text-slate-900 outline-none" autoFocus />
                                <button onClick={() => handleSend(currentInput)} className="bg-indigo-600 text-white p-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full max-w-4xl h-full overflow-y-auto custom-scrollbar bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-slate-100 p-6 md:p-12">
                    {reportLoading ? (
                        <div className="flex flex-col items-center justify-center py-10 md:py-20 text-center h-full">
                            <div className="relative mb-6 md:mb-10">
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-[4px] md:border-[6px] border-slate-100 border-t-indigo-600 animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center font-black text-indigo-600 text-xl md:text-2xl">{Math.min(100, Math.round((loadingStep + 1) * 33))}%</div>
                            </div>
                            <h3 className="text-2xl md:text-4xl font-black text-slate-900 mb-2 md:mb-4 tracking-tighter uppercase">{t.intGeneratingReport || "Compiling Intelligence..."}</h3>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] md:text-xs">{t.intReportSubtitle}</p>
                        </div>
                    ) : selectedHistoryItem && (
                        <div ref={reportContainerRef} className="space-y-12 animate-fade-in">
                            <div className="flex justify-between items-start border-b border-slate-100 pb-10">
                                <div>
                                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.3em] mb-6">INTELLIGENCE REPORT</div>
                                    <h2 className="text-5xl font-black text-slate-900 tracking-tighter leading-tight uppercase">Performance <br/> Scorecard</h2>
                                    <p className="text-slate-400 font-bold mt-4 uppercase tracking-widest text-[10px]">{portfolioData?.jobPackage.resume?.fullName || "CANDIDATE"} • {new Date(selectedHistoryItem.timestamp).toLocaleDateString()}</p>
                                </div>
                                <div className="text-center">
                                    <div className={`w-32 h-32 rounded-[2.5rem] flex flex-col items-center justify-center mb-6 shadow-2xl ${selectedHistoryItem.overallScore >= 80 ? 'bg-emerald-600 shadow-emerald-100' : 'bg-indigo-600 shadow-indigo-100'}`}>
                                        <span className="text-5xl font-black text-white">{selectedHistoryItem.overallScore}</span>
                                        <span className="text-[10px] font-black text-white/60 uppercase tracking-widest mt-1">TOTAL</span>
                                    </div>
                                    <button 
                                        onClick={handleDownloadPDF} 
                                        disabled={isExporting}
                                        className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 group"
                                    >
                                        {isExporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 group-hover:bounce" />}
                                        {isExporting ? 'GEN...' : 'PDF'}
                                    </button>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 shadow-inner">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] mb-6">EXECUTIVE SUMMARY</h4>
                                <p className="text-lg text-slate-700 font-medium leading-relaxed">{selectedHistoryItem.summary}</p>
                            </div>
                            <div className="grid md:grid-cols-2 gap-12">
                                <div className="space-y-8">
                                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.4em] flex items-center gap-3">PEAK STRENGTHS</h4>
                                    <div className="space-y-4">
                                        {selectedHistoryItem.reportData?.strengths?.map((s: string, i: number) => (
                                            <div key={i} className="p-6 bg-white border-2 border-emerald-50 rounded-2xl flex gap-4 items-start shadow-sm"><span className="text-emerald-500 font-black">✓</span><p className="text-sm font-bold text-slate-700">{s}</p></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-8">
                                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] flex items-center gap-3">GROWTH NODES</h4>
                                    <div className="space-y-4">
                                        {selectedHistoryItem.reportData?.growthAreas?.map((s: string, i: number) => (
                                            <div key={i} className="p-6 bg-white border-2 border-rose-50 rounded-2xl flex gap-4 items-start shadow-sm"><span className="text-rose-400 font-black">↑</span><p className="text-sm font-bold text-slate-700">{s}</p></div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Q&A Analysis Section */}
                            {selectedHistoryItem.reportData?.qaAnalysis && selectedHistoryItem.reportData.qaAnalysis.length > 0 && (
                                <div className="space-y-8">
                                    <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-6">DETAILED Q&A ANALYSIS</h4>
                                    <div className="space-y-6">
                                        {selectedHistoryItem.reportData.qaAnalysis.map((qa: any, i: number) => (
                                            <div key={i} className="p-8 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all">
                                                <div className="flex justify-between items-start mb-4">
                                                    <h5 className="text-sm font-black text-slate-900 uppercase tracking-wide">Question {i + 1}</h5>
                                                    <div className={`px-3 py-1 rounded-lg text-[10px] font-black ${qa.score >= 8 ? 'bg-emerald-50 text-emerald-600' : qa.score >= 5 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                                                        SCORE: {qa.score}/10
                                                    </div>
                                                </div>
                                                <p className="text-lg font-bold text-slate-800 mb-6 leading-snug">"{qa.question}"</p>
                                                
                                                <div className="space-y-6">
                                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">YOUR ANSWER</span>
                                                        <p className="text-sm text-slate-600 leading-relaxed italic">"{qa.answer}"</p>
                                                    </div>
                                                    
                                                    <div className="grid md:grid-cols-2 gap-6">
                                                        <div>
                                                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-2">FEEDBACK</span>
                                                            <p className="text-sm text-slate-600 leading-relaxed">{qa.feedback}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-2">IMPROVED ANSWER</span>
                                                            <p className="text-sm text-slate-600 leading-relaxed">{qa.improvedAnswer}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Fix: changed handleStartNew to handleStart as it was likely a typo and handleStart exists to initiate a new session */}
                            <div className="pt-12 border-t border-slate-100 text-center">
                                <button onClick={handleStart} className="px-12 py-5 bg-indigo-600 text-white rounded-full font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex flex-col items-center justify-center mx-auto gap-1">
                                    <span>START NEW SIMULATION</span>
                                    <span className="text-[10px] opacity-70 tracking-widest font-bold">(Costs {interviewCost(duration)} Credits)</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* RIGHT SIDEBAR: History */}
        <div className={`fixed top-24 ${isRtl ? 'left-0' : 'right-0'} h-[calc(100vh-140px)] z-[100] transition-transform duration-700 flex ${showHistoryPanel ? 'translate-x-0' : (isRtl ? '-translate-x-[calc(100%-2rem)] md:-translate-x-[calc(100%-3.5rem)]' : 'translate-x-[calc(100%-2rem)] md:translate-x-[calc(100%-3.5rem)]')}`}>
            <button onClick={() => setShowHistoryPanel(!showHistoryPanel)} className="w-8 md:w-14 bg-white/95 backdrop-blur-xl h-40 md:h-64 my-auto rounded-s-[1rem] md:rounded-s-[2rem] flex flex-col items-center justify-center gap-3 md:gap-6 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all group hover:w-10 md:hover:w-16 order-1">
                <div style={{ writingMode: 'vertical-rl', textOrientation: isCJK ? 'upright' : 'mixed' }} className={`${isCJK ? '' : 'rotate-180'} text-[9px] md:text-[11px] font-black tracking-[0.2em] md:tracking-[0.5em] uppercase`}>{t.history || "HISTORY"}</div>
                <div className="w-5 h-5 md:w-7 md:h-7 rounded-full bg-slate-100 flex items-center justify-center text-[9px] md:text-[11px] font-black text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{history.length}</div>
            </button>
            <div className="w-[85vw] md:w-96 h-full bg-white border-s border-slate-100 shadow-[-50px_0_100px_rgba(0,0,0,0.05)] flex flex-col order-2">
                <div className="p-10 border-b border-slate-50 flex justify-between items-center">
                    <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">{t.history}</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Previous Logs</p></div>
                    <button onClick={() => { if(confirm("Clear history?")) { setHistory([]); localStorage.removeItem('interview_history_v7'); } }} className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] hover:text-rose-400">RESET</button>
                </div>
                <div className="flex-grow overflow-y-auto custom-scrollbar p-8 space-y-6 bg-slate-50/30">
                    {!isLoggedIn && (
                        <div className="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-center">
                            <p className="text-[10px] font-bold text-indigo-900 mb-2 uppercase tracking-tight">Sync History</p>
                            <button onClick={onLogin} className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-sm">Login to Cloud</button>
                        </div>
                    )}
                    {history.length === 0 ? <p className="text-slate-300 text-center py-20 italic">No previous logs</p> : history.map(item => (
                        <div key={item.id} onClick={() => { setSelectedHistoryItem(item); setInterviewStatus('completed'); }} className="p-6 bg-white border border-slate-100 rounded-3xl hover:border-indigo-500/30 hover:shadow-2xl transition-all cursor-pointer group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{item.interviewer === 'Olivia' ? '👩‍💼' : '👨‍💼'}</span>
                                    <div><div className="text-xs font-black text-slate-900">{new Date(item.timestamp).toLocaleDateString()}</div><div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{item.mode} • {item.durationMinutes}m</div></div>
                                </div>
                                <div className={`text-xs font-black px-2.5 py-1.5 rounded-xl ${item.overallScore >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{item.overallScore}</div>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed font-medium uppercase tracking-tight">{item.summary}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};
