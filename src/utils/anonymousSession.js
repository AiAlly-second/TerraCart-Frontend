const ANONYMOUS_SESSION_KEY = "terra_anonymousSessionId";

const normalizeAnonymousSessionId = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 160) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) return "";
  return normalized;
};

const generateAnonymousSessionId = () => {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `anon_${randomPart}`;
};

export const getAnonymousSessionId = () => {
  try {
    return normalizeAnonymousSessionId(
      localStorage.getItem(ANONYMOUS_SESSION_KEY)
    );
  } catch {
    return "";
  }
};

export const ensureAnonymousSessionId = () => {
  const existing = getAnonymousSessionId();
  if (existing) return existing;

  const nextId = normalizeAnonymousSessionId(generateAnonymousSessionId());
  if (!nextId) return "";

  try {
    localStorage.setItem(ANONYMOUS_SESSION_KEY, nextId);
  } catch {
    // Ignore storage errors (private mode / restricted environments).
  }
  return nextId;
};

export const buildIdentityHeaders = (headersInit) => {
  const headers = new Headers(headersInit || {});
  const anonymousSessionId = ensureAnonymousSessionId();
  if (anonymousSessionId && !headers.has("x-anonymous-session-id")) {
    headers.set("x-anonymous-session-id", anonymousSessionId);
  }

  try {
    const sessionToken =
      localStorage.getItem("terra_takeaway_sessionToken") ||
      localStorage.getItem("terra_sessionToken") ||
      "";
    const normalizedSessionToken = String(sessionToken || "").trim();
    if (normalizedSessionToken && !headers.has("x-session-token")) {
      headers.set("x-session-token", normalizedSessionToken);
    }
  } catch {
    // Ignore storage errors.
  }

  return headers;
};

export const buildSocketIdentityPayload = () => {
  const anonymousSessionId = ensureAnonymousSessionId();
  return anonymousSessionId ? { anonymousSessionId } : {};
};
