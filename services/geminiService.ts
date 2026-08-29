
import type { GenerateContentResponse } from "@google/genai";
import { AnalysisResult, Project, ResumeContent, CareerPredictionResult, JobMarket, Language, CareerProfile, CanonicalJob, JobMatchResult } from "../types";
import { authedFetch } from "./supabaseClient";
import {
  MATCH_MODEL,
  MATCH_RESPONSE_SCHEMA,
  buildMatchPrompt,
  buildMatchSystemInstruction,
  parseMatchResult,
} from "./career/matchPrompt";

export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

/** Error carrying the HTTP status, so retry logic can tell 429 from 402. */
export class GeminiRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GeminiRequestError';
  }
}

export const generateContentFromBackend = async (options: any): Promise<GenerateContentResponse> => {
  const response = await authedFetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'generateContent', ...options })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new GeminiRequestError(
      errorData.error || `Request failed (${response.status})`,
      response.status
    );
  }

  return await response.json();
};

/**
 * Retry only what is worth retrying, and stay inside a budget the user can wait
 * out. The previous settings (5 retries x 45s timeout with growing backoff)
 * could leave someone staring at a progress bar for four minutes.
 */
export async function callGeminiWithRetry<T>(
  apiCall: () => Promise<T>,
  retries = 2,
  delay = 3000,
  timeoutMs = 60000
): Promise<T> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The AI took too long to respond. Please try again.')), timeoutMs);
    });
    try {
      return await Promise.race([apiCall(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (error: any) {
    const status = error?.status;
    // 402 (out of credits) and 401 (signed out) are the user's problem to fix;
    // retrying them just wastes their time.
    const isRetryable = status === 429 || status === 502 || status === 503;

    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiWithRetry(apiCall, retries - 1, delay * 2 + Math.random() * 500, timeoutMs);
    }
    throw error;
  }
}

export interface FileInput {
  mimeType: string;
  data: string;
}

export const analyzeResume = async (
  jdText: string, 
  resumeInput?: string | FileInput,
  targetLang: Language = 'en',
  enVariant: string = 'American',
  market: JobMarket = 'AU'
): Promise<AnalysisResult> => {
  console.log('analyzeResume called with JD length:', jdText.length, 'and input type:', typeof resumeInput);
  const model = "gemini-flash-latest";
  const isTextResume = typeof resumeInput === 'string';
  
  let userContentPart: any;
  let isFile = false;

  if (typeof resumeInput === 'object' && resumeInput !== null) {
     isFile = true;
     userContentPart = { inlineData: { mimeType: resumeInput.mimeType, data: resumeInput.data } };
  } else {
     userContentPart = { text: resumeInput || "No resume provided" };
  }

  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];

  const systemInstruction = `
    Role: Expert Resume Parser & ATS Strategist.
    CRITICAL OBJECTIVE: Extract COMPLETE history, optimize with STAR method, and write a 300-400 word cover letter.
    MATCHING REGIME: Be EXTREMELY STRICTOR with the 'overallScore'.
    - If the [TARGET JD] is non-informative (e.g., "hi", "test", "hello", "123", or extremely short < 50 characters), the match score MUST be very low (0-5%). This is because a real match cannot be verified against no requirements.
    - VALIDATION: A match score > 80% should only occur if the candidate's resume shows clear, specific alignment with the requirements in the JD. 
    - RELEVANCE: Look for semantic matching between resume experiences and JD requirements. If the JD is just a greeting or a single word, there is NO match.
    - Penalize heavily (at least -40 points) for missing core hard skills or industry-specific tools mentioned in a valid JD.
    Output ONLY in ${langName}.
    LANGUAGE VARIANT: ${enVariant}
    ${market === 'CN' ? `
    RESUME CONVENTION — CHINA:
    Order the resume 个人信息 / 教育背景 / 工作经历 / 项目经历 / 技能 / 荣誉.
    Education comes before work history: Chinese employers read the school
    first, and for anyone under about thirty it carries more weight than the
    first job. Keep it to one page. State degree, school and dates plainly.
    Reverse-chronological within each section. Do not use the STAR narrative
    shape; write results-first bullets, dense and concrete.
    Leave room for a photo in the header — do not invent one, and do not add
    age or gender unless the profile already holds them from the resume.` : `
    RESUME CONVENTION — WESTERN / ATS:
    Order the resume Summary / Experience / Education / Skills. Experience comes
    first: employers here read what you have done before where you studied.
    Use the STAR shape in bullets, one result each, quantified where the source
    supports it.
    NEVER include a photo, age, date of birth, gender, marital status or
    nationality, even if the source resume has them. They are protected
    attributes here: including them is a liability for the employer and marks
    the candidate down.`}
  `;

  const promptText = `
    [TARGET JD]
    ${jdText}
    [RESUME SOURCE]
    ${isFile ? 'Analyze the attached file for full work history extraction.' : userContentPart.text}
  `;

  const parts: any[] = [{ text: promptText }];
  if (isFile) parts.push(userContentPart);

  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
      model: model,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            overallScore: { type: Type.NUMBER },
            scoreBreakdown: {
                type: Type.OBJECT,
                properties: {
                    coreSkills: { type: Type.NUMBER },
                    starQuality: { type: Type.NUMBER },
                    industryRelevance: { type: Type.NUMBER },
                    formatting: { type: Type.NUMBER },
                    explanation: { type: Type.STRING }
                },
                required: ['coreSkills', 'starQuality', 'industryRelevance', 'formatting', 'explanation']
            },
            weights: {
              type: Type.OBJECT,
              properties: { jdRequirements: { type: Type.NUMBER }, skillOverlap: { type: Type.NUMBER } }
            },
            hardSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            coverLetter: { type: Type.STRING },
            optimizedResume: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                jobTitle: { type: Type.STRING, description: "The candidate's current or target job title" },
                contactInfo: { type: Type.STRING },
                summary: { type: Type.STRING },
                technicalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                education: { 
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { school: { type: Type.STRING }, degree: { type: Type.STRING }, startDate: { type: Type.STRING }, endDate: { type: Type.STRING }, gpa: { type: Type.STRING } }
                  } 
                },
                experiences: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, period: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } }, isMatch: { type: Type.BOOLEAN } },
                    required: ["role", "company", "period", "bullets", "isMatch"]
                  }
                },
                volunteer: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, period: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } }, isMatch: { type: Type.BOOLEAN } }, required: ["role", "company", "period", "bullets", "isMatch"] } },
                schoolProjects: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, period: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } }, isMatch: { type: Type.BOOLEAN } }, required: ["role", "company", "period", "bullets", "isMatch"] } },
                awards: { type: Type.ARRAY, items: { type: Type.STRING } },
                references: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, fullName: { type: Type.STRING }, jobTitle: { type: Type.STRING }, company: { type: Type.STRING }, contactInfo: { type: Type.STRING }, relationship: { type: Type.STRING } }, required: ["fullName", "jobTitle", "company"] } }
              },
              required: ["fullName", "jobTitle", "summary", "technicalSkills", "experiences"]
            }
          },
          required: ["detectedLanguage", "overallScore", "scoreBreakdown", "optimizedResume"]
        }
      }
    }));
    
    const parsed = JSON.parse(response.text || '{}') as AnalysisResult;

    if (parsed.optimizedResume) {
        const timestamp = Date.now();
        parsed.optimizedResume.experiences = parsed.optimizedResume.experiences?.map((e, i) => ({ ...e, id: e.id || `exp-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.volunteer = parsed.optimizedResume.volunteer?.map((e, i) => ({ ...e, id: e.id || `vol-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.schoolProjects = parsed.optimizedResume.schoolProjects?.map((e, i) => ({ ...e, id: e.id || `proj-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.education = parsed.optimizedResume.education?.map((e, i) => ({ ...e, id: e.id || `edu-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.references = parsed.optimizedResume.references?.map((e, i) => ({ ...e, id: e.id || `ref-${timestamp}-${i}` })) || [];
    }

    return parsed;
  } catch (error) { throw error; }
};

export const analyzeProjectMedia = async (
  inputData: string, 
  mimeType: string,
  fileName: string,
  targetLang: Language = 'en'
): Promise<Omit<Project, 'id' | 'originalFileName' | 'originalMimeType' | 'base64Data'>> => {
  const model = "gemini-flash-latest";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
  
  const systemInstruction = `
    Role: Creative Portfolio Director & Copywriter.
    Objective: Create a high-impact portfolio entry for the provided file.
    
    Guidelines:
    1. TITLE: Create a punchy, professional title (e.g., "Brand Identity Design" instead of "logo.png").
    2. DESCRIPTION: Write a compelling 3-4 sentence narrative explaining the project's goals, the skills used, and the presumed impact.
    3. CATEGORY: Classify precisely (e.g., Visual Design, Strategy Report, UI/UX Concept).
    
    Language: ${langName} ONLY.
  `;
  
  const parts: any[] = [];
  if (mimeType === 'text/plain') parts.push({ text: `Content of file: ${inputData.substring(0, 8000)}` });
  else parts.push({ inlineData: { data: inputData, mimeType } });
  
  parts.push({ text: `Analyze the file "${fileName}" and generate a professional portfolio title and executive description.` });

  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
      model, 
      contents: { parts }, 
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING },
            type: { type: Type.STRING },
            description: { type: Type.STRING },
            keyCompetencies: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "category", "description", "keyCompetencies"]
        }
      },
    }));
    const result = JSON.parse(response.text || '{}');
    return { 
      category: result.category || 'Professional Project', 
      type: result.type || 'Document', 
      title: result.title || fileName, 
      description: result.description || 'Analysis complete.', 
      associatedSkills: result.keyCompetencies || [] 
    };
  } catch (error) {
    console.error("analyzeProjectMedia error:", error);
    // Deliberately rethrow. Returning a placeholder entry here would look like
    // success to the caller, which then charges the user for it.
    throw error;
  }
};

