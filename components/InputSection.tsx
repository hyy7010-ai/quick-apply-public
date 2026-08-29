
import React, { useRef, useState, useEffect } from 'react';
import * as mammoth from 'mammoth';
import { TRANSLATIONS } from '../constants';
import { JobMarket, Language } from '../types';
import { detectLanguage } from '../services/geminiService';
import { CREDIT_COSTS } from '../credits';
export type ModuleId = 'resume' | 'portfolio' | 'interview' | 'career' | 'agent';

/**
 * Asked once, on the first screen, because the answer changes what the product
 * produces rather than how it looks.
 *
 * Deliberately not tied to the language switcher. A Chinese speaker applying in
 * Melbourne needs a Chinese interface and a Western resume: a Chinese resume
 * normally carries a photo and an age, and an Australian one that does marks
 * the candidate down. Reading the interface language as the market would get
 * that backwards for a large part of who this is for.
 */
const MarketPicker: React.FC<{
  lang: Language;
  market: JobMarket | null;
  onChange: (m: JobMarket) => void;
}> = ({ lang, market, onChange }) => {
  const zh = lang === 'zh';
  const opt = (id: JobMarket, title: string, sub: string) => (
    <button
      onClick={() => onChange(id)}
      aria-pressed={market === id}
      className={`flex-1 min-w-0 text-start px-4 py-3 rounded-2xl border transition-all ${
        market === id
          ? 'bg-slate-900 border-slate-900 text-white'
          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
      }`}
    >
      <span className="block text-[13px] font-black leading-snug">{title}</span>
      <span className={`block text-[11px] mt-0.5 leading-snug ${market === id ? 'text-slate-300' : 'text-slate-400'}`}>
        {sub}
      </span>
    </button>
  );

  return (
    <div className="mb-7">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2.5">
        {zh ? '你在哪里找工作?' : 'Where are you job hunting?'}
      </p>
      <div className="flex gap-2.5 max-w-md mx-auto lg:mx-0">
        {opt('CN', zh ? '中国' : 'Mainland China',
                   zh ? '简历含照片年龄 · BOSS直聘打招呼' : 'Photo & age on the resume')}
        {opt('AU', zh ? '海外' : 'Overseas',
                   zh ? '不含年龄性别 · 填申请表' : 'No age or photo, ATS forms')}
      </div>
      {!market && (
        <p className="text-[11px] text-slate-400 mt-2.5 max-w-md mx-auto lg:mx-0">
          {zh
            ? '选一个,简历格式、面试问题和浮窗的做法都会跟着变。界面语言仍然可以单独切换。'
            : 'This changes the resume format, the interview questions and how the panel behaves. The interface language stays a separate choice.'}
        </p>
      )}
    </div>
  );
};

/**
 * The first screen is a tour of the five tools: what the tool is, in words, on
 * the left; a picture of the screen it produces on the right. Both halves move
 * together.
 *
 * Earlier passes had this the wrong way round twice. First the right-hand box
 * held only abstract previews, a grid of grey tiles standing in for "Portfolio
 * AI", which explained nothing to someone seeing the product for the first
 * time. Then the explanation moved into the box and the picture disappeared
 * altogether. The words and the picture are both needed, and they belong on
 * opposite sides.
 *
 * The Career Agent slide leads, and its picture is a job the product tells you
 * NOT to apply for. Everything in this category can show a flattering score; a
 * refusal with reasons is the only image that is specifically about this one.
 *
 * Copy is English and Chinese. The other six locales fall back to English
 * rather than carry unverifiable machine translation of marketing prose; the
 * module names themselves still come from TRANSLATIONS.
 */
type Slide = { title: [string, string]; lead: string; points: string[] };

