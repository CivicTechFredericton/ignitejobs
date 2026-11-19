export type LocalizedText = Record<string, string>;
export type Term = { slug: string; name: LocalizedText };
export type TaxonomyTerm = Term & { id: string };

export type Posting = {
  id: string;
  title: string;
  url: string;
  organization: string | null;
  locationText: string | null;
  location: Term | null;
  industry: Term | null;
  jobType: Term | null;
  language: string | null;
  postedAt: string | null;
  closesAt: string | null;
  isNew?: boolean;
};

export type Edition = { id: string; title: LocalizedText; publishedAt: string };
export type Taxonomies = { industries: TaxonomyTerm[]; jobTypes: TaxonomyTerm[]; locations: TaxonomyTerm[] };
export type Site = {
  name: LocalizedText;
  region: LocalizedText;
  locales: string[];
  branding: { logoUrl?: string; primaryColor?: string };
};

export type PostingStatus = "pending" | "approved" | "rejected" | "closed";

export type ModPosting = Posting & {
  status: PostingStatus;
  origin: "scraped" | "manual";
  industryId: string | null;
  jobTypeId: string | null;
  locationId: string | null;
  reviewNotes: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  platform: string | null;
  excerpt: string | null;
  createdAt: string;
};

export type ScrapeJobStatus = "queued" | "running" | "succeeded" | "failed" | "blocked";

export type Source = {
  id: string;
  url: string;
  domain: string;
  kind: "careers_page" | "posting";
  platform: string;
  status: "active" | "paused" | "blocked" | "manual_only";
  lastScrapedAt: string | null;
  createdAt: string;
  lastJob: {
    status: ScrapeJobStatus | null;
    pool: "http" | "browser" | null;
    lastError: string | null;
    finishedAt: string | null;
    /** Why a scrape ended or moved on: gone, no_postings, blocked, manual_only, error, escalated. */
    outcome: string | null;
    /** How a successful scrape read the site: platform_api, json_ld, headless. */
    strategy: string | null;
    /** Postings the last successful scrape read; some may belong to another source. */
    found: number | null;
  } | null;
  postingCount: number;
};

export type PostingSummary = { id: string; title: string; organization: string | null };

export type EditionPreview = {
  previousEditionId: string | null;
  added: PostingSummary[];
  removed: (PostingSummary & { status: PostingStatus })[];
  total: number;
};

export type ModSummary = { pendingPostings: number; blockedSources: number };

export type SessionUser = { email: string | null; name: string | null; roles: ("moderator" | "admin")[] };
