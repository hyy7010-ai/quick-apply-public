import type {
  AnalysisResult,
  ApplicationWithJob,
  CanonicalJob,
  CareerPredictionResult,
  CareerProfile,
  MatchSnapshot,
  TailoredResume,
} from '../../types';

/**
 * A worked example of the Career Agent, for people who have not signed in.
 *
 * Landing on a sign-in wall is the worst possible answer to "what does this
 * actually do", so the module renders this instead. It is a fictional person
 * applying for fictional jobs; nothing here touches the database and no action
 * in demo mode writes anything.
 *
 * The numbers are the ones the real scorer produced in testing rather than
 * invented ideals, including the 18% rejection. A demo that only shows
 * flattering results would misrepresent the product's whole argument.
 */

/**
 * Anything the product itself writes, scoring notes, gaps, career reasoning,
 * follows the interface language. The job adverts do not: a Melbourne advert is
 * written in English, and translating it would make the example less true
 * rather than more. Same for role titles and company names.
 */
type DemoLang = 'en' | 'zh';
const pickLang = (lang: string): DemoLang => (lang === 'zh' ? 'zh' : 'en');

const now = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const DEMO_USER_ID = '__demo__';

export const demoProfile: CareerProfile = {
  userId: DEMO_USER_ID,
  fullName: 'Wei Chen',
  headline: 'Recent CS graduate, backend focus',
  email: 'wei.chen@example.com',
  phone: '+61 4XX XXX XXX',
  city: 'Melbourne',
  country: 'Australia',
  linkedinUrl: 'https://linkedin.com/in/weichen-demo',
  websiteUrl: 'https://github.com/weichen-demo',
  targetTitles: ['Graduate Backend Engineer', 'Data Engineer'],
  targetLocations: ['Melbourne VIC'],
  targetIndustries: ['Technology'],
  seniority: 'Graduate',
  workRights: 'Australian Permanent Resident',
  salaryMin: 70000,
  salaryMax: 85000,
  salaryCurrency: 'AUD',
  remotePreference: 'hybrid',
  languages: ['English', 'Mandarin'],
  derivedSkills: [
    { name: 'Python', confidence: 'high', source: 'Internship at DataCo, 6 months' },
    { name: 'PostgreSQL', confidence: 'high', source: 'Internship at DataCo' },
    { name: 'Docker', confidence: 'medium', source: 'Containerised 3 services at DataCo' },
    { name: 'React', confidence: 'medium', source: 'Final year capstone' },
  ],
  confirmedFacts: [],
  workHistory: [
    {
      id: 'w1', role: 'Backend Engineering Intern', company: 'DataCo Pty Ltd',
      startDate: '2025-01', endDate: '2025-07', current: false, confirmed: true,
      summary: 'Built Python ETL pipelines processing 2 million rows per day into PostgreSQL.',
    },
    {
      id: 'w2', role: 'Casual Teaching Associate', company: 'Monash University',
      startDate: '2024-03', endDate: '2024-11', current: false, confirmed: true,
      summary: 'Ran weekly algorithms tutorials for 25 students.',
    },
  ],
  education: [
    {
      id: 'e1', school: 'Monash University', degree: 'BSc Computer Science',
      field: 'Computer Science', startDate: '2022', endDate: '2025-11', confirmed: true,
    },
  ],
  certifications: ['AWS Certified Cloud Practitioner (2025)'],
  optionalDemographics: {},
  savedAnswers: [],
  importedFromResumeAt: daysAgo(6),
  updatedAt: daysAgo(2),
};

const job = (
  id: number, title: string, company: string, location: string, description: string, salary?: string
): CanonicalJob => ({
  id, userId: DEMO_USER_ID, source: 'manual', market: 'AU',
  title, company, location, descriptionText: description, salaryText: salary,
  isStale: false, capturedAt: daysAgo(3), updatedAt: daysAgo(3),
});

