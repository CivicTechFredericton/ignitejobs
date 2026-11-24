import type { LoaderFunctionArgs } from "react-router";
import { modApi } from "./mod.server";
import { type QueuePage, STATUSES } from "./queue";

/** The review queue's filters, read from the URL (?status=&source=). */
export function queueFilters(url: URL) {
  const requested = url.searchParams.get("status");
  return {
    status: STATUSES.find((s) => s === requested) ?? "pending",
    source: url.searchParams.get("source"),
  };
}

/** One page of the review queue; pass the previous page's nextCursor for the following one. */
export function loadQueuePage(args: Pick<LoaderFunctionArgs, "request">, url: URL) {
  const { status, source } = queueFilters(url);
  const query = new URLSearchParams({ status });
  if (source) query.set("source", source);
  const cursor = url.searchParams.get("cursor");
  if (cursor) query.set("cursor", cursor);
  return modApi<QueuePage>(args, `/postings?${query}`);
}
