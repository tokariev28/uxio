import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  score: number | null;
}

interface CompetitorTabSwitcherProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
}

function getScoreDotClass(score: number | null): string {
  if (score === null) return "bg-muted-foreground/30";
  if (score < 0.6) return "bg-red-500";
  if (score < 0.8) return "bg-amber-500";
  return "bg-green-500";
}

export function CompetitorTabSwitcher({
  tabs,
  activeTab,
  onChange,
}: CompetitorTabSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Site comparison tabs"
      className="flex gap-1 overflow-x-auto p-1 bg-muted rounded-lg"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            activeTab === tab.id
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full shrink-0",
              getScoreDotClass(tab.score)
            )}
          />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
