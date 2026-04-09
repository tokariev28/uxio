import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Priority, Recommendation } from "@/lib/types/analysis";

function toSentenceCase(str: string): string {
  if (!str) return str;
  return str
    .split(" ")
    .map((word, i) => {
      if (i === 0) return word;
      // Keep acronyms/all-caps words (e.g. CTA, SEO, UI, API)
      if (word.length > 1 && word === word.toUpperCase()) return word;
      return word.toLowerCase();
    })
    .join(" ");
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  index: number;
}

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; classes: string }
> = {
  critical: {
    label: "Critical",
    classes:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  high: {
    label: "High",
    classes:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  medium: {
    label: "Medium",
    classes:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

export function RecommendationCard({
  recommendation,
  index,
}: RecommendationCardProps) {
  const { priority, title, reasoning, exampleFromCompetitor, suggestedAction } =
    recommendation;
  const config = PRIORITY_CONFIG[priority];

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              config.classes
            )}
          >
            {config.label}
          </span>
          <CardTitle className="text-sm font-medium leading-snug">
            {index + 1}. {toSentenceCase(title)}
          </CardTitle>
        </div>
        <CardDescription className="line-clamp-2 text-xs">
          {reasoning}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {exampleFromCompetitor && (
          <p className="text-xs italic text-muted-foreground">
            {exampleFromCompetitor}
          </p>
        )}
        {suggestedAction && (
          <p className="text-xs font-semibold text-accent-foreground">
            → {suggestedAction}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
