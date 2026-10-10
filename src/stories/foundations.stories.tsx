import { expect } from "storybook/test";
import { exo2, monaspaceXenon } from "@/lib/fonts";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
function Foundations() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <header>
        <Badge variant="outline">Current UI inventory</Badge>
        <h1 className="realm-title mt-4 text-4xl">Realms Marketplace</h1>
        <p className="mt-2 text-muted-foreground">
          The existing visual language, ready for brand review.
        </p>
      </header>
      <section aria-label="Color roles" className="grid gap-3 sm:grid-cols-3">
        {[
          ["Background", "--background"],
          ["Surface", "--card"],
          ["Primary · brass", "--primary"],
          ["Muted surface", "--muted"],
          ["Accent", "--accent"],
          ["Destructive", "--destructive"],
        ].map(([name, token]) => (
          <Card key={token}>
            <div
              className="h-20 rounded-t-lg border-b"
              style={{ background: `var(${token})` }}
            />
            <CardContent className="p-4">
              <p className="font-medium">{name}</p>
              <code className="text-xs text-muted-foreground">{token}</code>
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="realm-title text-3xl">IM Fell English SC · titles</p>
          <p className="font-sans text-base">
            Exo 2 · interface text, labels and descriptions.
          </p>
          <p className="font-mono text-sm">
            Monaspace Xenon · 0x0123…abcd · #1024 · 2026-10-08 22:57
          </p>
          <p className="text-sm text-muted-foreground">
            Spacing, border radius and semantic colors come directly from
            globals.css.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
const meta = {
  title: "Foundations/Theme",
  component: Foundations,
  parameters: { layout: "fullscreen" },
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(
        canvas.getByText("Exo 2 · interface text, labels and descriptions."),
      ).fontFamily,
    ).toContain(exo2.style.fontFamily.split(",")[0].replace(/['"]/g, ""));
    await expect(
      getComputedStyle(
        canvas.getByText("Monaspace Xenon · 0x0123…abcd · #1024 · 2026-10-08 22:57"),
      ).fontFamily,
    ).toContain(monaspaceXenon.style.fontFamily.split(",")[0].replace(/['"]/g, ""));
    for (const family of [exo2.style.fontFamily, monaspaceXenon.style.fontFamily]) {
      const loaded = await document.fonts.load(`16px ${family}`);
      await expect(loaded.length).toBeGreaterThan(0);
    }
    await expect(
      getComputedStyle(
        canvas.getByRole("heading", { name: "Realms Marketplace" }),
      ).fontFamily,
    ).toContain("IM Fell English SC");
  },
} satisfies Meta<typeof Foundations>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentTheme: Story = {};
export const LightReview: Story = { globals: { theme: "light" } };
