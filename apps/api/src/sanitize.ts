import sanitizeHtml from "sanitize-html";

// Scraped descriptions are untrusted HTML. Keep basic structure, drop everything else.
const options: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h2", "h3", "h4", "a"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    // Demote headings so they sit under the page's own <h1>, and open links safely.
    h1: "h2",
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

export function sanitizeDescription(html: string | null): string | null {
  if (!html) return null;
  // Plain-text descriptions: keep their line breaks.
  const source = /<[a-z][\s\S]*>/i.test(html)
    ? html
    : `<p>${html.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  const clean = sanitizeHtml(source, options);
  return clean.trim() || null;
}
