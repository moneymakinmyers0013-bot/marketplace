import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Preview } from "@storybook/nextjs-vite";
import { useEffect, useState, type PropsWithChildren } from "react";
import { exo2, monaspaceXenon, fontClassName, fontVariables } from "../src/lib/fonts";
import "../src/app/globals.css";
import { storybookTheme } from "./theme";
import { resetScenario } from "./scenario";

function Theme({ children, theme }: { theme: string } & PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return (
    <QueryClientProvider client={client}>
      {/* The next/font/local preview adapter emits unquoted filesystem URLs,
          which break in workspace paths containing spaces. Reuse the same
          families and files through quoted, public asset URLs instead. */}
      <style>{`
        @font-face { font-family: ${JSON.stringify(exo2.style.fontFamily.split(",")[0].replaceAll('"', '').replaceAll("'", ''))}; src: url("/brand/fonts/exo-2-variable.ttf") format("truetype"); font-weight: 400 700; font-display: swap; }
        @font-face { font-family: ${JSON.stringify(monaspaceXenon.style.fontFamily.split(",")[0].replaceAll('"', '').replaceAll("'", ''))}; src: url("/brand/fonts/monaspace-xenon-400.woff2") format("woff2"); font-weight: 400; font-display: swap; }
        @font-face { font-family: ${JSON.stringify(monaspaceXenon.style.fontFamily.split(",")[0].replaceAll('"', '').replaceAll("'", ''))}; src: url("/brand/fonts/monaspace-xenon-600.woff2") format("woff2"); font-weight: 600; font-display: swap; }
      `}</style>
      <div
        style={fontVariables}
        className={`${fontClassName} font-sans antialiased text-foreground`}
      >
        {children}
      </div>
    </QueryClientProvider>
  );
}
const preview: Preview = {
  tags: ["autodocs"],
  initialGlobals: { theme: "dark" },
  globalTypes: {
    theme: {
      description: "Existing app theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Dark · marketplace default" },
          { value: "light", title: "Light · contrast review" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "padded",
    docs: { theme: storybookTheme, story: { inline: false, height: 420 } },
    nextjs: { appDirectory: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: "error" },
    options: {
      storySort: { order: ["Foundations", "UI", "Wallet", "Trading"] },
    },
    viewport: {
      options: {
        mobile: {
          name: "Mobile",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" }, type: "tablet" },
        narrow: { name: "Small mobile", styles: { width: "320px", height: "740px" }, type: "mobile" },
        desktop: {
          name: "Desktop",
          styles: { width: "1440px", height: "900px" },
          type: "desktop",
        },
      },
    },
  },
  beforeEach() {
    resetScenario();
  },
  decorators: [
    (Story, context) => (
      <Theme key={context.id} theme={String(context.globals.theme)}>
        <Story />
      </Theme>
    ),
  ],
};
export default preview;
