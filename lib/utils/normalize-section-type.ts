/**
 * Normalise LLM-returned section strings to match VALID_SECTION_TYPES.
 * Handles: capitalisation ("Hero" → "hero"), trailing " section" suffix,
 * all-caps acronyms ("FAQ" → "faq"), and multi-word inputs in any case
 * ("social proof" / "Social Proof" → "socialProof", "how it works" → "howItWorks").
 */
export function normalizeSectionType(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().replace(/\s+section$/i, "");
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    const w = words[0];
    // All-caps acronym (FAQ, CTA, HERO) → lowercase
    if (w === w.toUpperCase() && w.length > 0) return w.toLowerCase();
    // Single word (already camelCase or Title case) → lowercase first char
    return w.replace(/^[A-Z]/, (c) => c.toLowerCase());
  }
  // Multi-word → camelCase: "social proof" → "socialProof", "How It Works" → "howItWorks"
  return words
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
