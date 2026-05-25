/**
 * Stable identity string for menu bootstrap / dedupe guards (preserves query key semantics).
 */
export function getMenuBootstrapIdentity(cartIdForApi, serviceTypeNormalized) {
  const cid = cartIdForApi != null ? String(cartIdForApi).trim() : "";
  const st = serviceTypeNormalized != null ? String(serviceTypeNormalized).trim() : "";
  return `${cid || "none"}::${st || "DINE_IN"}`;
}
