import { getCustomerApiOrigin } from "../utils/customerApiOrigin";

const nodeApi = getCustomerApiOrigin();

/**
 * Raw categories array from GET /api/menu/public
 * @param {string} [cartId]
 */
export async function fetchMenuPublicPayload(cartId) {
  const cid = cartId && String(cartId).trim();
  const endpoint = cid
    ? `${nodeApi}/api/menu/public?cartId=${encodeURIComponent(cid)}`
    : `${nodeApi}/api/menu/public`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Menu fetch failed with status ${res.status}`);
  }
  return res.json();
}