const SLIDES: Record<'en' | 'zh', Record<ModuleId, Slide>> = {
  en: {
    agent: {
      title: ['Don’t apply everywhere.', 'Apply where you belong.'],
      lead: 'We read the job you are looking at, score it against your real history, and tell you whether it is worth your time.',
      points: [
        'Five weighted dimensions, each with a written reason',
        'Says skip when it means skip, instead of flattering you',
        'Every score is kept as it was and never rewritten',
      ],
    },
    resume: {
      title: ['One resume,', 'aimed at one job.'],
      lead: 'Rewritten for the role in front of you. The emphasis and the wording change; your facts do not.',
      points: [
        'Never invents experience you do not have',
        'Exports real text, so an ATS can actually read it',
        'Cover letter written from the same evidence',
      ],
    },
    interview: {
      title: ['Rehearse it', 'before it counts.'],
      lead: 'Practise the questions this employer is likely to ask, and get marked on how you actually answered.',
      points: [
        'Questions generated from the job ad itself',
        'Scored on structure, evidence and clarity',
        'Tells you what to fix, not just a number',
      ],
    },
    portfolio: {
      title: ['Let the work', 'speak first.'],
      lead: 'Turn the projects already in your profile into one page you can send along with an application.',
      points: [
        'Built from what is already on your profile',
        'One link, and it works on a phone',
        'You decide what is visible before you share it',
      ],
    },
    career: {
      title: ['See which roles', 'you can already reach.'],
      lead: 'Ranked by how close your experience actually is, with the specific gap named for every direction.',
      points: [
        'Ordered by how close you already are',
        'Names the missing piece, not just a score',
        'Recalculated as you add experience',
      ],
    },
  },
  zh: {
    agent: {
      title: ['别再海投了。', '只投真正适合你的。'],
      lead: '我们读你正在看的这个职位,用你真实的经历给它打分,然后告诉你值不值得投。',
      points: [
        '五个维度,每个都写清楚为什么是这个分',
        '不合适就说不合适,不会为了让你开心而抬分',
        '每一次评分都存档,之后不会被改',
      ],
    },
    resume: {
      title: ['一份简历,', '只对准一个职位。'],
      lead: '针对眼前这个岗位重写。改的是重点和措辞,不是你的事实。',
      points: [
        '不编造你没有的经历',
        '导出的是真实文字,ATS 能读出来',
        '求职信用同一批事实写',
      ],
    },
    interview: {
      title: ['面试之前,', '先练一遍。'],
      lead: '按这家公司最可能问的问题练,并针对你实际的回答给分。',
      points: [
        '问题从这条招聘信息本身生成',
        '从结构、证据、表达三方面评分',
        '告诉你该改哪里,不只给一个数字',
      ],
    },
    portfolio: {
      title: ['让作品', '替你先开口。'],
      lead: '把档案里已有的项目变成一个页面,随申请一起发出去。',
      points: [
        '直接用你档案里已有的内容',
        '一个链接,手机上也能看',
        '发出去之前你决定哪些内容可见',
      ],
    },
    career: {
      title: ['看看你现在', '够得着哪些岗位。'],
      lead: '按你的经历有多接近来排序,每个方向都指出具体缺什么。',
      points: [
        '按你已经有多接近来排序',
        '指出缺的那一块,不只给一个分数',
        '经历更新后重新计算',
      ],
    },
  },
};

/* Every slide is a real screenshot of the module it names, captured from the
   running app in English and Chinese by scripts/capture-shots.mjs and kept in
   /public/shots. Nothing in this tour is drawn any more.

   Re-run that script whenever these screens change. A stale photograph of the
   product is worse than no photograph. */

interface HeroTourProps {
  t: any;
  lang: Language;
  market: JobMarket | null;
  onMarketChange: (m: JobMarket) => void;
  isLoggedIn: boolean;
  historyCount: number;
  onOpenHistory: () => void;
  onOpenModule?: (m: ModuleId) => void;
}

