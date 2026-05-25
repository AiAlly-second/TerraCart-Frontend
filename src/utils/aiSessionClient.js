/**
 * AI session token issuance, storage, and proactive refresh for billable AI routes.
 */
const TOKEN_KEY = "terra_ai_session_token";
const EXPIRES_AT_KEY = "terra_ai_session_expires_at";
const BOUND_CART_KEY = "terra_ai_session_bound_cart_id";

let refreshTimerId = null;

export function clearAiSessionStorage() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_AT_KEY);
    sessionStorage.removeItem(BOUND_CART_KEY);
  } catch (_) {
    /* ignore */
  }
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
}

/**
 * Request a new AI session token for the cart and schedule refresh before expiry.
 * @param {string} cartId
 * @param {string} nodeApiBase - e.g. https://api.example.com (no trailing slash)
 * @returns {Promise<{ ok: boolean, expiresInMs?: number, status?: number }>}
 */
export async function ensureAiSessionForCart(cartId, nodeApiBase) {
  const cid = String(cartId || "").trim();
  const base = String(nodeApiBase || "").replace(/\/$/, "");

  if (!cid || !base) {
    clearAiSessionStorage();
    return { ok: false, reason: "missing_params" };
  }

  try {
    const bound = sessionStorage.getItem(BOUND_CART_KEY);
    if (bound && bound !== cid) {
      clearAiSessionStorage();
    }
  } catch (_) {
    /* ignore */
  }

  try {
    const res = await fetch(`${base}/api/ai-session/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId: cid }),
    });

    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    const data = await res.json().catch(() => ({}));
    const token = String(data.token || "").trim();
    const expiresInMs = Number(data.expiresInMs);
    const ttl =
      Number.isFinite(expiresInMs) && expiresInMs > 0 ? expiresInMs : 86400000;

    if (!token) {
      return { ok: false, reason: "no_token" };
    }

    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(BOUND_CART_KEY, cid);
      sessionStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + ttl));
    } catch (_) {
      return { ok: false, reason: "storage" };
    }

    scheduleAiSessionRefresh(cid, base, ttl);
    return { ok: true, expiresInMs: ttl };
  } catch (_e) {
    return { ok: false, reason: "network" };
  }
}

function scheduleAiSessionRefresh(cartId, nodeApiBase, expiresInMs) {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
  const safetyMs = Math.min(120000, Math.floor(expiresInMs * 0.08));
  const delay = Math.max(15000, expiresInMs - safetyMs);
  refreshTimerId = setTimeout(() => {
    refreshTimerId = null;
    ensureAiSessionForCart(cartId, nodeApiBase).catch(() => {});
  }, delay);
}
