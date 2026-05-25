import { useEffect } from "react";
import { ensureAiSessionForCart } from "../utils/aiSessionClient";
import { getCustomerApiOrigin } from "../utils/customerApiOrigin";

const nodeApi = getCustomerApiOrigin();

/**
 * Proactively ensures an AI session token exists when `cartId` is known.
 * Safe to call alongside Menu/Cart bootstrap (idempotent refresh via aiSessionClient).
 */
export function useAiSessionToken(cartId) {
  useEffect(() => {
    const cid = String(cartId || "").trim();
    if (!cid) return;
    ensureAiSessionForCart(cid, nodeApi).catch(() => {});
  }, [cartId]);
}
