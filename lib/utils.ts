import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toSentenceCase(str: string): string {
  if (!str) return str;
  const words = str.split(" ");
  return words.map((word, i) => {
    // Preserve ALL-CAPS acronyms (e.g. CTA, UI, API)
    if (word.length > 1 && word === word.toUpperCase()) return word;
    const lower = word.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join(" ");
}
