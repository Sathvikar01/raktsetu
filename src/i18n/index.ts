/**
 * Typed i18n. All UI strings live in dictionaries under src/i18n/messages/*.
 * English is the reference locale; structure supports adding Indian languages
 * without redesign (spec §42). Components must never hard-code user-facing strings.
 */
import en from "./messages/en";

export type Dictionary = typeof en;

export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const dictionaries: Record<Locale, Dictionary> = { en };

/** Simple dot-path lookup with param interpolation: t("donor.dashboard.greeting", {name}) */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[locale] ?? dictionaries.en;
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key; // missing key surfaces visibly in dev; never throws in prod paths
    }
  }
  if (typeof node !== "string") return key;
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? `{${p}}`));
}

export function getDictionary(locale?: Locale): Dictionary {
  return dictionaries[locale ?? DEFAULT_LOCALE];
}
