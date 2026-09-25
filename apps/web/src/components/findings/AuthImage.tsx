"use client";

import { useEffect, useState } from "react";
import { apiObjectUrl } from "@/lib/api";

type Props = {
  src: string | null;
  alt?: string;
  className?: string;
  onError?: () => void;
  loading?: "lazy" | "eager";
};

/**
 * Renders data: URLs directly; fetches /api/* (and other app paths) with auth
 * into a blob URL so bearer-token sessions can show screenshots.
 */
export function AuthImage({ src, alt = "", className = "", onError, loading }: Props) {
  const [display, setDisplay] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src) {
      setDisplay(null);
      return;
    }
    if (src.startsWith("data:") || src.startsWith("blob:") || /^https?:/i.test(src)) {
      setDisplay(src);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setDisplay(null);
    (async () => {
      try {
        objectUrl = await apiObjectUrl(src);
        if (!cancelled) setDisplay(objectUrl);
      } catch {
        if (!cancelled) {
          setFailed(true);
          onError?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError is optional notify
  }, [src]);

  if (!src || failed || !display) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={display}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}