export const generatePortfolioBio = async (projects: Project[], resume: ResumeContent | null, targetLang: Language = 'en'): Promise<{ bio: string; role: string }> => {
    const model = "gemini-flash-latest";
    const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
    
    const systemInstruction = `
      Role: World-class Personal Branding Expert.
      Task: Write a punchy, inspiring 2-3 sentence "About Me" bio and a definitive job title.
      
      Context:
      - Use the Resume Summary for core history.
      - Use the Portfolio Projects to show what the candidate is actively working on.
      
      Style: Modern, confident, and professional. NO clichés like "passionate professional".
      Language: ${langName} ONLY.
    `;
    
    const prompt = `
      [RESUME DATA]
      ${resume?.summary || 'No summary available'}
      [PORTFOLIO PROJECT TITLES]
      ${projects.map(p => p.title).join(', ')}
    `;
    
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({ 
          model, 
          contents: prompt, 
          config: { 
            systemInstruction, 
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                bio: { type: Type.STRING },
                role: { type: Type.STRING }
              },
              required: ["bio", "role"]
            }
          } 
        }));
        return JSON.parse(response.text || '{}');
    } catch (e) { 
      return { bio: "Professional portfolio showcasing creative work and strategic projects.", role: resume?.targetJobTitle || "Professional" }; 
    }
};