const HeroTour: React.FC<HeroTourProps> = ({ t, lang, market, onMarketChange, isLoggedIn, historyCount, onOpenHistory, onOpenModule }) => {
  const [i, setI] = useState(0);
  const [entered, setEntered] = useState(false);
  const touched = useRef(false);
  const dragX = useRef<number | null>(null);

  const copy = SLIDES[lang === 'zh' ? 'zh' : 'en'];
  const shotLang = lang === 'zh' ? 'zh' : 'en';
  const modules: { id: ModuleId; name: string }[] = [
    { id: 'agent', name: t.careerAgent || 'Career Agent' },
    { id: 'resume', name: t.resumeBuilder },
    { id: 'interview', name: t.interview },
    { id: 'portfolio', name: t.portfolioAi },
    { id: 'career', name: t.careerPath },
  ];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (touched.current) return;
      setI((n) => (n + 1) % modules.length);
    }, 7000);
    return () => clearInterval(id);
  }, [modules.length]);

  const go = (n: number) => { touched.current = true; setI(n); };
  const step = (dir: 1 | -1) => setI((n) => (n + (dir === 1 ? 1 : modules.length - 1)) % modules.length);

  /* Pointer events cover mouse, trackpad and touch in one path.
     The card tracks the cursor while the button is held rather than only
     jumping on release: a gesture with no feedback until you let go does not
     read as dragging at all, it reads as nothing happening. `dragged`
     suppresses the click a browser fires at the end of a drag, so the card
     still works as a button into the module when it is clicked rather than
     dragged. */
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragDx, setDragDx] = useState(0);
  const dragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touched.current = true;
    dragged.current = false;
    dragX.current = e.clientX;
    // Keep receiving moves after the cursor leaves the card mid-drag.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragX.current === null) return;
    const raw = e.clientX - dragX.current;
    if (Math.abs(raw) > 8) dragged.current = true;
    /* The stack does not wrap under the finger: past either end there is
       nothing to show, so resist instead of dragging blank space into view.
       Auto-advance and the pager still wrap. */
    const past = (i === 0 && raw > 0) || (i === modules.length - 1 && raw < 0);
    setDragDx(past ? raw * 0.3 : raw);
  };
  /* Horizontal wheel, which is what a trackpad two-finger swipe and a tilting
     mouse wheel both produce. Vertical wheel is deliberately left alone: the
     card sits in the middle of a landing page, and hijacking plain scroll to
     drive a carousel would trap the page. Deltas are accumulated because one
     trackpad gesture fires dozens of events. */
  const wheelAcc = useRef(0);
  const wheelLock = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now < wheelLock.current) return;
    touched.current = true;
    wheelAcc.current += e.deltaX;
    if (Math.abs(wheelAcc.current) < 60) return;
    step(wheelAcc.current > 0 ? 1 : -1);
    wheelAcc.current = 0;
    wheelLock.current = now + 500;
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragX.current === null) return;
    const dx = e.clientX - dragX.current;
    dragX.current = null;
    setDragDx(0);
    // Proportional to the card, with a floor, so a short flick on a phone and
    // a deliberate drag on a wide screen both need about the same intent.
    const threshold = Math.min(90, Math.max(40, (trackRef.current?.offsetWidth || 400) * 0.18));
    if (Math.abs(dx) <= threshold) return;
    setI((n) => Math.min(modules.length - 1, Math.max(0, n + (dx < 0 ? 1 : -1))));
  };


  return (
    <div
      className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center mb-6 pt-2 md:pt-4"
    >
      {/* min-w-0 on both columns: a grid item defaults to min-width:auto, so it
          refuses to shrink below its content's min-content width and overflows
          the container. That pushed the hero copy out past the page padding and
          under the fixed History rail on narrow screens. */}
      <div className="min-w-0 text-center lg:text-start">
        <MarketPicker lang={lang} market={market} onChange={onMarketChange} />

        {/* All five blocks are stacked in one grid cell, so the column is as
            tall as the tallest slide at the current width and nothing below it
            moves as the tour advances. A reserved min-height cannot do this:
            at 1400px every headline is 107px tall, and at 1024px the English
            first slide wraps to 214px, so any fixed value is dead space at one
            width and an overflow at the other. */}
        <div className="grid">
          {modules.map((m, n) => {
            const sl = copy[m.id];
            const on = n === i;
            return (
              <div
                key={m.id}
                aria-hidden={!on}
                className={`col-start-1 row-start-1 transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <span className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">{m.name}</span>
                </span>

                <h1 className="text-[2.35rem] sm:text-5xl lg:text-[3.15rem] font-black tracking-[-0.035em] text-slate-900 leading-[1.06]">
                  <span className="block text-slate-300">{sl.title[0]}</span>
                  <span className="block text-slate-900">{sl.title[1]}</span>
                </h1>

                <p className="mt-4 text-slate-500 text-[15px] font-medium leading-relaxed max-w-lg mx-auto lg:mx-0">
                  {sl.lead}
                </p>

                <ul className="mt-6 space-y-2.5 max-w-lg mx-auto lg:mx-0 text-start">
                  {sl.points.map((pt, k) => (
                    <li key={k} className="flex gap-2.5 text-[13px] font-medium leading-relaxed text-slate-500">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>

                {onOpenModule && (
                  <button
                    onClick={() => onOpenModule(m.id)}
                    tabIndex={on ? 0 : -1}
                    className="group mt-7 inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors"
                  >
                    {lang === 'zh' ? `打开 ${m.name}` : `Open ${m.name}`}
                    <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Outside the keyed block: this is about the account, not the tour, so
            it must not flicker every seven seconds. */}
        {isLoggedIn && historyCount > 0 && (
          <div className="mt-6">
            <button onClick={onOpenHistory} className="inline-flex items-center gap-3 px-5 py-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600 font-black text-[11px] uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {lang === 'zh' ? `从历史记录恢复 (${historyCount}个版本)` : `Restore from History (${historyCount} Versions)`}
            </button>
          </div>
        )}

        <div className="flex items-center justify-center lg:justify-start gap-1 mt-7">
          {modules.map((m, n) => (
            <button key={m.id} onClick={() => go(n)} aria-label={m.name} aria-current={n === i}
                    className="group h-8 pe-3 flex items-center">
              <span className={`h-2 rounded-full transition-all duration-500 ${n === i ? 'w-8 bg-slate-900' : 'w-2 bg-slate-300 group-hover:bg-slate-500'}`} />
            </button>
          ))}
        </div>
      </div>

      <div
        className="min-w-0 touch-pan-y select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => { dragX.current = null; setDragDx(0); }}
        onWheel={onWheel}
      >
        <div className="relative mx-auto w-full max-w-[440px] lg:max-w-none">
          <div className="pointer-events-none absolute -top-16 -right-10 w-72 h-72 bg-indigo-500/15 blur-[90px] rounded-full" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 w-72 h-72 bg-violet-500/15 blur-[90px] rounded-full" />
          <div className="absolute inset-x-6 -top-3 h-8 rounded-t-[2rem] bg-white/70 border border-slate-100 border-b-0" />

          <div className={`relative transition-all duration-700 ease-out ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="overflow-hidden rounded-[2rem]">
              {/* Slides stretch to the flex line height so the frame keeps one
                  size across the tour instead of resizing per screenshot. */}
              <div
                ref={trackRef}
                className="flex"
                style={{
                  transform: `translateX(calc(-${i * 100}% + ${dragDx}px))`,
                  // No easing while the finger is down, or the card lags the cursor.
                  transition: dragDx ? 'none' : 'transform 620ms cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                {modules.map((m, n) => (
                  <div key={m.id} className="w-full shrink-0 flex">
                    <button
                      onClick={() => { if (!dragged.current) onOpenModule?.(m.id); }}
                      className="w-full text-start bg-white rounded-[2rem] border border-slate-100 shadow-[0_30px_70px_-25px_rgba(15,23,42,0.25)] flex flex-col hover:border-indigo-200 transition-colors overflow-hidden"
                    >
                      {/* Window chrome, so the panel below reads as a picture of
                          a screen rather than as more page content. */}
                      <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                        <span className="ms-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">{m.name}</span>
                      </div>
                      {/* Edge to edge under the chrome: padding around a
                          screenshot makes it read as a picture pasted onto a
                          card rather than as the window's own contents. */}
                      <div className="min-h-[21rem] flex-1 overflow-hidden">
                        <img
                          src={`/shots/${m.id}-${shotLang}.jpg`}
                          alt=""
                          width={1000}
                          height={706}
                          /* Not lazy: the off-screen slides live inside a
                             translated track, so a lazily-loaded one can rotate
                             into view still blank. */
                          loading="eager"
                          className="w-full h-full object-cover object-top"
                        />
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InputSectionProps {
  jdText: string;
  setJdText: (text: string) => void;
  onGenerate: (fileInput?: { mimeType: string; data: string } | string) => void;
  onGenerateProject: (fileInput: { mimeType: string; data: string; fileName: string }) => void;
  isLoading: boolean;
  lang: Language;
  onLanguageDetect?: (lang: Language) => void;
  onManualStart?: () => void;
  onOpenHistory?: () => void;
  isLoggedIn?: boolean;
  historyCount?: number;
  onLogin?: () => void;
  /** Lets the feature showcase double as navigation into each module. */
  onOpenModule?: (module: ModuleId) => void;
  market: JobMarket | null;
  onMarketChange: (m: JobMarket) => void;
}

/** Largest file we will base64 and send inline to the model. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const tooLarge = (file: File): boolean => {
  if (file.size <= MAX_UPLOAD_BYTES) return false;
  alert(
    `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. ` +
    `Please upload a file under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
  );
  return true;
};

const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_WIDTH = 1000;
      if (width > MAX_WIDTH) { height = (height * MAX_WIDTH) / width; width = MAX_WIDTH; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/webp', 0.8);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (e) => { URL.revokeObjectURL(img.src); reject(e); };
  });
};

export const InputSection: React.FC<InputSectionProps> = ({ 
    jdText, setJdText, onGenerate, onGenerateProject, isLoading, lang, 
    onLanguageDetect, onManualStart, onOpenHistory, isLoggedIn, historyCount = 0, onLogin, onOpenModule,
    market, onMarketChange 
}) => {
  const [resumeText, setResumeText] = useState('');
  const [inputMode, setInputMode] = useState<'selection' | 'paste'>('selection');
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeFileData, setResumeFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [extractedResumeText, setExtractedResumeText] = useState<string | null>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(null);
  const [projectFileData, setProjectFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [builderMode, setBuilderMode] = useState<'ai' | 'manual'>('ai');

  const [progress, setProgress] = useState(0);
  const t = TRANSLATIONS[lang];
  const [loadingText, setLoadingText] = useState(t.analyzing);
  
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setProgress(0);
      const texts = [t.analyzing || "Analyzing...", "Analyzing skills...", "Matching keywords...", t.finalizing || "Finalizing..."];
      let textIdx = 0;
      setLoadingText(texts[0]);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 98) return prev; 
          // Slower increment to match ~12-15s expectation (avg 0.8% per 100ms)
          const inc = Math.random() * 1 + 0.3;
          
          if (prev > 25 && textIdx === 0) { textIdx=1; setLoadingText(texts[1]); }
          if (prev > 50 && textIdx === 1) { textIdx=2; setLoadingText(texts[2]); }
          if (prev > 75 && textIdx === 2) { textIdx=3; setLoadingText(texts[3]); }
          
          return Math.min(prev + inc, 98);
        });
      }, 100); 
    } else {
      setProgress(0);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isLoading, t.analyzing]);

  const processResumeFile = async (file: File) => {
    if (tooLarge(file)) return;

    setIsProcessing(true);
    setResumeFileName(file.name);
    setProjectFileName(null); 
    setProjectFileData(null);
    const lowerName = file.name.toLowerCase();
    try {
      if (file.type === 'application/pdf') {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = () => reject(new Error('Could not read the file.'));
          reader.readAsDataURL(file);
        });
        setResumeFileData({ mimeType: 'application/pdf', data: dataUrl.split(',')[1] });
      } else if (lowerName.endsWith('.docx')) {
         const arrayBuffer = await file.arrayBuffer();
         const result = await mammoth.extractRawText({ arrayBuffer });
         setExtractedResumeText(result.value);
      } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || file.type === 'text/plain') {
         setExtractedResumeText(await file.text());
      } else if (lowerName.endsWith('.doc')) {
        alert("Legacy .doc files aren't supported. Please save as .docx or PDF and try again.");
        setResumeFileName(null);
      } else {
        alert("Unsupported file type. Please upload a PDF, .docx or .txt resume.");
        setResumeFileName(null);
      }
    } catch (error: any) {
        console.error('Resume file read failed:', error);
        alert(error?.message || "Could not read that file. Please try another one.");
        setResumeFileName(null);
    } finally {
        setIsProcessing(false);
    }
  };

  const processProjectFile = async (file: File) => {
    if (tooLarge(file)) return;
    setIsProcessing(true);
    setProjectFileName(file.name);
    try {
        if (file.name.endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            setProjectFileData({ mimeType: 'text/plain', data: result.value }); 
        } else if (file.type.startsWith('image/')) {
            const compressedBase64 = await compressImage(file);
            setProjectFileData({ mimeType: 'image/webp', data: compressedBase64 });
        } else if (file.type.startsWith('video/')) {
            const frameBase64 = await new Promise<string>((resolve, reject) => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;
                const timeout = setTimeout(() => reject(new Error('Video frame extraction timed out')), 10000);
                video.onloadedmetadata = () => { video.currentTime = Math.min(1, video.duration / 2); };
                video.onseeked = () => {
                    clearTimeout(timeout);
                    const canvas = document.createElement('canvas');
                    let width = video.videoWidth; let height = video.videoHeight;
                    const MAX_DIMENSION = 1200;
                    if (width > height) { if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; } } 
                    else { if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]); } 
                    else { reject(new Error('Canvas context null')); }
                };
                video.onerror = (e) => { clearTimeout(timeout); reject(e); };
                video.src = URL.createObjectURL(file);
            });
            setProjectFileData({ mimeType: 'image/jpeg', data: frameBase64 });
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
              setProjectFileData({ mimeType: file.type || 'application/pdf', data: (ev.target?.result as string).split(',')[1] });
            };
            reader.readAsDataURL(file);
        }
    } catch (e) {
        alert("Error processing file.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handlePasteDetect = async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.length > 50 && onLanguageDetect) {
       const detected = await detectLanguage(text);
       onLanguageDetect(detected);
    }
  };

  const currentResumeInput = resumeText || resumeFileData || extractedResumeText;

  const handleOptimizeClick = async () => {
    if (isSubmitting || isLoading) return;

    if (!isLoggedIn) {
        onLogin && onLogin();
        return;
    }
    if (!currentResumeInput && !projectFileData) {
        alert(t.uploadResume);
        return;
    }

    setIsSubmitting(true);
    try {
      if (projectFileData) {
        await onGenerateProject({ mimeType: projectFileData.mimeType, data: projectFileData.data, fileName: projectFileName! });
      } else if (currentResumeInput) {
        await onGenerate(currentResumeInput);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearResume = () => {
    setResumeText('');
    setResumeFileName(null);
    setResumeFileData(null);
    setExtractedResumeText(null);
    setInputMode('selection');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:pe-24 relative">
      <HeroTour
        t={t}
        lang={lang}
        market={market}
        onMarketChange={onMarketChange}
        isLoggedIn={isLoggedIn}
        historyCount={historyCount}
        onOpenHistory={onOpenHistory}
        onOpenModule={onOpenModule}
      />

      <div className="bg-white rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.08)] border border-slate-100 overflow-hidden relative transition-all duration-500">
        {/* Mode Toggles */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-100 p-1.5 rounded-full flex gap-1 z-30 shadow-inner w-auto max-w-[90%] justify-center">
            <button onClick={() => setBuilderMode('ai')} className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${builderMode === 'ai' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                {t.modeAI || "AI Optimization"}
            </button>
            <button onClick={() => setBuilderMode('manual')} className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${builderMode === 'manual' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                {t.modeManual || "Manual Builder"}
            </button>
        </div>

        {isLoading && (
            <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center p-12">
                <div className="relative mb-10">
                    {/* Modern Spinner */}
                    <div className="w-24 h-24 rounded-full border-[6px] border-slate-100"></div>
                    <div className="absolute inset-0 w-24 h-24 rounded-full border-[6px] border-indigo-600 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-slate-900 font-black text-2xl tracking-tighter">
                        {Math.round(progress)}<span className="text-sm align-top mt-1">%</span>
                    </div>
                </div>

                <div className="text-center w-full max-w-md">
                   <h3 className="text-3xl font-black tracking-tight mb-3 text-slate-900">{loadingText}</h3>
                   <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-8">{t.optimizingAts || 'Optimizing for ATS Compatibility'}</p>
                   
                   {/* Clean Progress Bar */}
                   <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner mb-4">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out relative rounded-full" 
                        style={{ width: `${progress}%` }}
                      >
                          {/* Shimmer Effect */}
                          <div className="absolute top-0 left-0 bottom-0 right-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                      </div>
                   </div>
                   
                   <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wide">{t.timeEstimate}</p>
                   </div>
                </div>
            </div>
        )}
        
        {builderMode === 'ai' ? (
            <div className="grid md:grid-cols-2 pt-24 md:pt-20">
               {/* Left Column: Job Description */}
               <div className="p-8 md:p-12 lg:p-16 border-b md:border-b-0 md:border-r border-slate-100">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                       <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">{t.jdLabel}</h2>
                       <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.1em] mt-2">{t.jdSubLabel}</p>
                    </div>
                    <button onClick={() => setJdText('')} className="text-[10px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-widest pb-1">{t.clear}</button>
                  </div>
                  <div className="h-[300px] md:h-[400px]">
                     <textarea
                      onPaste={handlePasteDetect}
                      className="w-full h-full p-6 md:p-8 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-600 focus:bg-white outline-none resize-none text-slate-700 transition-all font-bold text-sm leading-relaxed"
                      placeholder={t.jdPlaceholder}
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                    />
                  </div>
               </div>

               {/* Right Column: Your Resume */}
               <div className="p-8 md:p-12 lg:p-16 bg-slate-50/20 flex flex-col h-full">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">{t.yourResume}</h2>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.1em] mt-2">{t.resumeSubLabel}</p>
                    </div>
                    {(inputMode === 'paste' || resumeFileName) && (
                      <button onClick={clearResume} className="text-[10px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-widest pb-1">{t.clear}</button>
                    )}
                  </div>

                  <div className="flex-grow">
                    {inputMode === 'selection' && !resumeFileName && !projectFileName ? (
                      <div className="space-y-4 animate-fade-in">
                        {/* Action Cards matching screenshot precisely */}
                        <button 
                          onClick={() => resumeFileInputRef.current?.click()}
                          className="w-full p-5 md:p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl transition-all group flex items-center gap-5"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                          <div className="text-left">
                            <span className="block text-base md:text-lg font-black text-slate-900">{t.uploadResume}</span>
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.uploadResumeSub}</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => setInputMode('paste')}
                          className="w-full p-5 md:p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl transition-all group flex items-center gap-5"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </div>
                          <div className="text-left">
                            <span className="block text-base md:text-lg font-black text-slate-900">{t.pasteResume}</span>
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.pasteResumeSub}</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => projectFileInputRef.current?.click()}
                          className="w-full p-5 md:p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl transition-all group flex items-center gap-5"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="text-left">
                            <span className="block text-base md:text-lg font-black text-slate-900">{t.uploadProject}</span>
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.uploadProjectSub}</span>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="h-[300px] md:h-[400px] flex flex-col animate-fade-in">
                        <textarea
                          onPaste={handlePasteDetect}
                          className="w-full h-full p-6 md:p-8 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-600 focus:bg-white outline-none resize-none text-slate-700 transition-all font-bold text-sm leading-relaxed"
                          placeholder={t.pastePlaceholder}
                          value={resumeText}
                          onChange={(e) => setResumeText(e.target.value)}
                        />
                        {resumeFileName && (
                           <div className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-2xl flex items-center gap-3 font-bold animate-fade-in shadow-lg">
                              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>
                              <span className="truncate">{resumeFileName}</span>
                              <button onClick={clearResume} className="ml-auto hover:text-rose-200">×</button>
                           </div>
                        )}
                        {inputMode === 'paste' && (
                           <button onClick={() => setInputMode('selection')} className="mt-4 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline text-center">{t.backToUpload}</button>
                        )}
                      </div>
                    )}
                  </div>

                  <input type="file" ref={resumeFileInputRef} className="hidden" accept=".pdf,.docx,.txt,.md" onChange={(e) => processResumeFile(e.target.files?.[0] as File)} />
                  <input type="file" ref={projectFileInputRef} className="hidden" accept="*" onChange={(e) => processProjectFile(e.target.files?.[0] as File)} />
                  
                  <div className="mt-8 md:mt-12">
                    <button
                      onClick={handleOptimizeClick}
                      disabled={isLoading || isProcessing || isSubmitting}
                      className={`w-full py-4 md:py-5 rounded-[2rem] font-black text-lg md:text-xl transition-all flex flex-col items-center justify-center gap-1 ${
                        (isLoading || isProcessing || isSubmitting)
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl shadow-indigo-100 hover:-translate-y-1 active:scale-95'
                      }`}
                    >
                      <span>{projectFileData ? t.analyzeProject : t.optimizeResume}</span>
                      <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                        {projectFileData ? `(Costs ${CREDIT_COSTS.portfolioProject} Credits)` : `(Costs ${CREDIT_COSTS.resumeOptimization} Credits)`}
                      </span>
                    </button>
                  </div>
               </div>
            </div>
        ) : (
            // Manual Mode View
            <div className="py-24 md:py-32 px-8 md:px-12 text-center animate-fade-in flex flex-col items-center justify-center">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-8 border border-indigo-100">
                    <svg className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                </div>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-6">{t.manualTitle || "Build from Scratch"}</h2>
                <p className="text-slate-500 font-medium text-base md:text-lg max-w-lg mx-auto mb-12">
                    {t.manualSubtitle || "Start with a professional template and fill in your details manually."}
                </p>
                <button
                    onClick={() => {
                        if (!isLoggedIn) {
                            onLogin && onLogin();
                        } else {
                            onManualStart && onManualStart();
                        }
                    }}
                    className="px-8 md:px-12 py-5 md:py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg md:text-xl uppercase tracking-widest hover:bg-black shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-3"
                >
                    <span>{t.startManual || "Create New Resume"}</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </button>
            </div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes shimmer {
            100% { transform: translateX(100%); }
          }
        `}} />
      </div>

    </div>
  );
};
