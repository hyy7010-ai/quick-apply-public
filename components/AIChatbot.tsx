import React, { useState, useRef, useEffect } from 'react';
import { getAICoachResponse } from '../services/geminiService';
import { PortfolioData, ResumeContent, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import ReactMarkdown from 'react-markdown';

interface AIChatbotProps {
  portfolioData: PortfolioData;
  resumeContent?: ResumeContent | null;
  jdText?: string;
  activeModule: 'resume' | 'portfolio' | 'interview' | 'career' | 'agent';
  coachTrigger?: { role: string; timestamp: number } | null;
  lang?: Language;
}

export const AIChatbot: React.FC<AIChatbotProps> = ({ portfolioData, resumeContent, jdText, activeModule, coachTrigger, lang = 'en' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isVisible = activeModule === 'career';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Proactive Triggers Logic
  useEffect(() => {
    if (coachTrigger && activeModule === 'career' && resumeContent) {
        const userName = (resumeContent?.fullName || '').split(' ')[0] || 'there';
        const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
        const messageTemplate = t.coachTriggerMessage || "{name}, I see you've downloaded the deployment strategy for {role}. Would you like me to help you brainstorm some specific project ideas to fill the Budget Management gap we identified earlier?";
        
        const message = messageTemplate.replace('{name}', userName).replace('{role}', coachTrigger.role);
        
        setMessages(prev => [...prev, { role: 'model', text: message }]);
        setIsOpen(true); // Auto-open on significant action
    }
  }, [coachTrigger]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
      let initialMessage = t.coachGreeting 
        ? t.coachGreeting.replace('{score}', portfolioData.healthScore)
        : `Hello! I'm your AI Career Coach. I've analyzed your resume and portfolio. Your current Health Score is: ${portfolioData.healthScore}/100. How can I help you improve your application today?`;
      
      // Proactive Intelligence for Career Path
      if (activeModule === 'career' && resumeContent) {
          const userName = (resumeContent?.fullName || '').split(' ')[0] || 'there';
          const hasRmit = JSON.stringify(resumeContent).toLowerCase().includes('rmit');
          
          if (hasRmit) {
            initialMessage = lang === 'zh' 
                ? `${userName}，想知道如何利用你的 RMIT 背景来填补目标职位的技能差距吗？`
                : `${userName}, want to know how to leverage your RMIT background to fill skill gaps for your target path?`;
          } else {
            initialMessage = lang === 'zh'
                ? `${userName}，我看到了你的目标路径。我们要讨论一下实现它所需的具体项目吗？`
                : `${userName}, I see your target path. Should we discuss the specific projects you need to reach it?`;
          }
      }
      
      setMessages([{ role: 'model', text: initialMessage }]);
    }
  }, [isOpen, messages.length, portfolioData.healthScore, activeModule, resumeContent, lang]);

  const handleSendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { role: 'user' as const, text: input };
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    setInput('');
    setIsTyping(true);

    try {
      const chatHistoryForGemini = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));
      chatHistoryForGemini.push({ role: 'user', parts: [{ text: input }] });

      // Fixed: Passing resumeContent, jdText, and lang to match updated getAICoachResponse signature
      const responseText = await getAICoachResponse(chatHistoryForGemini, portfolioData, resumeContent, jdText, lang as Language);
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error("Error sending message to AI coach:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Oops! Something went wrong. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[999] no-print">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xl hover:scale-110 transition-all border border-white/20"
          title="Open AI Career Coach"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="bg-white rounded-3xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25)] border border-slate-100 w-96 h-[600px] flex flex-col animate-fade-in relative bottom-0 right-0">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-3xl text-white">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">✨</div>
                <h3 className="text-lg font-black uppercase tracking-widest text-sm">Coach Intelligence</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-indigo-200 text-2xl font-bold p-1 leading-none">
              &times;
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/30">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[90%] px-5 py-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'
                  }`}
                >
                  {msg.role === 'model' ? (
                      <ReactMarkdown 
                        className="prose prose-sm prose-indigo prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 max-w-none text-slate-700"
                        components={{
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-bold text-indigo-900" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2" {...props} />,
                            li: ({node, ...props}) => <li className="mb-1" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 mt-3 mb-2" {...props} />,
                        }}
                      >
                          {msg.text}
                      </ReactMarkdown>
                  ) : (
                      msg.text
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="max-w-[75%] px-5 py-3 rounded-2xl bg-white text-slate-800 text-sm rounded-bl-none border border-slate-100">
                  <div className="flex space-x-1">
                    <span className="animate-bounce dot-1">.</span>
                    <span className="animate-bounce dot-2">.</span>
                    <span className="animate-bounce dot-3">.</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-5 border-t border-slate-100 bg-white rounded-b-3xl">
            <div className="flex items-center gap-3 bg-slate-100 rounded-2xl px-4 py-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                placeholder="Ask your career coach..."
                className="flex-grow py-3 bg-transparent outline-none text-sm font-medium"
                disabled={isTyping}
              />
              <button
                onClick={handleSendMessage}
                className="text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-30"
                disabled={isTyping || input.trim() === ''}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .dot-1 { animation-delay: 0s; }
        .dot-2 { animation-delay: 0.2s; }
        .dot-3 { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.3); }
          40% { transform: scale(1); }
        }
        .animate-bounce {
          animation: bounce 1s infinite;
          display: inline-block;
        }
      `}} />
    </div>
  );
};