export const generateDocumentSummary = async (base64Data: string, mimeType: string, targetLang: Language = 'en'): Promise<{ summary: string; keyPoints: string[] }> => {
    const model = "gemini-flash-latest";
    const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
    try {
        const parts: any[] = [];
        if (mimeType === 'text/plain') parts.push({ text: base64Data.substring(0, 10000) });
        else parts.push({ inlineData: { data: base64Data, mimeType } });
        parts.push({ text: `Summarize in ${langName} and extract 3-5 key competencies.` });
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
            model, contents: { parts }, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } } } } }
        }));
        return JSON.parse(response.text || '{}');
    } catch (e) { return { summary: "Analysis unavailable.", keyPoints: [] }; }
};

export const generateCareerPrediction = async (
  projects: Project[],
  resume: ResumeContent | null,
  targetRole?: string,
  targetLang: Language = 'en'
): Promise<CareerPredictionResult> => {
  const model = "gemini-flash-latest";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];

  const systemInstruction = `
    Role: Career Futurist and Executive Recruiter.
    Task: Suggest 3 potential career paths.
    CRITICAL: The current year is 2026. All career trajectories and skill milestones MUST start from 2026 and move forward (e.g., 2026, 2027, 2028). DO NOT include years prior to 2026.
    CRITICAL: For each path, "description" MUST be a detailed, 3-4 sentence professional overview.
    *** TARGET LANGUAGE: ${langName} ***
  `;

  const prompt = `
    [RESUME] ${resume?.summary || ''}
    [PROJECTS] ${projects.map(p => p.title).join(', ')}
    ${targetRole ? `TARGET ROLE REQUESTED: ${targetRole}` : 'Predict the best natural evolution.'}
  `;

  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
      model,
      contents: prompt,
      config: { 
          systemInstruction, 
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  currentLevel: { type: Type.STRING },
                  skillTrajectory: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { year: { type: Type.STRING }, skill: { type: Type.STRING } } } },
                  paths: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              role: { type: Type.STRING },
                              match: { type: Type.NUMBER },
                              salaryRange: { type: Type.STRING },
                              timeToReach: { type: Type.STRING },
                              description: { type: Type.STRING },
                              missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } }
                          }
                      }
                  },
                  actionPlan: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              step: { type: Type.STRING },
                              description: { type: Type.STRING },
                              impact: { type: Type.STRING }
                          }
                      }
                  }
              }
          }
      }
    }));
    return JSON.parse(response.text || '{}');
  } catch (error) {
    // Rethrow rather than returning an empty prediction that renders as a
    // broken-looking result the user has already paid for.
    throw error;
  }
};

