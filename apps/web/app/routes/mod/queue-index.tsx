import { Inbox } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext } from "react-router";
import type { QueueContext } from "./queue";

// Nothing selected. On wide screens open the first posting, like a mail client; on phones the
// list is the page, so this pane stays hidden.
export default function QueueIndex() {
  const { t } = useTranslation();
  const { items, hrefFor } = useOutletContext<QueueContext>();
  const navigate = useNavigate();
  const first = items[0]?.id;
  useEffect(() => {
    if (first && window.matchMedia("(min-width: 768px)").matches) {
      navigate(hrefFor(first), { replace: true, preventScrollReset: true });
    }
  }, [first, hrefFor, navigate]);
  return (
    <div className="text-muted-foreground grid h-full place-content-center justify-items-center gap-3 p-10 text-center">
      <Inbox aria-hidden="true" className="size-8" />
      <p>{items.length ? t("mod.review.selectPrompt") : t("mod.review.empty")}</p>
    </div>
  );
}
