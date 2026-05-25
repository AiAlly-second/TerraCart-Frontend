import { getCustomerApiOrigin } from "../utils/customerApiOrigin";

const nodeApi = getCustomerApiOrigin();

/**
 * @param {{ cartId?: string, tableId?: string }} params
 */
export async function fetchAddonsPublic({ cartId, tableId }) {
  const params = new URLSearchParams();
  const cid = cartId && String(cartId).trim();
  const tid = tableId && String(tableId).trim();
  if (cid) params.set("cartId", cid);
  if (!cid && tid) params.set("tableId", tid);
  const url = `${nodeApi}/api/addons/public?${params.toString()}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message || `Addons ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}
