import languages from "../locales/languages.json";

export { languages };
export type Locale = (typeof languages)[number]["code"];
export function isLocale(value: unknown): value is Locale {
  return languages.some((language) => language.code === value);
}
