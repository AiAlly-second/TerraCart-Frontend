import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";
import { fetchAddonsPublic } from "../services/addonsPublicApi";

/**
 * @param {string} cartId
 * @param {string} tableId
 * @param {object} [options]
 */
export function useAddonsPublicQuery(cartId, tableId, options = {}) {
  const cid = cartId != null ? String(cartId) : "";
  const tid = tableId != null ? String(tableId) : "";
  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : Boolean(cid || tid);

  return useQuery({
    queryKey: queryKeys.addons.public(cid || null, tid || null),
    queryFn: () => fetchAddonsPublic({ cartId: cid || undefined, tableId: tid || undefined }),
    enabled,
    staleTime: options.staleTime ?? 3 * 60 * 1000,
  });
}
