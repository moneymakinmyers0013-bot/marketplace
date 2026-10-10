import type { ReactNode, Ref } from "react";
import { localImageProps } from "@/lib/marketplace/local-image";

export function CollectionBanner({ name, image, children, ref }: {
  name: string;
  image?: string | null;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-testid="collection-header-image"
      className="relative -mx-4 overflow-hidden border-y border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)] sm:-mx-6"
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`${name} banner`}
            {...localImageProps(image)}
            sizes="100vw"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="hero-image absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--realm-bg-void)] via-[color:var(--realm-bg-void)]/70 to-transparent" />
        </>
      ) : null}
      <div className="hero-content relative flex min-h-32 flex-wrap items-end justify-between gap-x-6 gap-y-4 px-4 pt-10 pb-4 sm:min-h-40 sm:px-6 sm:pb-5">
        <h1 className="market-page-title min-w-0 break-words drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
          {name}
        </h1>
        {children}
      </div>
    </div>
  );
}
