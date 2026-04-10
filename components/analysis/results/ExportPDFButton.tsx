"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types/analysis";

interface ExportPDFButtonProps {
  result: AnalysisResult;
}

export function ExportPDFButton({ result }: ExportPDFButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    try {
      // Lazy-load @react-pdf/renderer (~750 KB) only on demand
      const [{ pdf }, { AnalysisPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./AnalysisPDF"),
      ]);

      const blob = await pdf(<AnalysisPDF result={result} />).toBlob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.productBrief.company.replace(/\s+/g, "-").toLowerCase()}-uxio-analysis.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ExportPDF] Failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        paddingInline: 14,
        paddingBlock: 7,
        borderRadius: 8,
        border: "1px solid rgba(0,0,0,0.14)",
        background: "#ffffff",
        fontSize: 13,
        fontWeight: 500,
        color: loading ? "#9ca3af" : "#374151",
        cursor: loading ? "default" : "pointer",
        transition: "border-color 150ms, background 150ms",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!loading)
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.14)";
      }}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin"
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Generating…
        </>
      ) : (
        <>
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export PDF
        </>
      )}
    </button>
  );
}