export const generateCareerStrategy = async (
    resume: ResumeContent | null,
    projects: Project[],
    targetRole: string,
    missingSkills: string[],
    targetLang: Language = 'en'
): Promise<any> => {
    const model = "gemini-flash-latest";
    const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
            model,
            contents: `Generate an INTERNAL DEPLOYMENT STRATEGY for "${targetRole}" in ${langName}.`,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        gapFix: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING }, advice: { type: Type.STRING }, resource: { type: Type.STRING } } } },
                        interviewPrep: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, suggestedAnswer: { type: Type.STRING } } } },
                        portfolioUpgrade: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, strategy: { type: Type.STRING } } } }
                    }
                }
            }
        }));
        return JSON.parse(response.text || '{}');
    } catch (error) { throw error; }
};

export const getAICoachResponse = async (chatHistory: any[], portfolioData: any, resumeContent: any, jdText: any, targetLang: Language = 'en'): Promise<string> => {
  const model = "gemini-flash-latest";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
  
  const systemInstruction = `
    Role: AI Career Coach & Recruitment Expert.
    Context: You are analyzing the user's Portfolio, Resume, and Target Job Description.
    Goal: Provide actionable, specific advice to improve their application and career prospects.
    Tone: Professional, encouraging, and direct.
    CRITICAL: You MUST reply in ${langName} ONLY.
  `;
  
  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({ 
        model, 
        contents: chatHistory, 
        config: { systemInstruction } 
    }));
    return response.text || "No response.";
  } catch (error: any) {
    return error?.message || "I'm having trouble connecting right now. Please try again.";
  }
};

export const analyzeWebsiteContent = async (
  htmlContent: string,
  targetLang: Language = 'en'
): Promise<{ projects: Omit<Project, 'id' | 'originalFileName' | 'originalMimeType' | 'base64Data'>[] }> => {
  const model = "gemini-flash-latest";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];

  const systemInstruction = `
    Role: Portfolio Curator & Content Strategist.
    Task: Analyze the provided website HTML content and extract distinct portfolio projects.
    Objective: Identify key projects, case studies, or work samples.
    Guidelines:
    1. For each project, extract a Title, a Category (e.g., Web Design, Case Study), and a Description (3-4 sentences).
    2. Identify Key Competencies/Skills used in each project.
    3. If there are no clear projects, summarize the website's main sections as "projects" (e.g., "About Me", "Services").
    Language: ${langName} ONLY.
  `;

  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
      model,
      contents: `Analyze this website content and extract portfolio projects:\n\n${htmlContent.substring(0, 30000)}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  category: { type: Type.STRING },
                  description: { type: Type.STRING },
                  associatedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  externalLink: { type: Type.STRING }
                },
                required: ["title", "category", "description", "associatedSkills"]
              }
            }
          }
        }
      }
    }));
    return JSON.parse(response.text || '{ "projects": [] }');
  } catch (error) {
    console.error("Website analysis failed", error);
    return { projects: [] };
  }
};

/**
 * Career Agent — explainable Career Fit / Match Score for one job.
 *
 * The prompt, schema and result normalisation live in
 * services/career/matchPrompt.ts so the Chrome extension scores jobs with the
 * exact same rules; this function is only the transport.
 */
export const generateJobMatchScore = async (
  profile: CareerProfile,
  job: CanonicalJob,
  targetLang: Language = 'en'
): Promise<JobMatchResult> => {
  const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
    model: MATCH_MODEL,
    contents: buildMatchPrompt(profile, job),
    config: {
      systemInstruction: buildMatchSystemInstruction(targetLang),
      responseMimeType: "application/json",
      responseSchema: MATCH_RESPONSE_SCHEMA,
    }
  }));

  return parseMatchResult(JSON.parse(response.text || '{}'));
};

export const detectLanguage = async (text: string): Promise<Language> => {
  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => generateContentFromBackend({
      model: "gemini-flash-latest",
      contents: `Detect lang: "${text.substring(0, 100)}". Return ONLY 2-letter code.`,
    }));
    const code = response.text?.trim().toLowerCase();
    const valid: Language[] = ['en', 'zh', 'ja', 'ko', 'es', 'de', 'fr', 'ar'];
    return valid.includes(code as Language) ? (code as Language) : 'en';
  } catch (e) { return 'en'; }
};
