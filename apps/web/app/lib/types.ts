export type LocalizedText = Record<string, string>;
export type Term = { slug: string; name: LocalizedText };

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
export type Taxonomies = { industries: Term[]; jobTypes: Term[]; locations: Term[] };
export type Site = { name: LocalizedText; region: LocalizedText; locales: string[] };
