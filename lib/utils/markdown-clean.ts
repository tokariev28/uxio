/**
 * Strips markdown link/image syntax from text before sending to LLM.
 * Converts [text](url) → text, ![alt](url) → alt (or removes if alt empty).
 * Prevents LLM from quoting raw URL parameters as "copy evidence".
 */
export function stripMarkdownLinks(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images: ![alt](url) → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");   // links:  [text](url) → text, [](url) → ""
    // bare URLs intentionally kept — they are evidence for LLM analysis
}

/**
 * Strips common boilerplate lines from scraped markdown before sending to LLM.
 * Removes navigation menus, cookie banners, breadcrumbs, and decorative separators
 * that waste tokens and cause the LLM to cite non-content elements as "evidence".
 */
const BOILERPLATE_LINE_RE = /^(skip to|go to|follow us|subscribe|cookie|accept all|privacy policy|terms of (service|use)|© \d|copyright \d|all rights reserved|breadcrumb|sign in|log in|search\.{0,3}$)/i;
const BREADCRUMB_RE = /^[A-Z][\w\s]+ [>›»\|] [A-Z][\w\s]+( [>›»\|] [A-Z][\w\s]+)*/;
const SEPARATOR_ONLY_RE = /^[\s\-=*#+_.│|]{1,80}$/;

export function stripBoilerplate(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true; // keep single blank lines (collapsed below)
      if (BOILERPLATE_LINE_RE.test(trimmed)) return false;
      if (BREADCRUMB_RE.test(trimmed)) return false;
      if (SEPARATOR_ONLY_RE.test(trimmed) && trimmed.length > 2) return false;
      return true;
    })
    .join("\n")
    // Collapse multiple blank lines into one
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Strips markdown inline-code backtick spans from AI-generated display text.
 * Converts `code` → code. LLMs frequently wrap technical terms like `cta`,
 * `sectionType`, or `navigation` in backticks; the UI renders them literally.
 */
export function stripInlineCode(text: string): string {
  return text.replace(/`([^`]+)`/g, "$1");
}
