"use client";

import { useEffect } from "react";

interface ScreenshotLightboxProps {
  src: string | undefined;
  domain: string;
  onClose: () => void;
}

function normalizeSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("http")) return src;
  return `data:image/png;base64,${src}`;
}

export function ScreenshotLightbox({ src, domain, onClose }: ScreenshotLightboxProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const imgSrc = normalizeSrc(src);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "lightbox-fade-in 250ms ease",
      }}
    >
      <style>{`
        @keyframes lightbox-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes lightbox-scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          overflow: "hidden",
          maxWidth: "90vw",
          maxHeight: "85vh",
          boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
          cursor: "default",
          animation: "lightbox-scale-in 250ms cubic-bezier(0.16, 1, 0.3, 1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ overflow: "auto", maxHeight: "calc(85vh - 50px)" }}>
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={`Screenshot of ${domain}`}
              style={{ width: 600, maxWidth: "90vw", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: 600,
                maxWidth: "90vw",
                height: 400,
                background: "linear-gradient(135deg, #f1f5f9, #e2e8f0)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              Screenshot unavailable
            </div>
          )}
        </div>
        <div
          style={{
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #f3f3f3",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{domain}</span>
          <span
            onClick={onClose}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#9ca3af",
              cursor: "pointer",
            }}
          >
            Close &nbsp;&#10005;
          </span>
        </div>
      </div>
    </div>
  );
}
