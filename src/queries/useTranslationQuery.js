import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";
import { postWithRetry } from "../utils/fetchWithTimeout";
import { getCustomerApiOrigin } from "../utils/customerApiOrigin";

const nodeApi = getCustomerApiOrigin();

const MENU_PAGE_TRANSLATION_ENDPOINT = `${nodeApi}/api/translations/menu-page`;

async function fetchMenuPageTranslations({ targetLang, texts }) {
  const res = await postWithRetry(
    MENU_PAGE_TRANSLATION_ENDPOINT,
    { targetLang, texts },
    {},
    { maxRetries: 1, timeout: 30000 },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || "Translation failed");
  }
  return payload?.translations || {};
}

/**
 * @param {string} targetLang
 * @param {string[]} texts
 * @param {string} fingerprint - stable hash of menu text set for cache keying
 */
export function useMenuPageTranslationQuery(targetLang, texts, fingerprint, options = {}) {
  const lang = String(targetLang || "en");
  const fp = String(fingerprint || "none");
  const list = Array.isArray(texts) ? texts : [];

  return useQuery({
    queryKey: queryKeys.translations.menuPage(lang, fp),
    queryFn: () =>
      fetchMenuPageTranslations({
        targetLang: lang,
        texts: list,
      }),
    enabled:
      typeof options.enabled === "boolean"
        ? options.enabled
        : list.length > 0 && lang !== "en",
    staleTime: options.staleTime ?? 30 * 60 * 1000,
  });
}
