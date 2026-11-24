import { Building2, CalendarClock, Keyboard, Loader2, MapPin, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, type ShouldRevalidateFunctionArgs, useFetcher, useNavigate, useParams } from "react-router";
import { Button } from "~/components/ui/button";
import { localized } from "~/i18n";
import { platformName, hostOf } from "~/lib/platforms";
import { STATUSES, type QueuePage } from "~/lib/queue";
import { loadQueuePage, queueFilters } from "~/lib/queue.server";
import { modApi } from "~/lib/mod.server";
import type { ModPosting, PostingStatus, Source } from "~/lib/types";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/queue";

// The review queue, laid out like a mail client: postings on the left, the selected one on the
// right (child route review/:postingId). The list pages in as it scrolls (endless scroll) and is
// kept in client state, so selecting or reviewing a posting doesn't reload or reset it.

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url);
  const { status, source } = queueFilters(url);
  url.searchParams.delete("cursor");
  const [page, sourceList] = await Promise.all([
    loadQueuePage(args, url),
    source ? modApi<Source[]>(args, "/sources") : Promise.resolve([]),
  ]);
  const sourceUrl = sourceList.find((s) => s.id === source)?.url ?? null;
  return { status, source, sourceUrl, page };
}

// Reload the list only when its filters change. Selecting a posting changes just the path, and a
// review is applied to the list in place (see onReviewed), which keeps the pages already loaded.
export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod !== "GET") return false;
  const filters = (url: URL) => `${url.searchParams.get("status") ?? ""}|${url.searchParams.get("source") ?? ""}`;
  if (filters(currentUrl) !== filters(nextUrl)) return true;
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}

export type QueueContext = {
  items: ModPosting[];
  status: PostingStatus;
  /** Link to a posting, keeping the list's filters. */
  hrefFor: (id: string) => string;
  listHref: string;
  /** A posting moved to another status: drop it from the list and open the next one. */
  onReviewed: (id: string, status: PostingStatus | null) => void;
  /** Fields were saved: refresh the list entry. */
  onSaved: (id: string, patch: Partial<ModPosting>) => void;
};

