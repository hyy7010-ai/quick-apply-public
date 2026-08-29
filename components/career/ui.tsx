import React from 'react';

/**
 * Shared visual primitives for the Career Agent module.
 *
 * These exist so the new screens speak the same visual language as the rest of
 * FastResume rather than looking like a bolted-on admin panel. The house style,
 * as used by InputSection/AnalysisDashboard, is:
 *
 *   - very round containers (2rem–2.5rem), generous padding
 *   - font-black for anything that carries weight; uppercase + wide tracking
 *     for small labels
 *   - primary action is slate-900 that turns indigo on hover and lifts
 *   - soft coloured shadows (shadow-indigo-200) rather than hard borders
 *   - blurred colour blobs as background decoration
 */

/** Small uppercase label above a field or section. */
export const MicroLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ${className}`}
  >
    {children}
  </span>
);

/** The main surface: a large, softly-shadowed white card. */
export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
  decorated?: boolean;
}> = ({ children, className = '', decorated = false }) => (
  <div
    className={`relative bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden ${className}`}
  >
    {decorated && (
      <>
        <div className="pointer-events-none absolute -top-32 -right-24 w-80 h-80 bg-indigo-600/10 blur-[100px] rounded-full" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 w-80 h-80 bg-violet-500/10 blur-[100px] rounded-full" />
      </>
    )}
    <div className="relative">{children}</div>
  </div>
);

/** Inset area inside a Panel — quieter than the surface it sits on. */
export const Inset: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`bg-slate-50 rounded-2xl border border-slate-100 ${className}`}>{children}</div>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

/** Primary is deliberately slate-900, not indigo: indigo is reserved for the
 * hover state and for accents, which is what gives the house style its
 * signature "black button that lights up" feel. */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}) => {
  const sizes = {
    sm: 'px-4 py-2 text-xs rounded-xl',
    md: 'px-6 py-3 text-sm rounded-2xl',
    lg: 'px-10 py-5 text-base rounded-[2rem]',
  }[size];

  const variants = {
    primary:
      'bg-slate-900 text-white shadow-lg shadow-slate-900/10 hover:bg-indigo-600 hover:shadow-indigo-200 hover:-translate-y-0.5 active:scale-[0.98]',
    secondary:
      'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 active:scale-[0.98]',
    ghost: 'text-slate-400 hover:text-slate-700',
  }[variant];

  return (
    <button
      {...rest}
      className={`font-black transition-all duration-300 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center gap-2 ${sizes} ${variants} ${className}`}
    >
      {children}
    </button>
  );
};

/** Text input matching the rounded, low-contrast field style. */
export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...rest
}) => (
  <input
    {...rest}
    className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 focus:outline-none transition-all ${className}`}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className = '',
  children,
  ...rest
}) => (
  <select
    {...rest}
    className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 focus:outline-none transition-all ${className}`}
  >
    {children}
  </select>
);

/** Small status pill. */
export const Chip: React.FC<{
  children: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}> = ({ children, tone = 'slate' }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    slate: 'bg-slate-50 text-slate-500 border-slate-200',
  }[tone];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${tones}`}
    >
      {children}
    </span>
  );
};

export const Alert: React.FC<{ tone: 'error' | 'success'; children: React.ReactNode }> = ({
  tone,
  children,
}) => (
  <div
    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
      tone === 'error'
        ? 'bg-rose-50 border-rose-100 text-rose-700'
        : 'bg-emerald-50 border-emerald-100 text-emerald-700'
    }`}
  >
    {children}
  </div>
);

/** Section heading used at the top of each Career Agent screen. */
export const ScreenHeading: React.FC<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, action }) => (
  <div className="flex items-start justify-between gap-6">
    <div>
      {eyebrow && <MicroLabel>{eyebrow}</MicroLabel>}
      <h2 className="text-3xl font-black tracking-tight text-slate-900">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-slate-500 max-w-lg leading-relaxed">{subtitle}</p>}
    </div>
    {action}
  </div>
);
