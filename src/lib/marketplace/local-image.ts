import manifest from "./local-images.json";

type ImageEntry = (typeof manifest)[keyof typeof manifest];

/** Only bundled, reviewed artwork is transformed; arbitrary NFT URLs pass through. */
export function localImageProps(source: string) {
  const entry: ImageEntry | undefined = Object.hasOwn(manifest, source)
    ? manifest[source as keyof typeof manifest]
    : undefined;
  if (!entry) return { src: source };
  const fallback = entry.variants.find((variant) => variant.width >= 640) ?? entry.variants.at(-1)!;
  return {
    src: fallback.url,
    srcSet: entry.variants.map(({ url, width }) => `${url} ${width}w`).join(", "),
    width: entry.width,
    height: entry.height,
  };
}
