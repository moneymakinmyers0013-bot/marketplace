"use client";

import { useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { localImageProps } from "@/lib/marketplace/local-image";

type TokenMediaProps = {
  /** Candidate URLs in preference order; the next one is tried when one fails. */
  sources: string[];
  alt: string;
  className?: string;
  /** Class for the wrapper when no source can be displayed. */
  fallbackClassName?: string;
  fallbackLabel?: string;
  /** Load eagerly for above-the-fold hero media. */
  priority?: boolean;
  style?: CSSProperties;
  sizes?: string;
};

/**
 * Renders NFT artwork with graceful failure: lazy loading, async decoding, and
 * automatic fallthrough across gateways before showing a quiet placeholder.
 */
export function TokenMedia({
  sources,
  alt,
  className,
  fallbackClassName,
  fallbackLabel = "No image",
  priority = false,
  style,
  sizes,
}: TokenMediaProps) {
  const key = sources.join("|");
  // Derive the attempt counter from the source list so a new list restarts at the first candidate.
  const [attempt, setAttempt] = useState({ key, index: 0 });
  const index = attempt.key === key ? attempt.index : 0;
  const source = sources[index];
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const pending = loadedSource !== source;

  if (!source) {
    return (
      <div
        role="img"
        aria-label={`${alt}: ${fallbackLabel}`}
        data-testid="token-media-fallback"
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 bg-[radial-gradient(circle_at_30%_20%,rgba(231,207,136,0.12),transparent_10rem),linear-gradient(145deg,#161b20,#070b0d)] text-muted-foreground",
          fallbackClassName,
        )}
        style={style}
      >
        <ImageOff aria-hidden className="size-5 opacity-60" />
        <span className="text-[11px]">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={cn("h-full w-full object-cover", pending && "bg-muted/70 animate-pulse motion-reduce:animate-none", className)}
      aria-busy={alt ? pending : undefined}
      onLoad={() => setLoadedSource(source)}
      ref={(image) => { if (image?.complete && image.naturalWidth > 0) setLoadedSource(source); }}
      data-media-index={index}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      onError={() => setAttempt({ key, index: index + 1 })}
      sizes={sizes ?? "100vw"}
      {...localImageProps(source)}
      style={style}
    />
  );
}
