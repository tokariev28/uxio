"use client";

import { useState } from "react";

interface ScreenshotViewerProps {
  /** Layer 2: full-page screenshot — base64 string or GCS URL */
  src: string | undefined;
  /** Layer 1: section-specific screenshot (reserved, always undefined for now) */
  sectionSrc?: string;
  /** Used in Layer 3 placeholder — domain + favicon */
  siteUrl?: string;
  alt: string;
  /** CSS object-position for crop simulation (e.g. "top", "30% top") */
  objectPosition?: string;
  height?: number;
  className?: string;
}

type Layer = 1 | 2 | 3;

function normalizeSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("http")) return src;
  return `data:image/png;base64,${src}`;
}

function domainFrom(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * NOTE: Pass a `key` prop from the parent (e.g. key={src ?? siteUrl}) to reset
 * state when the screenshot source changes between renders.
 */
export function ScreenshotViewer({
  src,
  sectionSrc,
  siteUrl,
  alt,
  objectPosition = "top",
  height = 200,
  className,
}: ScreenshotViewerProps) {
  // Compute start layer from initial props — parent must pass `key` to reset on src change
  const startLayer: Layer = sectionSrc ? 1 : src ? 2 : 3;
  const [layer, setLayer] = useState<Layer>(startLayer);
  const [loading, setLoading] = useState(startLayer < 3);

  const domain = domainFrom(siteUrl);
  const activeSrc = normalizeSrc(layer === 1 ? sectionSrc : layer === 2 ? src : undefined);

  function handleError() {
    if (layer === 1) {
      const next: Layer = src ? 2 : 3;
      setLayer(next);
      setLoading(next === 2);
    } else {
      setLayer(3);
      setLoading(false);
    }
  }

  function handleLoad() {
    setLoading(false);
  }

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: 10 }}
    >
      {/* Loading shimmer */}
      {loading && (
        <div
          className="skeleton-shimmer"
          style={{ position: "absolute", inset: 0, borderRadius: 10 }}
        />
      )}

      {/* Layer 1 or Layer 2 image */}
      {activeSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeSrc}
          alt={alt}
          style={{
            width: "100%",
            height,
            objectFit: "cover",
            objectPosition,
            display: loading ? "none" : "block",
            borderRadius: 10,
          }}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Layer 3 — styled placeholder */}
      {layer === 3 && !loading && (
        <div
          style={{
            width: "100%",
            height,
            background: "linear-gradient(135deg, #f1f5f9, #e2e8f0)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 10,
          }}
        >
          {domain && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              width={20}
              height={20}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {domain && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{domain}</span>
          )}
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Screenshot unavailable</span>
        </div>
      )}
    </div>
  );
}
