import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";
import { fetchMenuPublicPayload } from "../services/menuPublicApi";

/**
 * Shared menu payload for Menu + Cart (deduped by cart scope).
 * @param {string} cartId - empty string loads unscoped public menu
 * @param {object} [options]
 */
export function useMenuPublicQuery(cartId, options = {}) {
  const cid = cartId != null ? String(cartId) : "";
  const enabled =
    typeof options.enabled === "boolean" ? options.enabled : true;

  return useQuery({
    queryKey: queryKeys.menu.public(cid || null),
    queryFn: () => fetchMenuPublicPayload(cid || undefined),
    enabled,
    staleTime: options.staleTime ?? 3 * 60 * 1000,
    gcTime: options.gcTime ?? 10 * 60 * 1000,
  });
}
