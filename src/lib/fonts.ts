import localFont from "next/font/local";
export const exo2 = localFont({
  src: "../../public/brand/fonts/exo-2-variable.ttf",
  variable: "--font-exo-2",
  weight: "400 700",
  display: "swap",
});
// Monaspace Xenon carries on-chain data and chips (see the type hierarchy in
// docs/STORYBOOK.md). Official static cuts, unmodified; only the rendered weight
// is downloaded, so it is not preloaded ahead of page content.
export const monaspaceXenon = localFont({
  src: [
    { path: "../../public/brand/fonts/monaspace-xenon-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/brand/fonts/monaspace-xenon-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-monaspace-xenon",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
});
export const fontClassName = `${exo2.variable} ${monaspaceXenon.variable}`;

// Bind semantic tokens where the font loader classes live, rather than resolving them
// at :root before next/font's body-level variables exist.
const cssFamily = (family: string) =>
  family.includes(",") || /^['"]/.test(family)
    ? family
    : JSON.stringify(family);
export const fontVariables = {
  "--font-sans": cssFamily(exo2.style.fontFamily),
  "--font-ui": cssFamily(exo2.style.fontFamily),
  "--font-mono": cssFamily(monaspaceXenon.style.fontFamily),
} as import("react").CSSProperties;
