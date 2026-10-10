import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/marketplace/section-header";
import { StatTile } from "@/components/marketplace/stat-tile";
import { TraitGrid } from "@/features/token/trait-grid";

function Surfaces() {
  return (
    <main className="market-page mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <h1 className="market-page-title">Edges and surfaces</h1>
        <p className="text-sm text-muted-foreground">Quiet panels, clear controls, elevation for floating layers.</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Panel hierarchy">
        <Card className="gap-4 p-4 sm:p-5">
          <SectionHeader title="Market summary" />
          <dl className="grid grid-cols-2 gap-2">
            <StatTile label="Price" help="The listed price includes marketplace fees.">18 STRK</StatTile>
            <StatTile label="Last sale">16 STRK</StatTile>
          </dl>
          <Badge variant="outline">ERC-721</Badge>
        </Card>
        <section className="realm-panel space-y-4 p-4 sm:p-5" aria-label="Control states">
          <SectionHeader title="Make an offer" />
          <div className="space-y-2">
            <label className="market-label" htmlFor="surface-amount">Amount in STRK</label>
            <Input id="surface-amount" placeholder="0.00" inputMode="decimal" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild><Button>Review offer</Button></DialogTrigger>
              <DialogContent>
                <DialogTitle className="market-section-title">Review offer</DialogTitle>
                <DialogDescription>This is a surface preview. No wallet request is made.</DialogDescription>
                <dl><StatTile label="Offer amount">18 STRK</StatTile></dl>
                <Button disabled>Connect wallet to continue</Button>
              </DialogContent>
            </Dialog>
            <Button variant="outline">Cancel</Button>
            <Button disabled>Unavailable</Button>
          </div>
        </section>
      </section>
      <section className="realm-panel space-y-4 p-4 sm:p-5" aria-label="Trait surfaces">
        <SectionHeader title="Traits" count={4} />
        <TraitGrid collectionAddress="0x123" attributes={[
          { name: "Resource", value: "Wood" },
          { name: "Resource", value: "Stone" },
          { name: "Region", value: "The northern highlands" },
          { name: "Cities", value: "12" },
        ]} />
      </section>
      <section className="realm-panel p-4 sm:p-5" aria-label="List dividers">
        <SectionHeader title="Activity" />
        <ul className="mt-3 divide-y">
          {["Sale", "Listing", "Offer"].map((event) => (
            <li key={event} className="flex items-center justify-between gap-4 py-3 text-sm">
              <Badge variant="outline">{event}</Badge><span className="tabular-nums">18 STRK</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const meta = {
  title: "Foundations/Surfaces",
  component: Surfaces,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Surfaces>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
export const KeyboardAndDialog: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Amount in STRK" });
    await userEvent.click(input);
    await userEvent.type(input, "18");
    await userEvent.tab();
    const trigger = canvas.getByRole("button", { name: "Review offer" });
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("dialog", { name: "Review offer" })).toBeVisible();
    await expect(body.getByRole("button", { name: "Connect wallet to continue" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(input).toHaveValue("18");
  },
};
