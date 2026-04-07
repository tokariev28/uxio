"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ScreenshotViewerProps {
  src: string | undefined;
  alt: string;
  className?: string;
}

type LoadState = "loading" | "loaded" | "error";

export function ScreenshotViewer({ src, alt, className }: ScreenshotViewerProps) {
  const [loadState, setLoadState] = useState<LoadState>(src ? "loading" : "error");

  useEffect(() => {
    setLoadState(src ? "loading" : "error");
  }, [src]);

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {/* Skeleton shown while loading */}
      {loadState === "loading" && (
        <Skeleton className="h-[320px] w-full rounded-none" />
      )}

      {/* Fallback shown on error or missing src */}
      {loadState === "error" && (
        <div className="flex h-[320px] w-full flex-col items-center justify-center gap-2 bg-muted">
          <ImageOff className="size-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Screenshot unavailable</p>
        </div>
      )}

      {/* Always render img when src exists so onLoad/onError fire */}
      {src && (
        <img
          src={src}
          alt={alt}
          className={cn("w-full", loadState !== "loaded" && "hidden")}
          style={{ objectFit: "cover", objectPosition: "top", height: "320px" }}
          loading="lazy"
          onLoad={() => setLoadState("loaded")}
          onError={() => setLoadState("error")}
        />
      )}
    </div>
  );
}
