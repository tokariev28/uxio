import { cn } from "@/lib/utils";

export interface NavItem {
  sectionIndex: number;
  label: string;
}

interface SectionNavSidebarProps {
  items: NavItem[];
  activeIndex: number;
  onClickItem: (index: number) => void;
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
          {item.label}
        </button>
      ))}
    </nav>
  );
}