export const demoJobs: CanonicalJob[] = [
  job(1, 'Graduate Backend Engineer', 'Zephyr Tech', 'Melbourne VIC',
    'Build and maintain Python services, write SQL against our PostgreSQL warehouse, help containerise services with Docker. Required: CS degree completed in the last two years, solid Python, full Australian working rights. Hybrid, three days a week in our Collins St office.',
    '$75,000 - $88,000 + super'),
  job(2, 'Junior Data Analyst', 'Probe Analytics', 'Melbourne VIC',
    'SQL and Python for reporting and dashboards. A quantitative degree and Australian work rights required. Hybrid, two days in office.',
    '$70,000 - $80,000'),
  job(3, 'Senior iOS Engineer', 'Nimbus Mobile', 'Sydney NSW',
    'Lead our mobile team. Required: 7+ years shipping production iOS apps, expert Swift and SwiftUI, experience leading a team of 4+. Onsite in Sydney five days a week.',
    '$160,000 - $190,000'),
];

const snapshot = (
  id: number, jobId: number, score: number,
  action: MatchSnapshot['recommendedAction'],
  dims: [number, number][], gaps: string[], notes: string[], noHistory: string
): MatchSnapshot => ({
  id, userId: DEMO_USER_ID, jobId, careerProfileSnapshot: demoProfile,
  overallScore: score, recommendedAction: action, hardGaps: gaps,
  modelVersion: 'gemini-flash-latest', createdAt: daysAgo(3),
  scoreBreakdown: {
    hardRequirements: { score: dims[0][0], weight: dims[0][1], notes: notes[0] },
    skillsExperience: { score: dims[1][0], weight: dims[1][1], notes: notes[1] },
    goalsPreferences: { score: dims[2][0], weight: dims[2][1], notes: notes[2] },
    opportunityQuality: { score: dims[3][0], weight: dims[3][1], notes: notes[3] },
    historicalOutcomes: { score: 0, weight: 0, notes: noHistory },
  },
});

const SNAPSHOT_TEXT: Record<DemoLang, {
  noHistory: string;
  jobs: Record<number, { gaps: string[]; notes: string[] }>;
}> = {
  en: {
    noHistory: 'No outcome history yet.',
    jobs: {
      1: { gaps: [], notes: [
        'AU work rights, CS degree finished within two years, based in Melbourne',
        'Python and PostgreSQL both covered by the DataCo internship; Docker too',
        'Exact title match, Melbourne, hybrid, and the salary band clears your minimum',
        'Specific advert with the stack, salary band and office days all stated',
      ] },
      2: { gaps: [], notes: [
        'Quantitative degree and work rights both met',
        'SQL and Python are strong; no dashboarding or BI tooling on record',
        'Analyst is adjacent to your stated target of backend engineering',
        'The advert is short and does not describe the team or the tooling',
      ] },
      3: {
        gaps: [
          'Requires 7+ years shipping production iOS apps; you graduated last year',
          'Requires expert Swift and SwiftUI; neither appears in your history',
          'Requires onsite presence in Sydney five days a week',
          'Requires prior experience leading a team of four or more',
        ],
        notes: [
          'Seniority and location both fail outright',
          'No Swift, SwiftUI or iOS ecosystem experience on record',
          'Wrong city, wrong work mode, and well above your stated salary target',
          'The advert itself is clear and complete',
        ],
      },
    },
  },
  zh: {
    noHistory: '还没有投递结果可以参考。',
    jobs: {
      1: { gaps: [], notes: [
        '有澳洲工作权、两年内毕业的计算机学位、人在墨尔本,三条硬性要求全部满足',
        'Python 和 PostgreSQL 都有 DataCo 实习作证,Docker 也有',
        '职位名称完全对上,墨尔本、混合办公,薪资区间也高过你的下限',
        '招聘信息很具体,技术栈、薪资区间、每周到岗天数都写了',
      ] },
      2: { gaps: [], notes: [
        '量化专业背景和工作权都满足',
        'SQL 和 Python 都不错,但简历上没有看板或 BI 工具的经历',
        '数据分析师和你写的后端工程目标是相邻方向,不完全一致',
        '招聘信息偏短,没有说清团队和技术栈',
      ] },
      3: {
        gaps: [
          '要求 7 年以上 iOS 上线经验,你去年才毕业',
          '要求精通 Swift 和 SwiftUI,你的经历里两个都没有',
          '要求每周五天在悉尼现场办公',
          '要求带过四人以上团队',
        ],
        notes: [
          '资历和地点两条直接不通过',
          '简历上没有 Swift、SwiftUI 或任何 iOS 生态的经历',
          '城市不对、办公方式不对,薪资也远高于你写的目标',
          '招聘信息本身写得清楚完整',
        ],
      },
    },
  },
};

