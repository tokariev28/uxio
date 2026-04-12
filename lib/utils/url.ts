/**
 * URL parsing utilities shared across agents and UI components.
 * Centralizes the hostname extraction pattern that was previously
 * duplicated 19+ times across the codebase.
 */

/** Extract hostname without `www.` prefix. Returns the raw input on parse failure. */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Same as getHostname but returns empty string on failure (for filtering). */
export function getHostnameOrEmpty(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
