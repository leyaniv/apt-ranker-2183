/**
 * Resolve the current i18n language to one of our supported locale keys.
 * i18n.language can return full BCP-47 tags like "en-US" or "he-IL";
 * we normalize to just "en" or "he".
 */
export function resolveLocale(lang: string): "en" | "he" {
  if (lang.startsWith("he")) return "he";
  return "en";
}
