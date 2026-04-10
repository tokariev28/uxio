// Shared helper for detecting unusable Firecrawl markdown output.
// Used by Agent 0 (product brief) and Agent 3 (scraper) to trigger retries
// before passing thin content downstream.

export function isUsableMarkdown(md: string): boolean {
  if (!md || md.trim().length < 300) return false;
  const lower = md.toLowerCase();
  // Definitive JS-not-rendered signals
  return !["enable javascript", "javascript is required", "loading..."].some(
    (s) => lower.includes(s)
  );
}