export default function Queue({ loaderData, params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { status, source, sourceUrl, page } = loaderData;
  const { postingId } = useParams();
  const navigate = useNavigate();
  const base = `/${params.lang}/mod`;

  // Pages loaded so far. A new first page (filters changed) starts the list over.
  const [items, setItems] = useState(page.postings);
  const [cursor, setCursor] = useState(page.nextCursor);
  const [total, setTotal] = useState(page.total);
  useEffect(() => {
    setItems(page.postings);
    setCursor(page.nextCursor);
    setTotal(page.total);
  }, [page]);

  const filterQuery = useMemo(() => {
    const query = new URLSearchParams({ status });
    if (source) query.set("source", source);
    return query.toString();
  }, [status, source]);
  const hrefFor = useCallback((id: string) => `${base}/review/${id}?${filterQuery}`, [base, filterQuery]);
  const listHref = `${base}?${filterQuery}`;

  // Endless scroll: fetch the next page when the sentinel at the bottom of the list shows up.
  const more = useFetcher<QueuePage>();
  const loadMore = useCallback(() => {
    if (cursor && more.state === "idle") more.load(`${base}/queue?${filterQuery}&cursor=${encodeURIComponent(cursor)}`);
  }, [cursor, more, base, filterQuery]);
  useEffect(() => {
    if (!more.data || more.state !== "idle") return;
    const next = more.data;
    setItems((current) => {
      const seen = new Set(current.map((p) => p.id));
      return [...current, ...next.postings.filter((p) => !seen.has(p.id))];
    });
    setCursor(next.nextCursor);
  }, [more.data, more.state]);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor) return;
    // The list scrolls inside its pane on wide screens and with the page on phones.
    const scrollsItself = listRef.current && getComputedStyle(listRef.current).overflowY === "auto";
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), {
      root: scrollsItself ? listRef.current : null,
      rootMargin: "400px 0px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  // Read items through a ref so onReviewed keeps one identity while the list changes; a callback
  // that changes on every list update re-triggers the effects that call it.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReviewed = useCallback(
    (id: string, newStatus: PostingStatus | null) => {
      if (!newStatus || newStatus === status) return;
      const current = itemsRef.current;
      const index = current.findIndex((p) => p.id === id);
      if (index === -1) return; // Already handled.
      const next = current[index + 1] ?? current[index - 1];
      itemsRef.current = current.filter((p) => p.id !== id);
      setItems(itemsRef.current);
      setTotal((n) => Math.max(0, n - 1));
      navigate(next ? hrefFor(next.id) : listHref, { replace: true, preventScrollReset: true });
    },
    [status, hrefFor, listHref, navigate],
  );
  const onSaved = useCallback((id: string, patch: Partial<ModPosting>) => {
    setItems((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // J / K move through the list, unless the moderator is typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.key !== "j" && event.key !== "k")) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      // Read the selection from the URL, not render state: a quick J then K would otherwise run
      // before this effect re-subscribes with the new posting.
      const current = window.location.pathname.match(/\/review\/([^/]+)/)?.[1];
      const index = items.findIndex((p) => p.id === current);
      const next = items[event.key === "j" ? index + 1 : Math.max(0, index - 1)];
      if (!next || next.id === current) return;
      event.preventDefault();
      navigate(hrefFor(next.id), { preventScrollReset: true });
      if (event.key === "j" && index + 2 >= items.length) loadMore();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, postingId, hrefFor, navigate, loadMore]);

  // Keep the selected entry in view when it changes (keyboard, auto-advance).
  useEffect(() => {
    if (!postingId) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(postingId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [postingId]);

  const context: QueueContext = { items, status, hrefFor, listHref, onReviewed, onSaved };
  const withFilters = (s: PostingStatus) => (source ? `${base}?status=${s}&source=${source}` : `${base}?status=${s}`);

  return (
    <div className="grid gap-4 md:h-[calc(100dvh-15rem)] md:min-h-[32rem] md:grid-cols-[minmax(17rem,22rem)_1fr]">
      {/* List pane: the whole page on phones until a posting is opened. */}
      <section aria-labelledby="queue-heading" className={cn("bg-card flex min-h-0 flex-col rounded-lg border", postingId && "hidden md:flex")}>
        <div className="grid gap-3 border-b p-3">
          <h2 id="queue-heading" className="sr-only">
            {t("mod.review.heading")}
          </h2>
          <nav className="flex flex-wrap gap-1.5" aria-label={t("mod.review.heading")}>
            {STATUSES.map((s) => (
              <Button key={s} asChild size="xs" variant={s === status ? "default" : "outline"}>
                <Link to={withFilters(s)} aria-current={s === status ? "page" : undefined}>
                  {t(`mod.review.tabs.${s}`)}
                </Link>
              </Button>
            ))}
          </nav>
          {source && (
            <p className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-xs">
              <span className="min-w-0 truncate">{t("mod.review.fromSource", { host: sourceUrl ? hostOf(sourceUrl) : "…" })}</span>
              <Link to={`${base}?status=${status}`} className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-4">
                <X aria-hidden="true" className="size-3" />
                {t("mod.review.allSources")}
              </Link>
            </p>
          )}
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {t("mod.review.count", { count: total })}
          </p>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 md:overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">{t("mod.review.empty")}</p>
          ) : (
            <ul aria-label={t("mod.review.listLabel")} className="divide-y">
              {items.map((posting) => (
                <QueueItem key={posting.id} posting={posting} href={hrefFor(posting.id)} lang={params.lang} />
              ))}
            </ul>
          )}
          <div ref={sentinelRef} />
          {cursor && (
            <div className="p-3 text-center">
              {/* Fallback for when the observer doesn't fire (and for keyboard users). */}
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={more.state !== "idle"}>
                {more.state !== "idle" && <Loader2 aria-hidden="true" className="animate-spin" />}
                {more.state !== "idle" ? t("mod.review.loading") : t("mod.review.loadMore")}
              </Button>
            </div>
          )}
        </div>
        <p className="text-muted-foreground hidden items-center gap-1.5 border-t px-3 py-2 text-xs md:flex">
          <Keyboard aria-hidden="true" className="size-3.5" />
          {t("mod.review.shortcuts")}
        </p>
      </section>

      {/* Reading pane. */}
      <section className={cn("bg-card min-h-0 rounded-lg border md:overflow-y-auto", !postingId && "hidden md:block")}>
        <Outlet context={context} />
      </section>
    </div>
  );
}

function QueueItem({ posting, href, lang }: { posting: ModPosting; href: string; lang: string }) {
  const { t } = useTranslation();
  const location = posting.location ? localized(posting.location.name, lang) : posting.locationText;
  const platform = posting.origin === "scraped" ? platformName(posting.platform) : t("mod.review.origin.manual");
  const closes = posting.closesAt ? new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(posting.closesAt)) : null;
  return (
    <li data-id={posting.id}>
      <NavLink
        to={href}
        preventScrollReset
        className={({ isActive }) =>
          cn(
            "grid gap-1 border-l-2 px-3 py-2.5 text-sm transition-colors outline-none focus-visible:bg-accent",
            isActive ? "border-primary bg-accent" : "hover:bg-accent/50 border-transparent",
          )
        }
      >
        <span className="line-clamp-2 font-medium" lang={posting.language ?? undefined}>
          {posting.title}
        </span>
        <span className="text-muted-foreground grid gap-0.5 text-xs [&_svg]:size-3 [&_svg]:shrink-0">
          {posting.organization && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Building2 aria-hidden="true" />
              <span className="truncate">{posting.organization}</span>
            </span>
          )}
          {location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" />
              <span className="truncate">{location}</span>
            </span>
          )}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[11px]">
          {platform && <span className="bg-muted rounded px-1.5 py-0.5">{platform}</span>}
          {closes && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="size-3" />
              {t("mod.review.closes", { date: closes })}
            </span>
          )}
        </span>
      </NavLink>
    </li>
  );
}
