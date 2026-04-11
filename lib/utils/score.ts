/** Score color by threshold (used in gauges, PDF, and badges). */
export function getScoreColor(score: number): string {
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#06b6d4";
  if (score >= 50) return "#f97316";
  return "#f43f5e";
}

/** Grade label for PDF export. */
export function getGradeLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs work";
  return "Critical";
}
