import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import he from "./he.json";

function applyDir(lang: string) {
  const dir = lang === "he" ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}

/** Strip region from locale codes (e.g. "en-US" → "en") */
function baseLang(lang: string): string {
  return (lang || "").toLowerCase().split("-")[0];
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
    },
    supportedLngs: ["en", "he"],
    // Normalize detected locales like "en-US" → "en" so the stored value
    // always matches one of our supported language codes.
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    fallbackLng: "he",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "eshel-language",
      caches: ["localStorage"],
    },
  });

// If a previously cached value (e.g. "en-US") survived init, force it to the
// base code and persist the normalized value so i18n.language matches the
// Settings dropdown options.
const normalized = baseLang(i18n.language);
if (normalized && normalized !== i18n.language) {
  i18n.changeLanguage(normalized);
}

// Set dir immediately after init and on every language change
applyDir(i18n.language);
i18n.on("languageChanged", applyDir);

export default i18n;
