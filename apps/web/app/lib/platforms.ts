/** Display names for the job platforms the scraper detects (brand names are not translated). */
const PLATFORM_NAMES: Record<string, string> = {
  adp: "ADP",
  avature: "Avature",
  bamboohr: "BambooHR",
  careerbeacon: "CareerBeacon",
  gcjobs: "GC Jobs",
  greenhouse: "Greenhouse",
  icims: "iCIMS",
  indeed: "Indeed",
  jobbank: "Job Bank",
  linkedin: "LinkedIn",
  oracle_hcm: "Oracle Recruiting",
  peoplesoft: "PeopleSoft",
  smartrecruiters: "SmartRecruiters",
  ultipro: "UKG / UltiPro",
  venor: "Venor",
  workday: "Workday",
};

/** Returns null for "generic" so callers can show a translated "employer website" label. */
export function platformName(platform: string | null | undefined): string | null {
  if (!platform || platform === "generic") return null;
  return PLATFORM_NAMES[platform] ?? platform;
}

/** Host of a URL without "www.", for compact display. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Scraped excerpts are tag-stripped HTML; decode the entities that are left. */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}
