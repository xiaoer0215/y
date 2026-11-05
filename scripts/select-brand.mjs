import fs from "node:fs";
import path from "node:path";

const brandId = process.argv[2] || process.env.AI_HELPER_BRAND_ID || "uocode";
const root = process.cwd();
const brands = JSON.parse(
  fs.readFileSync(path.join(root, "brands/versions.json"), "utf8"),
);
const brand = brands.versions.find(
  (entry) => entry.id === brandId && entry.enabled === true,
);
if (!brand) throw new Error(`Unknown enabled brand: ${brandId}`);

const updateJson = (file) => {
  const configPath = path.join(root, file);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.productName = brand.productName;
  config.identifier =
    brand.id === "uocode"
      ? "com.uocode.helper"
      : `com.xiaoer0215.${brand.id.replace(/[^a-z0-9]+/g, ".")}`;
  for (const window of config.app?.windows || []) {
    if (window.label === "main") window.title = brand.productName;
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

updateJson("src-tauri/tauri.conf.json");
updateJson("src-tauri/tauri.windows.conf.json");
console.log(`Selected brand ${brand.id}: ${brand.productName}`);
