"use client";
import { LoadingRegion } from "@/components/marketplace/loading-state";

import { useId, useState, type ReactNode } from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useElementWidth } from "@/lib/animation/use-element-width";
import { cn } from "@/lib/utils";

export const CHART_MARGIN = { top: 12, right: 12, bottom: 24, left: 48 } as const;

type ChartFrameProps = {
  title: string;
  /** One line under the title saying what the data is and its limits. */
  subtitle?: string;
  /** Headline figure shown top-right. */
  summary?: ReactNode;
  height?: number;
  loading?: boolean;
  /** Keep the last render visible at reduced opacity while new data arrives. */
  refreshing?: boolean;
  /** Message shown instead of the plot when there is nothing to draw. */
  empty?: string | null;
  /** The accessible twin of the plot: a plain table with the same values. */
  table: ReactNode;
  children: (width: number, height: number) => ReactNode;
  className?: string;
};

/**
 * Shared chart chrome: title, headline, a chart/table toggle, width measuring
 * and the loading, empty and refreshing states. Charts draw into the callback.
 */
export function ChartFrame({
  title,
  subtitle,
  summary,
  height = 220,
  loading = false,
  refreshing = false,
  empty = null,
  table,
  children,
  className,
}: ChartFrameProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [view, setView] = useState<"chart" | "table">("chart");
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn("realm-panel flex min-w-0 flex-col gap-4 p-4 sm:p-5", className)}
      data-testid={`chart-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <h3 id={titleId} className="market-group-title min-w-0">
          {title}
        </h3>
        <div className="flex items-center gap-3 justify-self-end">
          {summary ? <div className="text-right">{summary}</div> : null}
          <ToggleGroupPrimitive.Root
            type="single"
            value={view}
            aria-label={`${title} view`}
            onValueChange={(value) => {
              if (value === "chart" || value === "table") setView(value);
            }}
            className="market-segmented h-8"
          >
            {(["chart", "table"] as const).map((option) => (
              <ToggleGroupPrimitive.Item
                key={option}
                value={option}
                className="market-segment px-2.5 capitalize"
              >
                {option}
              </ToggleGroupPrimitive.Item>
            ))}
          </ToggleGroupPrimitive.Root>
        </div>
        {subtitle ? <p className="col-span-2 text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      <div ref={ref} className="min-w-0">
        {loading ? (
          <LoadingRegion label={`Loading ${title}`}><Skeleton className="w-full" style={{ height }} data-testid="chart-skeleton" /></LoadingRegion>
        ) : view === "table" ? (
          <div className="max-h-72 overflow-auto rounded-[6px] border border-[color:var(--realm-border-etched)] text-xs">
            {table}
          </div>
        ) : empty ? (
          <div
            className="flex items-center justify-center rounded-[6px] border border-dashed border-[color:var(--realm-border-etched)] text-xs text-muted-foreground"
            style={{ height }}
          >
            {empty}
          </div>
        ) : (
          <div
            className={cn("relative transition-opacity", refreshing && "opacity-60")}
            style={{ height }}
          >
            {children(width, height)}
          </div>
        )}
      </div>
    </section>
  );
}

/** Positioned tooltip rendered above the plot; purely visual (the table carries the values). */
export function ChartTooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
}) {
  const flip = x > width * 0.65;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 min-w-28 rounded-[6px] border border-[color:var(--realm-border-strong)] bg-[color:var(--realm-bg-void)]/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 8),
      }}
    >
      {children}
    </div>
  );
}

export function Axes({
  width,
  height,
  yTicks,
  yScale,
  xTicks,
  xScale,
  formatY,
  formatX,
}: {
  width: number;
  height: number;
  yTicks: number[];
  yScale: (value: number) => number;
  xTicks: number[];
  xScale: (value: number) => number;
  formatY: (value: number) => string;
  formatX: (value: number) => string;
}) {
  return (
    <g aria-hidden>
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            className="market-chart-grid"
            x1={CHART_MARGIN.left}
            x2={width - CHART_MARGIN.right}
            y1={yScale(tick)}
            y2={yScale(tick)}
          />
          <text className="market-chart-axis" x={CHART_MARGIN.left - 6} y={yScale(tick) + 3} textAnchor="end">
            {formatY(tick)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <text
          key={`x-${tick}`}
          className="market-chart-axis"
          x={xScale(tick)}
          y={height - 6}
          textAnchor="middle"
        >
          {formatX(tick)}
        </text>
      ))}
      <line
        className="market-chart-grid"
        x1={CHART_MARGIN.left}
        x2={width - CHART_MARGIN.right}
        y1={height - CHART_MARGIN.bottom}
        y2={height - CHART_MARGIN.bottom}
      />
    </g>
  );
}