export const getDemoSnapshots = (lang: string): Record<number, MatchSnapshot[]> => {
  const T = SNAPSHOT_TEXT[pickLang(lang)];
  const mk = (
    id: number, jobId: number, score: number,
    action: MatchSnapshot['recommendedAction'], dims: [number, number][]
  ) => [snapshot(id, jobId, score, action, dims, T.jobs[jobId].gaps, T.jobs[jobId].notes, T.noHistory)];
  return {
    1: mk(101, 1, 96, 'priority_apply', [[100, 0.35], [95, 0.35], [100, 0.15], [85, 0.15]]),
    2: mk(102, 2, 74, 'apply', [[100, 0.3], [70, 0.3], [65, 0.2], [70, 0.2]]),
    3: mk(103, 3, 18, 'skip', [[10, 0.35], [5, 0.3], [15, 0.2], [75, 0.15]]),
  };
};

/* The resume and its cover letter stay in English whatever the interface
   language is. They are addressed to a Melbourne employer, and a document that
   mixed a Chinese summary with English bullets would be a worse example than
   one that is simply in the language the job is advertised in. */
const demoTailoredContent: AnalysisResult = {
  overallScore: 91,
  missingSkills: ['Kubernetes'],
  coverLetter:
    'Dear Hiring Manager,\n\nI am writing to apply for the Graduate Backend Engineer role at Zephyr Tech. During a six-month backend internship at DataCo I built Python ETL pipelines that moved two million rows a day into PostgreSQL, and cut the nightly batch from four hours to fifty minutes by rewriting the heaviest queries.\n\nYour advert asks for Python, relational databases and Docker. Those are the three things I spent that internship doing, and I containerised three of the platform team\u2019s services before I left.\n\nI hold Australian permanent residency and I am based in Melbourne, so three days a week on Collins St suits me well.\n\nSincerely,\nWei Chen',
  optimizedResume: {
    fullName: 'Wei Chen',
    jobTitle: 'Graduate Backend Engineer',
    contactInfo: 'Melbourne VIC | wei.chen@example.com | linkedin.com/in/weichen-demo',
    summary:
      'Recent Computer Science graduate with hands-on backend and data engineering experience in Python and PostgreSQL. Australian Permanent Resident based in Melbourne.',
    technicalSkills: ['Python', 'SQL', 'PostgreSQL', 'Docker', 'React', 'Git', 'Linux'],
    softSkills: ['Collaboration', 'Written communication'],
    education: [{ id: 'e1', school: 'Monash University', degree: 'BSc Computer Science', startDate: '2022', endDate: '2025', gpa: 'WAM 78' }],
    experiences: [
      { id: 'x1', role: 'Backend Engineering Intern', company: 'DataCo Pty Ltd', period: 'Jan 2025 - Jul 2025', isMatch: true,
        bullets: [
          'Built Python ETL pipelines processing 2 million rows per day into PostgreSQL',
          'Cut nightly batch runtime from 4 hours to 50 minutes by rewriting the heaviest queries',
          'Containerised three platform services with Docker',
        ] },
      { id: 'x2', role: 'Casual Teaching Associate', company: 'Monash University', period: 'Mar 2024 - Nov 2024', isMatch: false,
        bullets: ['Ran weekly algorithms tutorials for 25 students', 'Marked assignments and gave written feedback'] },
    ],
    volunteer: [],
    schoolProjects: [{ id: 'p1', role: 'Booking Platform (Capstone)', company: 'React, FastAPI, PostgreSQL', period: '2025', isMatch: true, bullets: ['Scored High Distinction'] }],
    awards: ['AWS Certified Cloud Practitioner (2025)'],
    references: [],
  } as any,
} as AnalysisResult;

