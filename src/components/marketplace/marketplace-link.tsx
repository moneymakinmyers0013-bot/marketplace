"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { admitNavigationPrefetch, type NetworkPreference } from "@/lib/marketplace/prefetch-budget";

type Props = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string };

/** Full route prefetch carries the server's public query snapshot; no parallel API fan-out. */
export function MarketplaceLink({ href, onMouseEnter, onMouseLeave, onFocus, onBlur, onTouchStart, ...props }: Props) {
  const [prepared, setPrepared] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), [href]);
  const prepare = () => {
    const network = (navigator as Navigator & { connection?: NetworkPreference }).connection;
    if (admitNavigationPrefetch(href, network)) setPrepared(href);
  };
  const leave = () => { clearTimeout(timer.current); setPrepared(null); };
  return <Link {...props} href={href} prefetch={prepared === href}
    onMouseEnter={event => {
      onMouseEnter?.(event);
      if (!event.defaultPrevented) { clearTimeout(timer.current); timer.current = setTimeout(prepare, 120); }
    }}
    onMouseLeave={event => { onMouseLeave?.(event); leave(); }}
    onFocus={event => { onFocus?.(event); clearTimeout(timer.current); if (!event.defaultPrevented) prepare(); }}
    onBlur={event => { onBlur?.(event); leave(); }}
    onTouchStart={event => { onTouchStart?.(event); if (!event.defaultPrevented) prepare(); }}
  />;
}
