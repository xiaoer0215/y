declare const __APP_BRAND__: {
  id: string;
  productName: string;
  userAgentName: string;
  siteUrl: string;
  apiUrl: string;
  repository: string;
  updateManifestUrl: string;
};

export const BRAND = __APP_BRAND__;
export const SITE_HOST = new URL(BRAND.siteUrl).hostname;
export const APP_VERSION = import.meta.env.VITE_APP_VERSION as string;

export function isSiteHost(host: string): boolean {
  return host.replace(/^www\./, "") === SITE_HOST.replace(/^www\./, "");
}

export function brandText(text: string): string {
  return text
    .split("Uocode Client").join(BRAND.productName)
    .split("UOCODE CLIENT").join(BRAND.productName)
    .split("https://www.uocode.com").join(BRAND.siteUrl)
    .split("www.uocode.com").join(SITE_HOST);
}