export const demoTailoredResumes: Record<number, TailoredResume[]> = {
  1: [{
    id: 201, userId: DEMO_USER_ID, jobId: 1, content: demoTailoredContent,
    coverLetter: demoTailoredContent.coverLetter, modelVersion: 'gemini-flash-latest',
    createdAt: daysAgo(2),
  }],
};

export const demoApplications: ApplicationWithJob[] = [
  {
    id: 301, userId: DEMO_USER_ID, jobId: 1, matchSnapshotId: 101, tailoredResumeId: 201,
    status: 'interviewing', appliedVia: 'manual', appliedAt: daysAgo(9),
    questionAnswers: [], createdAt: daysAgo(10), updatedAt: daysAgo(1), job: demoJobs[0],
  },
  {
    id: 302, userId: DEMO_USER_ID, jobId: 2, matchSnapshotId: 102,
    status: 'applied', appliedVia: 'extension_autofill', appliedAt: daysAgo(4),
    questionAnswers: [], createdAt: daysAgo(5), updatedAt: daysAgo(4), job: demoJobs[1],
  },
  {
    id: 303, userId: DEMO_USER_ID, jobId: 3, matchSnapshotId: 103,
    status: 'saved', questionAnswers: [], createdAt: daysAgo(3), updatedAt: daysAgo(3), job: demoJobs[2],
  },
];

export const getDemoStatusHistory = (lang: string) => {
  const zh = pickLang(lang) === 'zh';
  return [
    { id: 1, applicationId: 301, status: 'saved' as const, note: zh ? '从浏览器插件保存' : 'Saved from the browser extension', changedAt: daysAgo(10) },
    { id: 2, applicationId: 301, status: 'applied' as const, changedAt: daysAgo(9) },
    { id: 3, applicationId: 301, status: 'interviewing' as const, note: zh ? '已约电话初面' : 'Phone screen booked', changedAt: daysAgo(1) },
  ];
};

/**
 * A worked Career Path result, so the module has something to show a visitor
 * who has not signed in.
 *
 * Every other module in demo mode renders a populated screen; this one used to
 * stop at its entry page, which meant nobody could see what "Career Path"
 * produces without spending a credit on it first. Same fictional person as the
 * rest of this file.
 */
