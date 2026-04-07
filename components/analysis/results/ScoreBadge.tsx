import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

function getScoreConfig(score: number): { label: string; classes: string } {
  if (score < 0.6) {
    return {
      label: "Needs work",
      classes:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
  }
  if (score < 0.8) {
    return {
      label: "Moderate",
      classes:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    };
  }
  return {
    label: "Strong",
    classes:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const { label, classes } = getScoreConfig(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        classes,
        className
      )}
    >
      {label}
      <span className="opacity-70">·</span>
      <span>{Math.round(score * 100)}%</span>
    </span>
  );
}
