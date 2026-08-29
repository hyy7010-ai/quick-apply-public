
import React, { useState, useEffect } from 'react';
import { AnalysisResult, Experience, Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface AnalysisDashboardProps {
  data: AnalysisResult;
  onConfirmExperiences: (selectedIds: string[], selectedVolunteerIds: string[], selectedProjectIds: string[]) => void;
  lang?: Language;
}

// Helper for score progress bar
const ScoreBar = ({ label, score, colorClass, weight }: { label: string, score: number, colorClass: string, weight: string }) => (
    <div className="mb-4">
        <div className="flex justify-between items-end mb-1">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{label}</span>
            <div className="text-right">
                <span className={`text-sm font-black ${colorClass}`}>{score}/100</span>
                <span className="text-[9px] text-slate-400 ml-1 font-bold">({weight})</span>
            </div>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${score}%` }}></div>
        </div>
    </div>
);

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({ data, onConfirmExperiences, lang = 'en' }) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS['en'];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  
  // Toggles for hidden/non-matching items
  const [showHiddenExp, setShowHiddenExp] = useState(false);
  const [showHiddenVol, setShowHiddenVol] = useState(false);
  const [showHiddenProj, setShowHiddenProj] = useState(false);

  useEffect(() => {
     if (data && data.optimizedResume?.experiences) {
         const matches = data.optimizedResume.experiences.filter(e => e.isMatch).map(e => e.id);
         setSelectedIds(matches);
     }
     if (data && data.optimizedResume?.volunteer) {
         const vMatches = (data.optimizedResume.volunteer || []).filter(v => v.isMatch).map(v => v.id);
         setSelectedVolunteerIds(vMatches);
     }
     if (data && data.optimizedResume?.schoolProjects) {
         const pMatches = (data.optimizedResume.schoolProjects || []).filter(p => p.isMatch).map(p => p.id);
         setSelectedProjectIds(pMatches);
     }
  }, [data]);

  const toggleSelection = (id: string, type: 'work' | 'volunteer' | 'project') => {
      if (type === 'volunteer') {
          setSelectedVolunteerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      } else if (type === 'project') {
          setSelectedProjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      } else {
          setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      }
  };

  const toggleExpanded = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleProceed = () => {
      onConfirmExperiences(selectedIds, selectedVolunteerIds, selectedProjectIds);
  };

  const renderExperienceCard = (exp: Experience, type: 'work' | 'volunteer' | 'project' = 'work') => {
      const isSelected = type === 'volunteer' ? selectedVolunteerIds.includes(exp.id) : type === 'project' ? selectedProjectIds.includes(exp.id) : selectedIds.includes(exp.id);
      return (
          <div 
            key={exp.id} 
            onClick={() => toggleSelection(exp.id, type)}
            className={`group relative p-5 rounded-2xl border-2 transition-all cursor-pointer bg-white mb-3 ${isSelected ? 'border-indigo-600 shadow-md shadow-indigo-100' : 'border-slate-100 hover:border-slate-300 opacity-70 hover:opacity-100'}`}
          >
              <div className="flex items-start gap-4">
                  <div className={`mt-1 w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div className="flex-grow">
                      <div className="flex justify-between items-start">
                          <div>
                              <h4 className={`font-bold text-lg leading-tight ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{exp.role}</h4>
                              <p className="text-slate-500 font-medium text-sm mt-0.5">{exp.company}</p>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                               <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded-md uppercase tracking-wider">{exp.period}</span>
                               {exp.isMatch && (
                                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider">
                                      ATS Match
                                  </span>
                               )}
                          </div>
                      </div>
                      
                      <div className="mt-3">
                          <button 
                            onClick={(e) => toggleExpanded(exp.id, e)}
                            className="text-xs font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1 transition-colors"
                          >
                              {expandedIds.includes(exp.id) ? 'Hide bullets' : 'Show bullets'}
                              <svg className={`w-3 h-3 transition-transform ${expandedIds.includes(exp.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          
                          {expandedIds.includes(exp.id) && (
                              <div className="mt-3 pl-4 border-l-2 border-indigo-100 animate-fade-in">
                                  <ul className="list-disc ml-4 text-sm text-slate-600 space-y-2">
                                      {(exp.bullets || []).map((b, i) => (
                                          <li key={i}>{b}</li>
                                      ))}
                                  </ul>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const allExps = data.optimizedResume?.experiences || [];
  const matchingExps = allExps.filter(e => e.isMatch);
  const hiddenExps = allExps.filter(e => !e.isMatch);

  const allVols = data.optimizedResume?.volunteer || [];
  const matchingVols = allVols.filter(v => v.isMatch);
  const hiddenVols = allVols.filter(v => !v.isMatch);

  const allProjs = data.optimizedResume?.schoolProjects || [];
  const matchingProjs = allProjs.filter(p => p.isMatch);
  const hiddenProjs = allProjs.filter(p => !p.isMatch);

  return (
    <div className="max-w-6xl mx-auto px-4 mb-24 text-left">
      {/* Top Grid: Detailed Scoring (Same as before) */}
      <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-xl shadow-slate-200/40 mb-16 relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
         
         <div className="flex items-center justify-between mb-10 pb-10 border-b border-slate-100">
             <div className="flex items-center gap-4">
                 <div className="w-20 h-20 rounded-3xl bg-indigo-600 text-white flex items-center justify-center text-3xl font-black shadow-xl shadow-indigo-200">
                     {data.overallScore}
                 </div>
                 <div>
                     <h2 className="text-3xl font-black text-slate-900 tracking-tight">{t.overallScore || 'Overall Score'}</h2>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{t.basedOnMatch || 'Based on Job Match & Quality'}</p>
                 </div>
             </div>
             <div className="hidden md:block">
                 <div className="flex gap-2">
                     {[...Array(5)].map((_, i) => (
                         <div key={i} className={`w-3 h-3 rounded-full ${i < Math.round(data.overallScore / 20) ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>
                     ))}
                 </div>
             </div>
         </div>

         <div className="grid md:grid-cols-2 gap-16">
             <div>
                 <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                     <span className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2-2z" /></svg>
                     </span>
                     ATS Analysis Breakdown
                 </h3>
                 {data.scoreBreakdown ? (
                     <div>
                         <ScoreBar label="Core Skills Match" score={data.scoreBreakdown.coreSkills} colorClass="text-indigo-600" weight="40%" />
                         <ScoreBar label="Quantified Achievements (STAR)" score={data.scoreBreakdown.starQuality} colorClass="text-emerald-600" weight="30%" />
                         <ScoreBar label="Industry Relevance" score={data.scoreBreakdown.industryRelevance} colorClass="text-amber-600" weight="20%" />
                         <ScoreBar label="Formatting & Health" score={data.scoreBreakdown.formatting} colorClass="text-rose-600" weight="10%" />
                         
                         <div className="mt-8 p-5 bg-slate-50 rounded-2xl border border-slate-100 relative">
                             <h4 className="text-xs font-black text-slate-900 mb-2">AI Feedback:</h4>
                             <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                 {data.scoreBreakdown.explanation || "Your resume has a strong foundation. Focus on adding more metrics to your Experience bullets to boost the STAR score."}
                             </p>
                         </div>
                     </div>
                 ) : (
                     <p className="text-slate-400 font-bold italic">Detailed breakdown unavailable.</p>
                 )}
             </div>

             <div className="space-y-10">
                 <div>
                    <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full"></div> Hard Skills Found
                    </h3>
                    <div className="flex flex-wrap gap-2.5">
                        {(data.hardSkills || []).map((s, i) => (
                          <span key={i} className="px-4 py-2 bg-amber-50 text-amber-900 border border-amber-100 rounded-xl text-xs font-bold shadow-sm">
                            {s}
                          </span>
                        ))}
                    </div>
                 </div>
                 
                 <div className="pt-8 border-t border-slate-100">
                      <h3 className="text-xs font-black text-rose-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                         Missing Keywords
                      </h3>
                      <div className="flex flex-wrap gap-2.5">
                        {data.missingSkills?.map((s, i) => <span key={i} className="px-4 py-2 bg-white text-rose-600 border border-rose-200 rounded-xl text-xs font-bold shadow-sm">{s}</span>)}
                        {(!data.missingSkills || data.missingSkills.length === 0) && <p className="text-sm text-emerald-600 font-bold">Perfect match! No critical keywords missing.</p>}
                      </div>
                 </div>
             </div>
         </div>
      </div>

      {/* Experience Selection */}
      <div className="space-y-12">
          {/* Work Experience */}
          <div>
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Professional Experience</h3>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{selectedIds.length} Roles Selected</span>
                </div>
                <p className="text-slate-400 text-xs font-medium italic">
                  All detected experiences are listed below. Only suitable ones are selected by default.
                </p>
              </div>
              <div className="space-y-1">
                  {matchingExps.length > 0 ? (
                      matchingExps.map(exp => renderExperienceCard(exp, 'work'))
                  ) : (
                      allExps.length > 0 ? (
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center mb-4">
                              <p className="text-sm font-bold text-slate-500">No direct matches found. Please check "Other Roles" below.</p>
                          </div>
                      ) : (
                          <p className="text-slate-400 text-sm">No professional experience detected.</p>
                      )
                  )}
                  
                  {hiddenExps.length > 0 && (
                      <div className="pt-4 border-t border-dashed border-slate-200 mt-4">
                          {!showHiddenExp ? (
                              <button onClick={() => setShowHiddenExp(true)} className="w-full py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                                  <span>Show {hiddenExps.length} Non-Matching Roles</span>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                          ) : (
                              <div className="space-y-1 animate-fade-in">
                                  <div className="flex justify-between items-center mb-2 px-2">
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Non-Matching / Less Relevant</span>
                                      <button onClick={() => setShowHiddenExp(false)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">Hide</button>
                                  </div>
                                  {hiddenExps.map(exp => renderExperienceCard(exp, 'work'))}
                              </div>
                          )}
                      </div>
                  )}
              </div>
          </div>

          {/* School Projects Section */}
          {allProjs.length > 0 && (
            <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-amber-500 tracking-tight flex items-center gap-3">
                        School Projects
                    </h3>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{selectedProjectIds.length} Selected</span>
                </div>
                <div className="space-y-1">
                    {matchingProjs.length > 0 ? (
                        matchingProjs.map(proj => renderExperienceCard(proj, 'project'))
                    ) : (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center mb-4">
                            <p className="text-sm font-bold text-slate-500">No direct project matches found. Check "Other Projects".</p>
                        </div>
                    )}
                    
                    {hiddenProjs.length > 0 && (
                      <div className="pt-4 border-t border-dashed border-slate-200 mt-4">
                          {!showHiddenProj ? (
                              <button onClick={() => setShowHiddenProj(true)} className="w-full py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                                  <span>Show {hiddenProjs.length} Other Projects</span>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                          ) : (
                              <div className="space-y-1 animate-fade-in">
                                  <div className="flex justify-between items-center mb-2 px-2">
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Other Projects</span>
                                      <button onClick={() => setShowHiddenProj(false)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">Hide</button>
                                  </div>
                                  {hiddenProjs.map(proj => renderExperienceCard(proj, 'project'))}
                              </div>
                          )}
                      </div>
                    )}
                </div>
            </div>
          )}

          {/* Volunteer Section */}
          {allVols.length > 0 && (
            <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-indigo-600 tracking-tight flex items-center gap-3">
                        Volunteer Experience
                    </h3>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{selectedVolunteerIds.length} Selected</span>
                </div>
                <div className="space-y-1">
                    {matchingVols.length > 0 ? (
                        matchingVols.map(vol => renderExperienceCard(vol, 'volunteer'))
                    ) : (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center mb-4">
                            <p className="text-sm font-bold text-slate-500">No matching volunteer roles. Check "Other Roles".</p>
                        </div>
                    )}
                    
                    {hiddenVols.length > 0 && (
                      <div className="pt-4 border-t border-dashed border-slate-200 mt-4">
                          {!showHiddenVol ? (
                              <button onClick={() => setShowHiddenVol(true)} className="w-full py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                                  <span>Show {hiddenVols.length} Non-Matching Roles</span>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                          ) : (
                              <div className="space-y-1 animate-fade-in">
                                  <div className="flex justify-between items-center mb-2 px-2">
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Non-Matching / Less Relevant</span>
                                      <button onClick={() => setShowHiddenVol(false)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">Hide</button>
                                  </div>
                                  {hiddenVols.map(vol => renderExperienceCard(vol, 'volunteer'))}
                              </div>
                          )}
                      </div>
                    )}
                </div>
            </div>
          )}

          <div className="text-center pt-10 border-t border-slate-100">
               <button 
                onClick={handleProceed}
                disabled={selectedIds.length === 0 && selectedVolunteerIds.length === 0 && selectedProjectIds.length === 0}
                className="bg-slate-900 text-white text-xl font-black px-12 py-6 rounded-[2rem] hover:bg-indigo-600 transition-all shadow-[0_20px_50px_-10px_rgba(0,0,0,0.2)] hover:shadow-indigo-200 hover:-translate-y-1 active:scale-95 disabled:opacity-30 flex items-center gap-4 mx-auto"
               >
                   Generate Tailored Resume
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
               </button>
               <p className="mt-6 text-sm text-slate-400 font-medium">Step 3 of 3: Finalizing your custom document</p>
          </div>
      </div>
    </div>
  );
};
