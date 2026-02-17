const SUPPORTED_LANGUAGES = ["en", "hi", "mr", "gu"];
const DEFAULT_LANGUAGE = "en";

export const getCurrentLanguage = () => {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = localStorage.getItem("language") || DEFAULT_LANGUAGE;
  return SUPPORTED_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
};

export const setCurrentLanguage = (languageCode) => {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const normalized = SUPPORTED_LANGUAGES.includes(languageCode)
    ? languageCode
    : DEFAULT_LANGUAGE;
  localStorage.setItem("language", normalized);
  window.dispatchEvent(
    new CustomEvent("language-change", { detail: { language: normalized } }),
  );
  return normalized;
};

export const subscribeToLanguageChanges = (onChange) => {
  if (typeof window === "undefined") return () => {};
  if (typeof onChange !== "function") return () => {};

  const handleLanguageEvent = () => {
    onChange(getCurrentLanguage());
  };

  const handleStorage = (event) => {
    if (event.key === "language" || event.key === null) {
      handleLanguageEvent();
    }
  };

  window.addEventListener("language-change", handleLanguageEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("language-change", handleLanguageEvent);
    window.removeEventListener("storage", handleStorage);
  };
};

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
];
