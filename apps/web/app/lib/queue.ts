import type { ModPosting, PostingStatus } from "./types";

export const STATUSES: PostingStatus[] = ["pending", "approved", "rejected", "closed"];

export type QueuePage = { postings: ModPosting[]; nextCursor: string | null; total: number };
