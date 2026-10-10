import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: ReactNode;
  /** Item count shown beside the title; a string such as "12+" marks a partial count. */
  count?: number | string;
  description?: ReactNode;
  /** Controls aligned to the end of the title row, such as a primary action or a filter. */
  action?: ReactNode;
  /** Heading level; the visual style stays the section title either way. */
  as?: "h2" | "h3";
  id?: string;
  className?: string;
};

/** The single page-section heading: brass title, optional count, description and trailing action. */
export function SectionHeader({
  title,
  count,
  description,
  action,
  as: Heading = "h2",
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0 flex-[1_1_16rem] space-y-1">
        <div className="flex items-center gap-2">
          <Heading id={id} className="market-section-title">
            {title}
          </Heading>
          {count !== undefined ? (
            <span className="market-chip inline-flex h-5 items-center rounded-sm border px-1.5 text-muted-foreground">{count}</span>
          ) : null}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
