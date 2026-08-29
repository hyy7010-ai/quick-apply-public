import type { CanonicalJobInput, JobMarket } from '../../types';

/**
 * Per-site JD extractors.
 *
 * These read the page the user is already looking at — the extension never
 * searches or crawls. That distinction matters: reading the page in front of
 * you is a different thing from scraping a site's listings, and the strategy
 * doc rules the latter out of this phase.
 *
 * Selectors WILL break when a site redesigns. Every extractor therefore falls
 * back to the generic reader rather than throwing, so a stale selector
 * degrades to "slightly worse extraction" instead of "extension is broken".
 */

const text = (el: Element | null | undefined): string =>
  (el?.textContent || '').replace(/\s+/g, ' ').trim();

const firstText = (selectors: string[], root: ParentNode = document): string => {
  for (const s of selectors) {
    const found = text(root.querySelector(s));
    if (found) return found;
  }
  return '';
};

const longestText = (selectors: string[]): string => {
  let best = '';
  for (const s of selectors) {
    for (const el of Array.from(document.querySelectorAll(s))) {
      const t = text(el);
      if (t.length > best.length) best = t;
    }
  }
  return best;
};

export interface SiteAdapter {
  /** No application form: you message a recruiter, and that message is the
   *  application. BOSS直聘 and its peers work this way, so the fill-and-submit
   *  flow has nothing to act on there and a greeting is what is needed. */
  chatFirst?: boolean;
  source: string;
  market: JobMarket;
  matches(url: string): boolean;
  extract(): Partial<CanonicalJobInput>;
}

const seek: SiteAdapter = {
  source: 'seek',
  market: 'AU',
  /* SEEK Australia moved from seek.com.au to au.seek.com; the old host now
     answers 403. Both are matched because the old one may still appear in
     saved links and redirects. */
  matches: (url) => url.includes('seek.com.au') || url.includes('seek.com'),
  extract: () => ({
    title: firstText(['[data-automation="job-detail-title"]', 'h1']),
    company: firstText(['[data-automation="advertiser-name"]']),
    location: firstText(['[data-automation="job-detail-location"]']),
    salaryText: firstText(['[data-automation="job-detail-salary"]']),
    employmentType: firstText(['[data-automation="job-detail-work-type"]']),
    descriptionText: longestText(['[data-automation="jobAdDetails"]']),
  }),
};

const linkedin: SiteAdapter = {
  source: 'linkedin',
  market: 'AU',
  matches: (url) => url.includes('linkedin.com/jobs'),
  extract: () => ({
    title: firstText(['.job-details-jobs-unified-top-card__job-title', '.topcard__title', 'h1']),
    company: firstText(['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link']),
    location: firstText([
      '.job-details-jobs-unified-top-card__primary-description-container span',
      '.topcard__flavor--bullet',
    ]),
    descriptionText: longestText(['.jobs-description__content', '.description__text']),
  }),
};

const indeed: SiteAdapter = {
  source: 'indeed',
  market: 'AU',
  matches: (url) => url.includes('indeed.com'),
  extract: () => ({
    title: firstText(['[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title', 'h1']),
    company: firstText(['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]']),
    location: firstText(['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]']),
    descriptionText: longestText(['#jobDescriptionText']),
  }),
};

const bossZhipin: SiteAdapter = {
  chatFirst: true,
  source: 'boss_zhipin',
  market: 'CN',
  matches: (url) => url.includes('zhipin.com'),
  extract: () => ({
    title: firstText(['.job-name', '.name h1', 'h1']),
    company: firstText(['.company-info .name', '.sider-company .name']),
    location: firstText(['.job-address .text-city', '.job-primary .job-area']),
    salaryText: firstText(['.job-banner .salary', '.salary']),
    descriptionText: longestText(['.job-sec-text', '.job-detail-section']),
  }),
};

const liepin: SiteAdapter = {
  chatFirst: true,
  source: 'liepin',
  market: 'CN',
  matches: (url) => url.includes('liepin.com'),
  extract: () => ({
    title: firstText(['.name-box .name', 'h1']),
    company: firstText(['.company-info-content .name', '.company-name']),
    location: firstText(['.job-properties span', '.text-city']),
    salaryText: firstText(['.salary', '.job-salary']),
    descriptionText: longestText(['.job-intro-content', '.paragraph']),
  }),
};

const zhaopin: SiteAdapter = {
  chatFirst: true,
  source: 'zhaopin',
  market: 'CN',
  matches: (url) => url.includes('zhaopin.com'),
  extract: () => ({
    title: firstText(['.summary-plane__title', 'h1']),
    company: firstText(['.company__title', '.company-name']),
    location: firstText(['.summary-plane__info li', '.job-address']),
    salaryText: firstText(['.summary-plane__salary']),
    descriptionText: longestText(['.describtion__detail-content', '.job-detail']),
  }),
};

const job51: SiteAdapter = {
  chatFirst: true,
  source: 'job51',
  market: 'CN',
  matches: (url) => url.includes('51job.com'),
  extract: () => ({
    title: firstText(['.cn h1', '.tHeader h1', 'h1']),
    company: firstText(['.cname a', '.com_msg a']),
    location: firstText(['.msg.ltype', '.tHeader .lname']),
    salaryText: firstText(['.cn strong', '.tHeader strong']),
    descriptionText: longestText(['.job_msg', '.bmsg']),
  }),
};

/**
 * Company career pages and anything without a dedicated adapter. Picks the
 * densest block of text on the page, which on a job ad is almost always the
 * ad itself.
 */
const generic: SiteAdapter = {
  source: 'company_site',
  market: 'AU',
  matches: () => true,
  extract: () => {
    const candidates = Array.from(
      document.querySelectorAll('article, main, [class*="description"], [class*="job"], [id*="job"], section')
    );
    let body = '';
    for (const el of candidates) {
      const t = text(el);
      if (t.length > body.length && t.length < 40000) body = t;
    }
    if (body.length < 200) body = text(document.body).slice(0, 20000);

    return {
      title: firstText(['h1', '[class*="title"]']) || document.title,
      company:
        firstText(['[class*="company"]', '[itemprop="hiringOrganization"]']) ||
        location.hostname.replace(/^www\./, ''),
      descriptionText: body,
    };
  },
};

const ADAPTERS: SiteAdapter[] = [seek, linkedin, indeed, bossZhipin, liepin, zhaopin, job51, generic];

export function isChatFirst(url: string): boolean {
  return adapterFor(url).chatFirst === true;
}

export function adapterFor(url: string): SiteAdapter {
  return ADAPTERS.find((a) => a.matches(url)) || generic;
}

/** Extracts the current page, filling gaps from the generic reader so a stale
 * site-specific selector never produces an empty job. */
export function extractCurrentJob(): CanonicalJobInput | null {
  const adapter = adapterFor(location.href);
  const primary = adapter.extract();
  const fallback = adapter === generic ? primary : generic.extract();

  const title = primary.title || fallback.title || '';
  const company = primary.company || fallback.company || '';
  const descriptionText = primary.descriptionText || fallback.descriptionText || '';

  // A page with no meaningful body text is not a job ad — say nothing rather
  // than offering to score a navigation menu.
  if (!title || descriptionText.length < 150) return null;

  return {
    source: adapter.source,
    market: adapter.market,
    sourceUrl: location.href.split('#')[0],
    title,
    company: company || location.hostname,
    location: primary.location || fallback.location,
    salaryText: primary.salaryText,
    employmentType: primary.employmentType,
    descriptionText: descriptionText.slice(0, 20000),
  };
}
