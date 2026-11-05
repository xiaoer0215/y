import fs from "node:fs";
import path from "node:path";

const file = path.resolve("brands/versions.json");
const document = JSON.parse(fs.readFileSync(file, "utf8"));
if (!document || !Array.isArray(document.versions) || document.versions.length !== 3) {
  throw new Error("brands/versions.json must contain exactly three versions");
}

const ids = new Set();
for (const brand of document.versions) {
  if (!/^[a-z0-9-]+$/.test(brand.id) || ids.has(brand.id)) {
    throw new Error(`Invalid or duplicate brand id: ${brand.id}`);
  }
  ids.add(brand.id);
  const fields = ["productName", "userAgentName", "siteUrl", "apiUrl", "updateManifestUrl"];
  if (brand.enabled && fields.some((field) => !String(brand[field] ?? "").trim())) {
    throw new Error(`Enabled brand is incomplete: ${brand.id}`);
  }
  if (!brand.enabled && fields.some((field) => String(brand[field] ?? "").trim())) {
    throw new Error(`Disabled brand must remain empty: ${brand.id}`);
  }
}
if (!ids.has(document.default)) {
  throw new Error(`Default brand is not registered: ${document.default}`);
}
console.log(`PASS: ${document.versions.length} brand slots; enabled=${document.versions.filter((brand) => brand.enabled).map((brand) => brand.id).join(",")}`);
