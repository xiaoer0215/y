import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync("brands/versions.json", "utf8"));
const repository = process.env.GITHUB_REPOSITORY?.split("/").pop();
const brandId = process.env.AI_HELPER_BRAND_ID ||
  ({ u: "uocode", n: "nez-api", y: "yusr" }[repository || ""] || catalog.default);
const brand = catalog.versions.find((item: { id: string; enabled: boolean }) => item.id === brandId && item.enabled);
if (!brand) throw new Error(`Unknown brand: ${brandId}`);
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;

export default defineConfig({
  define: {
    __APP_BRAND__: JSON.stringify(brand),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
  },
  root: "src",
  publicDir: path.resolve(__dirname, "public"),
  plugins: [react(), {
    name: "brand-html-title",
    transformIndexHtml(html) {
      const title = brand.productName.replace(/[&<>\"]/g, (value: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[value]!));
      return html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    },
  }],
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
});
