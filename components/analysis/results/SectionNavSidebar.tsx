import { cn } from "@/lib/utils";

export interface NavItem {
  sectionIndex: number;
  label: string;
  score?: number; // 0–100
}

function getArcColor(score: number): string {
  if (score >= 85) return "#16a34a";
  if (score >= 70) return "#ca8a04";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function MiniArc({ score }: { score: number }) {
  const cx = 14, cy = 14, r = 10, sw = 3;
  const angle = (Math.PI * score) / 100;
  const fillEndX = cx - r * Math.cos(angle);
  const fillEndY = cy - r * Math.sin(angle);
  const color = getArcColor(score);

  return (
    <svg viewBox="0 0 28 18" width={22} height={14} style={{ flexShrink: 0 }}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {score > 0 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${fillEndX.toFixed(2)} ${fillEndY.toFixed(2)}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
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
            "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
            activeIndex === item.sectionIndex
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <span className="flex-1 truncate">{item.label}</span>
          {item.score != null && (
            <span className="flex items-center gap-1 shrink-0">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: activeIndex === item.sectionIndex ? "#374151" : "#9ca3af",
                  minWidth: 18,
                  textAlign: "right",
                }}
              >
                {item.score}
              </span>
              <MiniArc score={item.score} />
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
