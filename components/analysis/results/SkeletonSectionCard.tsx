function Bar({ width = "100%", height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{ width, height, borderRadius: 6 }}
    />
  );
}

function SkeletonRect({ height }: { height: number }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{ width: "100%", height, borderRadius: 10 }}
    />
  );
}

function SkeletonInsightCard() {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Bar width={72} height={20} />
        <Bar width={44} height={12} />
      </div>
      <Bar width="70%" height={14} />
      <Bar width="100%" height={12} />
      <Bar width="90%" height={12} />
      <div
        style={{
          borderLeft: "3px solid #e2e8f0",
          paddingLeft: 12,
          marginTop: 4,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <Bar width="85%" height={11} />
        <Bar width="75%" height={11} />
      </div>
      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12, marginTop: 4 }}>
        <Bar width="60%" height={13} />
      </div>
    </div>
  );
}

export function SkeletonSectionCard() {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 32,
        marginBottom: 8,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Bar width={120} height={18} />
        <Bar width={72} height={24} />
      </div>

      {/* Key finding */}
      <div
        style={{
          background: "#fafafa",
          borderLeft: "3px solid #e5e7eb",
          padding: "14px 18px",
          borderRadius: "0 10px 10px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Bar width="90%" height={13} />
        <Bar width="75%" height={13} />
      </div>

      {/* Screenshot row — 3 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <SkeletonRect height={200} />
        <SkeletonRect height={200} />
        <SkeletonRect height={200} />
      </div>

      {/* Insight cards — 2-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <SkeletonInsightCard />
        <SkeletonInsightCard />
        <SkeletonInsightCard />
        <SkeletonInsightCard />
      </div>
    </div>
  );
}