export const getDemoCareerPrediction = (lang: string): CareerPredictionResult => {
  const zh = pickLang(lang) === 'zh';
  return {
    currentLevel: 'Graduate Backend Engineer',
    skillTrajectory: [
      { year: '2025', skill: 'Python, SQL, PostgreSQL' },
      { year: '2026', skill: zh ? 'Docker、CI/CD、代码评审' : 'Docker, CI/CD, code review' },
      { year: '2027', skill: zh ? '系统设计、线上值班' : 'System design, on-call ownership' },
      { year: '2028', skill: zh ? 'Kubernetes、服务架构' : 'Kubernetes, service architecture' },
    ],
    paths: [
      {
        role: 'Backend Engineer',
        match: 92,
        salaryRange: 'AUD 95,000 - 120,000',
        timeToReach: zh ? '12-18 个月' : '12-18 months',
        description: zh
          ? 'DataCo 实习的直接延续。Python 服务和 PostgreSQL 已经是你的日常,缺的是规模和责任范围。'
          : 'The straight continuation of the DataCo internship. Python services and PostgreSQL are already the daily work; what is missing is scale and ownership.',
        missingSkills: zh ? ['Kubernetes', '分布式链路追踪'] : ['Kubernetes', 'Distributed tracing'],
        reasoning: zh
          ? ['Python 和 PostgreSQL 都有六个月生产环境的工作作证',
             '已经用 Docker 容器化过三个服务',
             '还没有独立负责过一个线上服务并参与值班']
          : ['Python and PostgreSQL are both evidenced by six months of production work',
             'Three services containerised with Docker already',
             'No experience yet owning a service in production on-call'],
        targetCompanies: ['Atlassian', 'Canva', 'Zephyr Tech'],
      },
      {
        role: 'Data Engineer',
        match: 74,
        salaryRange: 'AUD 100,000 - 130,000',
        timeToReach: zh ? '18-24 个月' : '18-24 months',
        description: zh
          ? 'DataCo 的 ETL 管道本来就是数据工程。差的是现代数仓那套工具链,不是基本功。'
          : 'The ETL pipelines at DataCo are genuine data engineering. The gap is the modern warehouse stack rather than the fundamentals.',
        missingSkills: ['dbt', 'Airflow', 'Spark'],
        reasoning: zh
          ? ['做过每天搬运两百万行的数据管道',
             'SQL 很扎实,但简历上没有任何调度编排工具',
             '没有列式数仓经验(Snowflake、BigQuery)']
          : ['Built pipelines moving 2 million rows a day',
             'SQL is strong, but no orchestration tooling on record',
             'No columnar warehouse experience (Snowflake, BigQuery)'],
        targetCompanies: ['Xero', 'REA Group'],
      },
      {
        role: 'Platform Engineer',
        match: 61,
        salaryRange: 'AUD 110,000 - 140,000',
        timeToReach: zh ? '2-3 年' : '2-3 years',
        description: zh
          ? '够得着,但这是换方向而不是往上走。目前唯一真正重合的只有 Docker 那部分。'
          : 'Reachable, but it is a change of discipline rather than a promotion. The Docker work is the only real overlap so far.',
        missingSkills: zh
          ? ['Terraform', 'Kubernetes', '可观测性', 'Linux 网络']
          : ['Terraform', 'Kubernetes', 'Observability', 'Linux networking'],
        reasoning: zh
          ? ['Docker 算是个起点,但完全没有基础设施即代码的经历',
             '云方面只有一张 AWS Cloud Practitioner 证书',
             '需要先有意识地转到一个基础设施团队']
          : ['Docker experience is a start, but infrastructure-as-code is absent',
             'No cloud beyond the AWS Cloud Practitioner certificate',
             'Would need a deliberate move into an infrastructure team first'],
        targetCompanies: ['Atlassian', 'Culture Amp'],
      },
    ],
    actionPlan: zh
      ? [
          { step: '独立负责一个服务', description: '争取成为一个小型线上服务的主要维护者,连告警一起接下来。', impact: '补上应届和中级之间那道"责任范围"的差距' },
          { step: '把东西真的跑在 Kubernetes 上', description: '把一个业余项目部署到托管集群,并让它连续运行一个季度。', impact: '把上面出现最多的那项缺失技能变成可验证的经历' },
          { step: '把管道重写那件事写清楚', description: '四小时缩到五十分钟这个结果,需要一段话说明怎么做到的,而不只是一个数字。', impact: '给面试官一个具体可追问的东西' },
        ]
      : [
          { step: 'Own one service end to end', description: 'Ask to be the primary maintainer of a small production service, including its alerts.', impact: 'Closes the ownership gap that separates graduate from mid-level' },
          { step: 'Ship something on Kubernetes', description: 'Deploy a side project to a managed cluster and keep it running for a quarter.', impact: 'Turns the most common missing skill above into evidence' },
          { step: 'Write up the pipeline rewrite', description: 'The 4 hours to 50 minutes result needs a paragraph explaining how, not just the number.', impact: 'Gives interviewers something concrete to ask about' },
        ],
  };
};

void now;
