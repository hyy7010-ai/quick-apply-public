

export enum ResumeStyle {
  CLASSIC = 'Classic (Serif)',
  MODERN = 'Modern (Sans)',
  CREATIVE = 'Creative (Two-Column)',
}

// Fix: Expanded Template type to include Retro, Studio, and Pop for portfolio layouts
export type Template = 'Minimalist' | 'Professional' | 'Creative' | 'Academic' | 'Grid' | 'Retro' | 'Studio' | 'Pop';

export type Language = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'de' | 'fr' | 'ar';

export interface Skill {
  name: string;
  type: 'hard' | 'soft';
  matched: boolean;
}

export interface Experience {
  id: string;
  role: string;
  company: string;
  period: string;
  bullets: string[];
  isMatch: boolean;
  visible?: boolean; 
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

export interface ReferenceItem {
  id: string;
  fullName: string;
  jobTitle: string;
  company: string;
  contactInfo: string;
  relationship: string;
}

export interface ResumeContent {
  fullName: string;
  jobTitle?: string;
  contactInfo: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary: string;
  targetJobTitle?: string;
  targetCompany?: string;
  targetAddress?: string;
  recipientName?: string;
  technicalSkills: string[];
  softSkills: string[];
  experiences: Experience[];
  volunteer: Experience[];
  schoolProjects: Experience[]; // Added for School Projects
  education: EducationItem[];
  references: ReferenceItem[];
  awards?: string[];
}

export interface ScoreBreakdown {
  coreSkills: number; // 40%
  starQuality: number; // 30%
  industryRelevance: number; // 20%
  formatting: number; // 10%
  explanation: string;
}

export interface AnalysisResult {
  id?: string;
  timestamp?: number;
  detectedLanguage?: Language;
  overallScore: number;
  scoreBreakdown: ScoreBreakdown; // Detailed scoring
  weights: {
    jdRequirements: number;
    skillOverlap: number;
  };
  hardSkills: string[];
  softSkills: string[];
  missingSkills: string[];
  optimizedResume: ResumeContent;
  coverLetter: string;
}

export interface Project {
  id: string;
  // Relaxed types to support AI Classification
  type: string; // e.g., 'UI/Code', 'Photo', 'Document', 'Video'
  category: string; // e.g., 'Visual Design', 'Marketing Strategy', 'Video Content'
  originalMimeType: string;
  base64Data: string;
  title: string; 
  description: string; 
  originalFileName: string;
  associatedSkills?: string[]; // Key Competencies
  // New Social & Link Fields
  externalLink?: string;
  socialPlatform?: string; 
  customQrCode?: string; 
  section?: string;
}

export interface UserProfile {
  country: string;
  role: string; 
  photo: string | null; 
  bio?: string; 
}

export interface Theme {
  color: string; 
  secondaryColor?: string; 
  template: Template; 
}

export interface PortfolioData {
  userProfile: UserProfile;
  theme: Theme;
  projects: Project[];
  sections?: string[]; 
  healthScore: number;
  jobPackage: {
    resume: ResumeContent | null;
    coverLetter: string | null;
  };
}

// New Types for Career Predictor
export interface CareerPath {
  role: string;
  match: number;
  salaryRange: string;
  timeToReach: string;
  description: string;
  missingSkills: string[];
  reasoning?: string[];
  targetCompanies?: string[];
  detailedPlan?: { step: string; description: string; impact: string }[];
}

export interface CareerPredictionResult {
  currentLevel: string;
  skillTrajectory: { year: string; skill: string }[];
  paths: CareerPath[];
  actionPlan: { step: string; description: string; impact: string }[];
}

// ---------------------------------------------------------------------------
// Career Agent — Phase 1 (Career Profile, Jobs, Match Snapshots)
// ---------------------------------------------------------------------------

export type JobMarket = 'AU' | 'CN';

export type RemotePreference = 'remote' | 'hybrid' | 'onsite' | 'flexible';

/** A skill the AI derived from the resume, tagged with provenance/confidence
 * so the UI can show it as a suggestion rather than an asserted fact. */
export interface DerivedSkill {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  source: string; // e.g. "Software Engineer @ Acme, 2022-2024"
}

/** One entry in the Career Profile "fact whitelist" — something the user has
 * explicitly confirmed. Downstream generation must ground itself in these. */
export interface ConfirmedFact {
  id: string;
  category: 'education' | 'experience' | 'certification' | 'achievement' | 'other';
  text: string;
  confirmedAt: string; // ISO timestamp
}

/** A work-history entry imported from a resume and confirmed by the user. */
export interface WorkHistoryEntry {
  id: string;
  role: string;
  company: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  summary?: string;
  /** False until the user has reviewed the AI's extraction. */
  confirmed: boolean;
}

export interface EducationEntry {
  id: string;
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  confirmed: boolean;
}

export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type GenderOption = 'female' | 'male' | 'self-described' | 'prefer-not-to-say';

/**
 * Optional, user-supplied demographics.
 *
 * *** NEVER pass this to match scoring, ranking, or filtering. ***
 * Age and gender are protected attributes; the product strategy forbids using
 * them for ranking, and in Australia employers may not ask at all. They exist
 * only for Chinese-market resume rendering (where 性别/年龄 are conventional)
 * and for future application-form autofill. Age is a band, never an exact
 * value, so it is too coarse to filter individuals on.
 */
export interface OptionalDemographics {
  ageBand?: AgeBand;
  gender?: GenderOption;
  genderSelfDescribed?: string;
}

/**
 * A reusable answer to an application question.
 *
 * `category` decides whether autofill may write it without asking. Anything in
 * HIGH_STAKES_CATEGORIES is surfaced for confirmation every time — a wrong
 * salary or visa answer on a submitted application cannot be edited afterwards.
 */
export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  category: 'salary' | 'visa' | 'relocation' | 'availability' | 'motivation' | 'general';
  confirmed: boolean;
  updatedAt: string;
}

