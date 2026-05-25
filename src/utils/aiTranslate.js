/**
 * Single-string translation via Node batch endpoint (same pipeline as menu-page).
 * Replaces legacy Flask calls for consistent billing, rate limits, and identity headers.
 */
import { postWithRetry } from "./fetchWithTimeout";
import { getCustomerApiOrigin } from "./customerApiOrigin";

const nodeApi = getCustomerApiOrigin();

const MENU_PAGE_TRANSLATION_ENDPOINT = `${nodeApi}/api/translations/menu-page`;

const STORAGE_KEY = "translation_service_unavailable";
const STORAGE_TIMESTAMP_KEY = "translation_service_check_timestamp";
const SERVICE_CHECK_INTERVAL = 60000;

const shouldSkipTranslation = () => {
  try {
    const unavailable = sessionStorage.getItem(STORAGE_KEY);
    const timestamp = sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (unavailable === "true" && timestamp) {
      const now = Date.now();
      const lastCheck = parseInt(timestamp, 10);
      if (now - lastCheck < SERVICE_CHECK_INTERVAL) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
};

const markServiceUnavailable = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, "true");
    sessionStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    /* ignore */
  }
};

const markServiceAvailable = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
  } catch {
    /* ignore */
  }
};

const normalizeTargetLang = (targetLang) => {
  const raw = String(targetLang || "en").trim().toLowerCase();
  if (["hi", "mr", "gu", "en"].includes(raw)) return raw;
  return "en";
};

/**
 * @param {string} text
 * @param {string} targetLang - language code or legacy "item" / "category" (mapped to active UI lang)
 */
export const translateText = async (text, targetLang) => {
  if (shouldSkipTranslation()) {
    return text;
  }

  const source = String(text || "").trim();
  if (!source) return source;

  let lang = normalizeTargetLang(targetLang);
  if (targetLang === "item" || targetLang === "category") {
    try {
      const stored = localStorage.getItem("language") || "en";
      lang = normalizeTargetLang(stored);
    } catch {
      lang = "en";
    }
  }

  if (lang === "en") return source;

  try {
    const res = await postWithRetry(
      MENU_PAGE_TRANSLATION_ENDPOINT,
      {
        targetLang: lang,
        texts: [source],
      },
      {},
      {
        maxRetries: 1,
        timeout: 15000,
      },
    );

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      markServiceUnavailable();
      return source;
    }

    const translations = payload?.translations || {};
    const out = translations[source];
    if (typeof out === "string" && out.trim()) {
      markServiceAvailable();
      return out.trim();
    }

    markServiceUnavailable();
    return source;
  } catch {
    markServiceUnavailable();
    return source;
  }
};
