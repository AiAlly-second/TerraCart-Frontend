/**
 * Fetch with timeout and retry logic
 * Adds in-flight dedupe + throttled retries to prevent API amplification.
 */

import { buildIdentityHeaders } from "./anonymousSession";
import { STABILITY_FLAGS, STABILITY_THRESHOLDS } from "./stabilityFlags";

const inflightRequests = new Map();
const activeControllers = new Map();
const lastRequestTimestamps = new Map();
const requestRateWindows = new Map();
const DEFAULT_MIN_REQUEST_GAP_MS = 500;

const trimWindow = (timestamps, windowMs) => {
  const cutoff = Date.now() - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
};

const trackRequestRate = (requestKey) => {
  if (!STABILITY_FLAGS.ENABLE_STABILITY_OBSERVABILITY) return;

  if (!requestRateWindows.has(requestKey)) {
    requestRateWindows.set(requestKey, []);
  }

  const timestamps = requestRateWindows.get(requestKey);
  timestamps.push(Date.now());
  trimWindow(timestamps, 60_000);

  if (
    timestamps.length >
    STABILITY_THRESHOLDS.MAX_API_CALLS_PER_MINUTE_PER_KEY
  ) {
    console.warn("[Stability] repeated API storm detected", {
      requestKey,
      requestsPerMinute: timestamps.length,
      threshold: STABILITY_THRESHOLDS.MAX_API_CALLS_PER_MINUTE_PER_KEY,
    });
  }
};

const stableStringify = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
};

const buildRequestKey = (url, options = {}) => {
  const method = String(options.method || "GET").toUpperCase();
  const headers = stableStringify(options.headers || {});
  const body = stableStringify(options.body || "");
  return `${method}|${url}|${headers}|${body}`;
};

const throttleByKey = async (requestKey, minGapMs = DEFAULT_MIN_REQUEST_GAP_MS) => {
  const now = Date.now();
  const lastTs = lastRequestTimestamps.get(requestKey) || 0;
  const elapsed = now - lastTs;
  if (elapsed >= minGapMs) {
    lastRequestTimestamps.set(requestKey, now);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, minGapMs - elapsed));
  lastRequestTimestamps.set(requestKey, Date.now());
};

/**
 * Fetch with timeout
 */
export const fetchWithTimeout = async (
  url,
  options = {},
  timeout = 30000,
  requestKey = null,
) => {
  const dedupeKey = requestKey || buildRequestKey(url, options);
  trackRequestRate(dedupeKey);

  if (STABILITY_FLAGS.ENABLE_REQUEST_DEDUPE) {
    await throttleByKey(dedupeKey);
  }

  const controller = new AbortController();

  if (STABILITY_FLAGS.ENABLE_REQUEST_DEDUPE && activeControllers.has(dedupeKey)) {
    // Cancel stale request for same key and replace with latest transport.
    activeControllers.get(dedupeKey)?.abort?.();
  }
  activeControllers.set(dedupeKey, controller);

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const mergedHeaders = buildIdentityHeaders(options.headers);
    const response = await fetch(url, {
      ...options,
      headers: mergedHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(
        `Request timeout: The server did not respond within ${timeout}ms. Please check your connection and try again.`,
      );
    }
    throw error;
  } finally {
    if (activeControllers.get(dedupeKey) === controller) {
      activeControllers.delete(dedupeKey);
    }
  }
};

/**
 * Fetch with retry logic
 */
export const fetchWithRetry = async (url, options = {}, retryOptions = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 30000,
    dedupeKey = null,
    shouldRetry = (error, attempt) => {
      if (
        error.message?.includes("timeout") ||
        error.message?.includes("Network error") ||
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("CORS")
      ) {
        return true;
      }
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        return false;
      }
      if (error.status >= 500) {
        return true;
      }
      return attempt < maxRetries;
    },
  } = retryOptions;

  const requestKey = dedupeKey || buildRequestKey(url, options);

  if (
    STABILITY_FLAGS.ENABLE_REQUEST_DEDUPE &&
    inflightRequests.has(requestKey)
  ) {
    return inflightRequests.get(requestKey);
  }

  const requestPromise = (async () => {
    let lastError;
    let lastResponse;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, options, timeout, requestKey);

        if (response.ok || response.status === 423) {
          return response;
        }

        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.response = response;

        if (!shouldRetry(error, attempt)) {
          return response;
        }

        lastResponse = response;
        lastError = error;

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        lastError = error;

        if (!shouldRetry(error, attempt)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (lastResponse) {
      return lastResponse;
    }

    throw lastError || new Error("Request failed after all retries");
  })();

  if (STABILITY_FLAGS.ENABLE_REQUEST_DEDUPE) {
    inflightRequests.set(requestKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (STABILITY_FLAGS.ENABLE_REQUEST_DEDUPE) {
      inflightRequests.delete(requestKey);
    }
  }
};

export const getWithRetry = async (url, options = {}, retryOptions = {}) => {
  return fetchWithRetry(url, { ...options, method: "GET" }, retryOptions);
};

export const postWithRetry = async (
  url,
  data,
  options = {},
  retryOptions = {},
) => {
  return fetchWithRetry(
    url,
    {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(data),
    },
    retryOptions,
  );
};