/** Categories autofill must never write unattended. */
export const HIGH_STAKES_CATEGORIES = ['salary', 'visa', 'relocation', 'availability'] as const;

export interface CareerProfile {
  userId: string;
  fullName?: string;
  headline?: string;
  /** Structured contact details, kept separately from the resume's free-text
   * contactInfo line because a form field needs one value, not a sentence. */
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  savedAnswers: SavedAnswer[];
  targetTitles: string[];
  targetLocations: string[];
  targetIndustries: string[];
  seniority?: string;
  workRights?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  remotePreference?: RemotePreference;
  languages: string[];
  sourceResumeId?: string; // uuid — see 0002_career_agent.sql for why
  derivedSkills: DerivedSkill[];
  confirmedFacts: ConfirmedFact[];
  workHistory: WorkHistoryEntry[];
  education: EducationEntry[];
  certifications: string[];
  /** Unpaid roles: societies, charities, community work. Same shape as
   * workHistory, because for a graduate this is often the strongest evidence
   * they have and scoring must weigh it the same way. */
  volunteer?: WorkHistoryEntry[];
  /** Awards, honours, competition placings. */
  awards?: string[];
  factsConfirmedAt?: string;
  importedFromResumeAt?: string;
  /** Optional. Excluded from match scoring by design — see the type's docs. */
  optionalDemographics: OptionalDemographics;
  updatedAt: string;
}

/** Fields a user provides when creating/editing their profile. `userId` and
 * `updatedAt` are server-set. */
export type CareerProfileInput = Omit<CareerProfile, 'userId' | 'updatedAt'>;

/** A job posting the user has manually entered or (in a later phase)
 * imported via a source connector. */
export interface CanonicalJob {
  id: number;
  userId: string;
  source: string; // open-ended; see services/career/connectors/sources.ts
  market: JobMarket;
  sourceUrl?: string;
  title: string;
  company: string;
  location?: string;
  descriptionText: string;
  salaryText?: string;
  employmentType?: string;
  seniority?: string;
  jobFamily?: string; // reserved for future Outcome Learning, unused in Phase 1
  postedAt?: string;
  isStale: boolean;
  capturedAt: string;
  updatedAt: string;
}

export type CanonicalJobInput = Pick<
  CanonicalJob,
  'market' | 'title' | 'company' | 'descriptionText'
> &
  Partial<Pick<CanonicalJob, 'source' | 'sourceUrl' | 'location' | 'salaryText' | 'employmentType' | 'seniority'>>;

export interface JobMatchDimension {
  score: number; // 0-100
  weight: number; // 0-1
  notes: string;
}

export interface JobMatchBreakdown {
  hardRequirements: JobMatchDimension;
  skillsExperience: JobMatchDimension;
  goalsPreferences: JobMatchDimension;
  opportunityQuality: JobMatchDimension;
  historicalOutcomes: JobMatchDimension; // score/weight are 0 during cold start
}

export type RecommendedAction = 'priority_apply' | 'apply' | 'consider' | 'skip';

/** The raw result of scoring a job against a profile, before it is persisted
 * as an immutable MatchSnapshot row. */
export interface JobMatchResult {
  overallScore: number;
  scoreBreakdown: JobMatchBreakdown;
  hardGaps: string[];
  recommendedAction: RecommendedAction;
  modelVersion?: string;
}

/** An immutable, persisted match result. Re-scoring the same job creates a
 * new snapshot rather than overwriting this one. */
export interface MatchSnapshot extends JobMatchResult {
  id: number;
  userId: string;
  jobId: number;
  careerProfileSnapshot: CareerProfile;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Career Agent — Phase 1 Steps 8-10 (Application Tracker)
// ---------------------------------------------------------------------------

export type ApplicationStatus =
  | 'saved'
  | 'preparing'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type AppliedVia = 'extension_autofill' | 'manual' | 'unknown';

/** An answer to an application question, kept so the same question never has
 * to be answered from scratch twice. */
export interface QuestionAnswer {
  question: string;
  answer: string;
  /** High-stakes answers (salary, visa, relocation) require explicit user
   * confirmation before reuse. */
  confirmed: boolean;
}

/** One application: binds a job to the exact match snapshot and resume
 * version it was made with, so interview prep and later outcome analysis
 * read the materials actually submitted. */
export interface Application {
  id: number;
  userId: string;
  jobId: number;
  matchSnapshotId?: number;
  tailoredResumeId?: number;
  status: ApplicationStatus;
  appliedVia?: AppliedVia;
  appliedAt?: string;
  questionAnswers: QuestionAnswer[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** An application joined with the job it targets — what the tracker board
 * renders. */
export interface ApplicationWithJob extends Application {
  job: CanonicalJob;
}

export interface ApplicationStatusEvent {
  id: number;
  applicationId: number;
  status: ApplicationStatus;
  note?: string;
  changedAt: string;
}

/** A resume + cover letter generated specifically for one job.
 * Stored in its own table, not resume_history — see the header of
 * 0004_applications.sql for why. */
export interface TailoredResume {
  id: number;
  userId: string;
  jobId: number;
  content: AnalysisResult;
  coverLetter?: string;
  modelVersion?: string;
  createdAt: string;
}