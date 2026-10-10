// Rebuild reviewed static derivatives with the pinned development-only sharp tool.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sources = [
  "banners/adventurers.png", "banners/beasts.jpg", "banners/cosmetics.jpg",
  "banners/golden-token.png", "banners/loot-chests.png", "banners/realms.png",
  "collection-images/cosmetics.jpg",
];
const manifest = {};
for (const source of sources) {
  const input = path.join("public", source);
  const { width, height } = await sharp(input).metadata();
  const stem = source.replace(/\.[^.]+$/, "");
  const variants = [];
  for (const size of [64, 256, 640, 1280, 1920].filter((size) => size <= width)) {
    const url = `/optimized/${stem}-${size}.webp`;
    await mkdir(path.dirname(`public${url}`), { recursive: true });
    const result = await sharp(input).resize({ width: size }).webp({ quality: 82, effort: 6 }).toFile(`public${url}`);
    variants.push({ width: result.width, url });
  }
  manifest[`/${source}`] = { width, height, variants };
}
await writeFile("src/lib/marketplace/local-images.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built responsive artwork for ${sources.length} local images.`);
