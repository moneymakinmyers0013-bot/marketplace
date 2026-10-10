import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { monaspaceXenon } from "@/lib/fonts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/marketplace/section-header";
import { StatTile } from "@/components/marketplace/stat-tile";

const LEVELS = [
  ["Page title", "market-page-title", "Beasts #6", "IM Fell · 30px, 36px from 640px · one per route"],
  ["Section title", "market-section-title", "Recent sales", "IM Fell brass · 18px · page sections and bordered panels"],
  ["Group title", "market-group-title", "Floor price", "Exo 2 semibold · 14px · charts, form groups, sub-panels"],
  ["Label", "market-label", "Top offer", "Exo 2 muted · 12px · stat and field labels, sentence case"],
] as const;

function Hierarchy() {
  return (
    <main className="market-page mx-auto max-w-5xl space-y-10">
      <section aria-labelledby="scale" className="space-y-4">
        <SectionHeader id="scale" title="Type scale" description="One style per level. Body copy is 14px; metadata is 12px muted." />
        <dl className="divide-y rounded-lg border">
          {LEVELS.map(([name, className, sample, spec]) => (
            <div key={name} className="grid gap-1 px-4 py-4 sm:grid-cols-[10rem_1fr] sm:items-baseline">
              <dt className="market-label">{name}</dt>
              <dd className="space-y-1">
                <p className={className}>{sample}</p>
                <p className="text-xs text-muted-foreground">
                  <code className="font-mono">.{className}</code> · {spec}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="stats" className="space-y-4">
        <SectionHeader id="stats" title="Market figures" description="StatTile: the same label row, value weight and note in banners, token pages and analytics." />
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
          <StatTile label="Price" help="Cheapest open listing, fees included.">18 STRK</StatTile>
          <StatTile label="Top offer" help="Highest open offer.">15 STRK</StatTile>
          <StatTile label="Last sale">
            <span className="text-muted-foreground">No sales yet</span>
          </StatTile>
          <StatTile label="Volume" note="30d gross, fees included">523 STRK</StatTile>
        </dl>
        <dl className="flex flex-wrap gap-2">
          {[
            ["Floor", "22.22 STRK"],
            ["Top offer", "21.34 STRK"],
            ["7d volume", "51.04 STRK"],
            ["7d sales", "2"],
            ["Listed", "11 (92%)"],
            ["Items", "12"],
          ].map(([label, value], index) => (
            <StatTile key={label} size="compact" label={label} help={index % 2 ? undefined : `About ${label}`} className="min-w-[7.5rem]">
              {value}
            </StatTile>
          ))}
        </dl>
      </section>

      <section aria-labelledby="data" className="space-y-4">
        <SectionHeader
          id="data"
          title="Data and chips"
          description="Monaspace Xenon marks machine data and chips. Prices, labels, headings and body copy stay in Exo 2 and IM Fell."
        />
        <dl className="divide-y rounded-lg border">
          <div className="grid gap-2 px-4 py-4 sm:grid-cols-[10rem_1fr] sm:items-center">
            <dt className="market-label">Chips</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Sale</Badge>
              <Badge variant="outline">Collection offer</Badge>
              <Badge variant="secondary">You</Badge>
              <span className="market-chip text-muted-foreground">ERC-721</span>
              <span className="market-chip inline-flex h-5 items-center rounded-sm border px-1.5 text-muted-foreground">12+</span>
              <span className="market-chip inline-flex h-8 items-center rounded-full border border-primary/40 bg-primary/10 px-2.5">
                Cities: 10–18
              </span>
            </dd>
          </div>
          <div className="grid gap-2 px-4 py-4 sm:grid-cols-[10rem_1fr] sm:items-center">
            <dt className="market-label">Segmented filters</dt>
            <dd>
              <div role="group" aria-label="Example period" className="market-segmented">
                {["1d", "7d", "30d", "90d"].map((period) => (
                  <button key={period} type="button" aria-pressed={period === "30d"} className="market-segment h-9 min-w-11 px-2">
                    {period}
                  </button>
                ))}
              </div>
            </dd>
          </div>
          <div className="grid gap-2 px-4 py-4 sm:grid-cols-[10rem_1fr] sm:items-center">
            <dt className="market-label">Machine data</dt>
            <dd className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-mono text-primary">#1024</span>
              <span className="font-mono text-xs">0x074c…80c3</span>
              <span className="font-mono text-xs text-muted-foreground">2026-10-08 22:57 UTC</span>
              <span className="tabular-nums">21.00 STRK · prices stay in Exo 2</span>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="panel" className="realm-panel space-y-4 p-4 sm:p-5">
        <SectionHeader
          id="panel"
          title="Offers"
          count={3}
          description="Funds stay in the bidder's wallet and are checked again before acceptance."
          action={<Button size="sm">Make collection offer</Button>}
        />
        <div className="space-y-2">
          <h3 className="market-group-title">Floor price</h3>
          <p className="text-sm text-muted-foreground">Cheapest live listing in STRK. Gaps mean nothing was listed.</p>
        </div>
      </section>
    </main>
  );
}

const meta = {
  title: "Foundations/Hierarchy",
  component: Hierarchy,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Hierarchy>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {
  play: async ({ canvas }) => {
    const sectionTitle = getComputedStyle(canvas.getByRole("heading", { name: "Type scale" }));
    await expect(sectionTitle.fontSize).toBe("18px");
    const tiles = canvas.getAllByText(/^(Floor|7d sales)$/);
    const [withHelp, withoutHelp] = tiles.map((label) => label.closest("dt")!.getBoundingClientRect().height);
    await expect(withHelp).toBe(withoutHelp);
    const chip = getComputedStyle(canvas.getByText("ERC-721"));
    await expect(chip.fontFamily).toContain(monaspaceXenon.style.fontFamily.split(",")[0].replace(/['"]/g, ""));
    await expect(chip.textTransform).toBe("uppercase");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
};
