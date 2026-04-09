"use client";

import { useEffect, useRef, useState } from "react";

interface ScreenshotViewerProps {
  /** Full-page screenshot — base64 string or URL */
  src: string | undefined;
  /** 0.0–1.0 vertical position of the section on the page (startChar / totalChars).
   *  When provided, the viewer crops the image to the section region via canvas. */
  scrollFraction?: number;
  /** Used in the placeholder layer — domain + favicon */
  siteUrl?: string;
  alt: string;
  height?: number;
  className?: string;
}

type Layer = "cropped" | "full" | "placeholder";

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
  scrollFraction,
  siteUrl,
  alt,
  height = 200,
  className,
}: ScreenshotViewerProps) {
  const normalizedSrc = normalizeSrc(src);
  const domain = domainFrom(siteUrl);

  const [croppedSrc, setCroppedSrc] = useState<string | undefined>(undefined);
  const [cropError, setCropError] = useState(false);
  const [layer, setLayer] = useState<Layer>(normalizedSrc ? "cropped" : "placeholder");
  const [loading, setLoading] = useState(layer !== "placeholder");
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Canvas crop — fires when src or scrollFraction change
  useEffect(() => {
    if (!normalizedSrc) {
      setLayer("placeholder");
      setLoading(false);
      return;
    }

    // Reset state for new src
    setCroppedSrc(undefined);
    setCropError(false);
    setLoading(true);

    if (scrollFraction === undefined) {
      // No scroll position — show full image from top
      setLayer("full");
      return;
    }

    // Crop via canvas
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const cropStart = Math.max(0, scrollFraction - 0.05);
        const cropEnd = Math.min(1, scrollFraction + 0.25);
        const srcY = Math.round(img.naturalHeight * cropStart);
        const srcH = Math.round(img.naturalHeight * (cropEnd - cropStart));

        // Canvas dimensions: preserve aspect ratio of the crop
        const aspectRatio = img.naturalWidth / srcH;
        canvas.width = Math.round(height * aspectRatio);
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2d context unavailable");

        ctx.drawImage(
          img,
          0, srcY, img.naturalWidth, srcH,  // source: full width, cropped height
          0, 0, canvas.width, canvas.height   // destination: canvas
        );

        setCroppedSrc(canvas.toDataURL("image/jpeg", 0.85));
        setLayer("cropped");
        setLoading(false);
      } catch {
        setCropError(true);
        setLayer("full");
      }
    };
    img.onerror = () => {
      setCropError(true);
      setLayer(src ? "full" : "placeholder");
      setLoading(src ? true : false);
    };
    img.src = normalizedSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSrc, scrollFraction]);

  const displaySrc = layer === "cropped" ? croppedSrc : normalizedSrc;

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: 10 }}
      ref={canvasRef}
    >
      {/* Loading shimmer */}
      {loading && (
        <div
          className="skeleton-shimmer"
          style={{ position: "absolute", inset: 0, borderRadius: 10 }}
        />
      )}

      {/* Image layer (cropped or full) */}
      {(layer === "cropped" || layer === "full") && displaySrc && !loading && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displaySrc}
          alt={alt}
          style={{
            width: "100%",
            height,
            objectFit: "cover",
            objectPosition: layer === "full" ? "top" : "center",
            display: "block",
            borderRadius: 10,
          }}
          onError={() => {
            if (layer === "cropped" || cropError) {
              setLayer("placeholder");
            } else {
              setLayer("placeholder");
            }
            setLoading(false);
          }}
        />
      )}

      {/* Placeholder */}
      {layer === "placeholder" && !loading && (
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
