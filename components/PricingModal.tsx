import React, { useState } from 'react';
import { FileText, Mail, Briefcase, TrendingUp, Mic, Download } from 'lucide-react';
import { authedFetch } from '../services/supabaseClient';
import { CREDIT_COSTS, DAILY_FREE_CREDITS, interviewCost } from '../credits';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    userEmail?: string;
    message?: string;
    onLogin?: () => void;
}

// Feature copy is generated from the same constants the app charges against,
// so the pricing page can no longer advertise a price the code does not honour.
const RESUME = `AI Resume + Cover Letter (${CREDIT_COSTS.resumeOptimization} Credits)`;
const PORTFOLIO = `AI Portfolio Generation (${CREDIT_COSTS.portfolioProject} Credits)`;
const CAREER = `AI Career Analysis (${CREDIT_COSTS.careerAnalysis} Credits)`;
const STRATEGY = `AI Career Strategy (${CREDIT_COSTS.careerStrategy} Credit)`;
const INTERVIEW = `AI Mock Interview (${interviewCost(5)}-${interviewCost(15)} Credits)`;

const PLANS = [
    {
        name: 'Free Explorer',
        price: '$0.00',
        period: 'Forever',
        credits: DAILY_FREE_CREDITS,
        priceId: 'free',
        features: [`${DAILY_FREE_CREDITS} Daily AI Credits`, RESUME, STRATEGY, 'Daily Reset (Non-cumulative)']
    },
    {
        name: 'Starter',
        price: '$9.99',
        period: 'AUD / month',
        credits: 25,
        priceId: (import.meta as any).env?.VITE_STRIPE_PRICE_STARTER ?? '',
        features: ['25 AI Credits', RESUME, PORTFOLIO, CAREER]
    },
    {
        name: 'Job Hunter Pro',
        price: '$24.99',
        period: 'AUD / month',
        credits: 75,
        priceId: (import.meta as any).env?.VITE_STRIPE_PRICE_PRO ?? '',
        features: ['75 AI Credits', RESUME, PORTFOLIO, INTERVIEW, CAREER]
    },
    {
        name: 'Career Elite',
        price: '$49.99',
        period: 'AUD / month',
        credits: 200,
        priceId: (import.meta as any).env?.VITE_STRIPE_PRICE_MAX ?? '',
        features: ['200 AI Credits', 'All Pro Features', 'Priority Support', 'Early Access to New Features']
    }
];

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, userId, userEmail, message, onLogin }) => {
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubscribe = async (priceId: string) => {
        if (priceId === 'free') {
            onClose();
            return;
        }

        if (!userId) {
            if (onLogin) {
                onLogin();
            } else {
                alert('Please log in to subscribe to a plan.');
            }
            return;
        }
        setLoadingPlan(priceId);
        try {
            const response = await authedFetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId, returnUrl: window.location.origin })
            });
            
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to create checkout session');
            }
            
            window.location.href = result.url;
        } catch (error: any) {
            console.error('Subscription error:', error);
            const errorMessage = error.message || 'Failed to initiate subscription. Please try again.';
            alert(errorMessage);
            setLoadingPlan(null);
        }
    };

    const handleManageBilling = async () => {
        if (!userId || !userEmail) return;
        
        try {
            const response = await authedFetch('/api/create-portal-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.origin })
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to open billing portal');
            window.location.href = result.url;
        } catch (error: any) {
            console.error('Portal error:', error);
            alert(error.message || 'Failed to open billing portal. Make sure Stripe is configured.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto relative">
                <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                <div className="p-8 md:p-12">
                    <div className="text-center mb-12">
                        {message && (
                            <div className="mb-6 bg-rose-50 text-rose-600 px-6 py-4 rounded-2xl font-bold text-sm border border-rose-100 shadow-sm animate-pulse">
                                {message}
                            </div>
                        )}
                        <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">Upgrade Your Career Journey</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto mb-6">Choose the perfect plan to supercharge your job search with AI-powered tools. Get more credits for resume optimization, portfolio generation, and mock interviews.</p>
                        
                        {userId && (
                            <button 
                                onClick={handleManageBilling}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mb-6"
                            >
                                <TrendingUp className="w-3 h-3" />
                                Manage My Subscription
                            </button>
                        )}

                        <div className="mt-2 inline-flex items-center bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-xs font-bold border border-emerald-100 shadow-sm animate-pulse">
                            <span className="mr-2">🎁</span>
                            Daily Bonus: topped up to {DAILY_FREE_CREDITS} free credits every day!
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-2 border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-sm">
                        {PLANS.map((plan, index) => (
                            <div 
                                key={plan.priceId} 
                                className={`p-6 md:p-8 flex flex-col relative group transition-all duration-300 border-slate-100 ${
                                    index < 3 ? 'border-b lg:border-b-0' : ''
                                } ${
                                    index % 2 === 0 ? 'md:border-r' : ''
                                } ${
                                    index < 2 ? 'md:border-b' : ''
                                } ${
                                    index < 3 ? 'lg:border-r' : ''
                                } ${
                                    plan.name === 'Job Hunter Pro' ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'
                                }`}
                            >
                                {plan.name === 'Job Hunter Pro' && (
                                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600"></div>
                                )}
                                <div className="mb-6 md:mb-8">
                                    <h3 className="text-[10px] md:text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-2 md:mb-4">{plan.name}</h3>
                                    <div className="flex items-baseline">
                                        <span className="text-3xl md:text-4xl font-black text-slate-900">{plan.price}</span>
                                        <span className="text-[9px] md:text-[10px] text-slate-400 ml-2 font-bold uppercase tracking-wider">{plan.period}</span>
                                    </div>
                                </div>

                                <div className="mb-6 md:mb-8">
                                    <div className="inline-flex items-center bg-white border border-indigo-100 text-indigo-600 px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-[10px] md:text-xs font-black shadow-sm">
                                        <svg className="w-3 h-3 md:w-4 md:h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {plan.credits} Credits
                                    </div>
                                </div>

                                <ul className="space-y-3 md:space-y-4 mb-8 md:mb-10 flex-grow">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start group/item">
                                            <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-emerald-50 flex items-center justify-center mr-2 md:mr-3 flex-shrink-0 mt-0.5 group-hover/item:bg-emerald-500 transition-colors">
                                                <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-emerald-500 group-hover/item:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <span className="text-[10px] md:text-xs text-slate-600 font-bold leading-relaxed">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button 
                                    onClick={() => handleSubscribe(plan.priceId)}
                                    disabled={loadingPlan !== null}
                                    className={`w-full py-3 md:py-4 rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all duration-300 ${
                                        plan.name === 'Job Hunter Pro' 
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 hover:-translate-y-1' 
                                            : plan.priceId === 'free'
                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100'
                                            : 'bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-200 hover:-translate-y-1'
                                    } ${loadingPlan === plan.priceId ? 'opacity-70 cursor-wait' : ''}`}
                                >
                                    {plan.priceId === 'free' 
                                        ? 'Current Plan' 
                                        : !userId 
                                        ? 'Login' 
                                        : loadingPlan === plan.priceId 
                                        ? '...' 
                                        : 'Select'}
                                </button>
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-12 bg-slate-50/50 rounded-3xl p-8 border border-slate-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                            <h4 className="font-black text-slate-900 text-sm uppercase tracking-[0.2em]">Credit Costs</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-grow">
                                    <div className="text-xs font-bold text-slate-900">Resume Optimization</div>
                                    <div className="text-[10px] text-slate-500 font-medium">AI-powered refinement</div>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">1 Credit</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div className="flex-grow">
                                    <div className="text-xs font-bold text-slate-900">Cover Letter</div>
                                    <div className="text-[10px] text-slate-500 font-medium">Tailored generation</div>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">1 Credit</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Briefcase className="w-5 h-5" />
                                </div>
                                <div className="flex-grow">
                                    <div className="text-xs font-bold text-slate-900">Portfolio Generation</div>
                                    <div className="text-[10px] text-slate-500 font-medium">Showcase your work</div>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">5 Credits</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <div className="flex-grow">
                                    <div className="text-xs font-bold text-slate-900">Career Path Analysis</div>
                                    <div className="text-[10px] text-slate-500 font-medium">Strategic planning</div>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">2 Credits</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Mic className="w-5 h-5" />
                                </div>
                                <div className="flex-grow">
                                    <div className="text-xs font-bold text-slate-900">Mock Interview</div>
                                    <div className="text-[10px] text-slate-500 font-medium">5 / 10 / 15 Minutes</div>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg whitespace-nowrap">3 / 6 / 10 Credits</span>
                            </div>

                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:border-indigo-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Download className="w-5 h-5" />
                                </div>
                                <div className="flex-grow">
                                    <div className="text-xs font-bold text-slate-900">Premium PDF Export</div>
                                    <div className="text-[10px] text-slate-500 font-medium">High-quality download</div>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">1 Credit</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
