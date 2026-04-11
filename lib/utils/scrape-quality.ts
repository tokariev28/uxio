// Shared helper for detecting unusable Firecrawl markdown output.
// Used by Agent 0 (product brief) and Agent 3 (scraper) to trigger retries
// before passing thin content downstream.

const UNUSABLE_SIGNALS = [
  // JS not rendered
  "enable javascript", "javascript is required", "loading...",
  // Error pages
  "page not found", "404 not found", "this page doesn't exist",
  // Access denied / rate limiting
  "access denied", "403 forbidden", "too many requests", "rate limit exceeded",
  // CAPTCHA / bot detection
  "captcha", "verify you are human", "are you a robot", "prove you're not a robot",
  // Cookie walls
  "cookies must be enabled", "please enable cookies",
  // Cloudflare / DDoS protection
  "just a moment", "checking your browser", "ray id",
];

export function isUsableMarkdown(md: string): boolean {
  if (!md || md.trim().length < 300) return false;
  const lower = md.toLowerCase();
  return !UNUSABLE_SIGNALS.some((s) => lower.includes(s));
}
