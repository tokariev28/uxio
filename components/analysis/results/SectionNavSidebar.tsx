import { cn } from "@/lib/utils";

export interface NavItem {
  sectionIndex: number;
  label: string;
  inputScore: number | null;
}

interface SectionNavSidebarProps {
  items: NavItem[];
  activeIndex: number;
  onClickItem: (index: number) => void;
}

function getDotClass(score: number | null): string {
  if (score === null) return "bg-muted-foreground/30";
  if (score < 0.6) return "bg-red-500";
  if (score < 0.8) return "bg-amber-500";
  return "bg-green-500";
}

export function SectionNavSidebar({
  items,
  activeIndex,
  onClickItem,
}: SectionNavSidebarProps) {
  return (
    <nav aria-label="Section navigation" className="flex flex-col gap-0.5">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sections
      </p>
      {items.map((item) => (
        <button
          key={item.sectionIndex}
          onClick={() => onClickItem(item.sectionIndex)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            activeIndex === item.sectionIndex
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              getDotClass(item.inputScore)
            )}
          />
          {item.label}
        </button>
      ))}
    </nav>
  );
}
