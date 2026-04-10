/**
 * Strips markdown link/image syntax from text before sending to LLM.
 * Converts [text](url) → text, ![alt](url) → alt (or removes if alt empty).
 * Prevents LLM from quoting raw URL parameters as "copy evidence".
 */
export function stripMarkdownLinks(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images: ![alt](url) → alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");  // links:  [text](url) → text
    // bare URLs intentionally kept — they are evidence for LLM analysis
}

/**
 * Strips markdown inline-code backtick spans from AI-generated display text.
 * Converts `code` → code. LLMs frequently wrap technical terms like `cta`,
 * `sectionType`, or `navigation` in backticks; the UI renders them literally.
 */
export function stripInlineCode(text: string): string {
  return text.replace(/`([^`]+)`/g, "$1");
}
