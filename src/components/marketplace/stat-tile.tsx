import type { ReactNode } from "react";
import { InfoTip } from "@/components/marketplace/info-tip";
import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  /** Plain-language source of the figure, shown from an info button beside the label. */
  help?: string;
  children: ReactNode;
  /** Supporting line under the value: a period, a delta or a count. */
  note?: ReactNode;
  /** `compact` sits in banners and toolbars; `default` leads a page section. */
  size?: "default" | "compact";
  className?: string;
  valueClassName?: string;
  valueTestId?: string;
};

/**
 * One market figure: label, value and optional note. Render tiles inside a
 * `<dl>` so each label/value pair is announced together. The label row has a
 * fixed height, so tiles with and without an explainer align.
 */
export function StatTile({
  label,
  help,
  children,
  note,
  size = "default",
  className,
  valueClassName,
  valueTestId,
}: StatTileProps) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "realm-stat-pill flex min-w-0 flex-col",
        compact ? "gap-0.5 px-3 py-2" : "gap-1 px-3 py-2.5",
        className,
      )}
    >
      <dt className="market-label flex h-4 items-center gap-1">
        <span className="truncate">{label}</span>
        {help ? (
          <InfoTip label={`About ${label.toLowerCase()}`} text={help} className="-my-0.5 size-5" />
        ) : null}
      </dt>
      <dd
        data-testid={valueTestId}
        className={cn(
          "market-stat-value flex min-w-0 items-center gap-1 font-semibold tabular-nums",
          compact ? "text-sm leading-5" : "text-lg leading-7",
          valueClassName,
        )}
      >
        {children}
      </dd>
      {note ? <dd className="market-label">{note}</dd> : null}
    </div>
  );
}
