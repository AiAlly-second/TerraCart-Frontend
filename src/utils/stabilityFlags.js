const toBool = (value, fallback = false) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const env = import.meta.env || {};

export const STABILITY_FLAGS = {
  ENABLE_NO_RELOAD_RECOVERY: toBool(env.VITE_ENABLE_NO_RELOAD_RECOVERY, true),
  ENABLE_SOCKET_ROOM_JOIN_DEDUPE: toBool(
    env.VITE_ENABLE_SOCKET_ROOM_JOIN_DEDUPE,
    true,
  ),
  ENABLE_EVENT_ACK_GUARD: toBool(env.VITE_ENABLE_EVENT_ACK_GUARD, true),
  ENABLE_EVENT_ORIGIN_METADATA: toBool(
    env.VITE_ENABLE_EVENT_ORIGIN_METADATA,
    true,
  ),
  ENABLE_SOCKET_DEDUPE: toBool(env.VITE_ENABLE_SOCKET_DEDUPE, true),
  ENABLE_REQUEST_DEDUPE: toBool(env.VITE_ENABLE_REQUEST_DEDUPE, true),
  ENABLE_POLLING_MUTEX: toBool(env.VITE_ENABLE_POLLING_MUTEX, true),
  ENABLE_SINGLETON_SOCKET_CUSTOMER: toBool(
    env.VITE_ENABLE_SINGLETON_SOCKET_CUSTOMER,
    true,
  ),
  ENABLE_CANONICAL_EVENTS: toBool(env.VITE_ENABLE_CANONICAL_EVENTS, true),
  ENABLE_LEGACY_EVENT_COMPAT: toBool(
    env.VITE_ENABLE_LEGACY_EVENT_COMPAT,
    true,
  ),
  ENABLE_ROOM_ONLY_EMITS: toBool(env.VITE_ENABLE_ROOM_ONLY_EMITS, false),
  ENABLE_SOCKET_BACKOFF_JITTER: toBool(
    env.VITE_ENABLE_SOCKET_BACKOFF_JITTER,
    true,
  ),
  ENABLE_VISIBILITY_POLLING_PAUSE: toBool(
    env.VITE_ENABLE_VISIBILITY_POLLING_PAUSE,
    true,
  ),
  ENABLE_SINGLE_PRINT_LEADER: toBool(
    env.VITE_ENABLE_SINGLE_PRINT_LEADER,
    false,
  ),
  ENABLE_PRINT_LEASE_HEARTBEAT: toBool(
    env.VITE_ENABLE_PRINT_LEASE_HEARTBEAT,
    false,
  ),
  ENABLE_PRINT_FAILSAFE_POLLING: toBool(
    env.VITE_ENABLE_PRINT_FAILSAFE_POLLING,
    true,
  ),
  ENABLE_SOCKET_BURST_PROTECTION: toBool(
    env.VITE_ENABLE_SOCKET_BURST_PROTECTION,
    false,
  ),
  ENABLE_STABILITY_OBSERVABILITY: toBool(
    env.VITE_ENABLE_STABILITY_OBSERVABILITY,
    true,
  ),
};

export const STABILITY_THRESHOLDS = {
  MAX_LISTENER_ATTACHES_PER_EVENT: Number.parseInt(
    env.VITE_MAX_LISTENER_ATTACHES_PER_EVENT || "8",
    10,
  ),
  MAX_API_CALLS_PER_MINUTE_PER_KEY: Number.parseInt(
    env.VITE_MAX_API_CALLS_PER_MINUTE_PER_KEY || "60",
    10,
  ),
  MAX_ROOM_JOINS_PER_MINUTE: Number.parseInt(
    env.VITE_MAX_ROOM_JOINS_PER_MINUTE || "40",
    10,
  ),
  MAX_RECONNECTS_PER_MINUTE: Number.parseInt(
    env.VITE_MAX_RECONNECTS_PER_MINUTE || "20",
    10,
  ),
};
