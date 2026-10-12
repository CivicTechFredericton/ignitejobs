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
  sourceUrl: string | null;
  createdAt: string;
};

export type Source = {
  id: string;
  url: string;
  domain: string;
  kind: "careers_page" | "posting";
  platform: string;
  status: "active" | "paused" | "blocked" | "manual_only";
  lastScrapedAt: string | null;
  createdAt: string;
  lastJob: { status: string | null; lastError: string | null; finishedAt: string | null } | null;
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
