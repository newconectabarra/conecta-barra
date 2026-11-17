import { Image } from "expo-image";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";

type ImageSource = ComponentProps<typeof Image>["source"];

type CachedImageProps = Omit<ComponentProps<typeof Image>, "source"> & {
  source: ImageSource;
  fallbackSource?: ImageSource;
};

function sourceKey(source: ImageSource) {
  if (typeof source === "number") return `asset:${source}`;
  try {
    return JSON.stringify(source);
  } catch {
    return String(source);
  }
}

/**
 * Remote-image primitive used by avatars and request photos.
 * It keeps the successful resource in memory and on disk, fades source changes,
 * and falls back to the app icon instead of leaving a broken image.
 */
export function CachedImage({
  source,
  fallbackSource,
  cachePolicy = "memory-disk",
  transition = 180,
  contentFit = "cover",
  onError,
  ...props
}: CachedImageProps) {
  const sourceId = useMemo(() => sourceKey(source), [source]);
  const fallbackId = useMemo(() => (fallbackSource ? sourceKey(fallbackSource) : null), [fallbackSource]);
  const [failedSourceId, setFailedSourceId] = useState<string | null>(null);
  const showingFallback = Boolean(fallbackSource && failedSourceId === sourceId);
  const activeSource = showingFallback ? fallbackSource : source;

  useEffect(() => {
    setFailedSourceId(null);
  }, [sourceId, fallbackId]);

  return (
    <Image
      {...props}
      source={activeSource}
      cachePolicy={cachePolicy}
      transition={transition}
      contentFit={contentFit}
      onError={(event) => {
        if (fallbackSource && !showingFallback) setFailedSourceId(sourceId);
        onError?.(event);
      }}
    />
  );
}
