// Renders the PNG icons and the link-preview image from public/icons/icon.svg.
// Run after changing the logo: npm run icons
import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const logo = await readFile(join(dir, "icon.svg"), "utf8");
const inner = logo.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true } }).render().asPng();

// Plain icons.
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await writeFile(join(dir, name), render(logo, size));
}

// Maskable icon: phones crop to a circle, so keep the logo inside the middle 80%.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f5f5c"/>
  <g transform="translate(51 51) scale(0.8)">${inner}</g></svg>`;
await writeFile(join(dir, "icon-512-maskable.png"), render(maskable, 512));

// Link preview (1200 x 630) for Facebook, Messenger, Viber, X.
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f6f4ef"/>
  <rect x="0" y="560" width="1200" height="70" fill="#0f5f5c"/>
  <g transform="translate(90 135) scale(0.7)">${inner}</g>
  <text x="520" y="270" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="700" fill="#1d2321">Pagmamahal Maps</text>
  <text x="522" y="345" font-family="Segoe UI, Arial, sans-serif" font-size="36" fill="#5d6662">Pag-IBIG acquired properties on a map,</text>
  <text x="522" y="395" font-family="Segoe UI, Arial, sans-serif" font-size="36" fill="#5d6662">with filters and a loan calculator.</text>
  <text x="522" y="465" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="600" fill="#d9622b">Free · Not affiliated with Pag-IBIG Fund</text>
  <text x="600" y="606" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#ffffff">pagmamahal-maps.pages.dev</text>
</svg>`;
await writeFile(join(dir, "og-image.png"), render(og, 1200));
console.log("Icons written to", dir);
