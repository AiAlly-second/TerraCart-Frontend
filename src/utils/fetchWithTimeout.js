/**
 * Fetch with timeout and retry logic
 * Helps handle network issues, slow connections, and deployment scenarios
 */

/**
 * Fetch with timeout
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Response>}
 */
export const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(
        `Request timeout: The server did not respond within ${timeout}ms. Please check your connection and try again.`
      );
    }
    throw error;
  }
};

/**
 * Fetch with retry logic
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {object} retryOptions - Retry configuration
 * @param {number} retryOptions.maxRetries - Maximum number of retries (default: 3)
 * @param {number} retryOptions.retryDelay - Delay between retries in ms (default: 1000)
 * @param {number} retryOptions.timeout - Request timeout in ms (default: 30000)
 * @param {function} retryOptions.shouldRetry - Function to determine if should retry (default: retry on network errors)
 * @returns {Promise<Response>}
 */
export const fetchWithRetry = async (url, options = {}, retryOptions = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 30000,
    shouldRetry = (error, attempt) => {
      // Retry on network errors, timeouts, or 5xx errors
      if (
        error.message?.includes("timeout") ||
        error.message?.includes("Network error") ||
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("CORS")
      ) {
        return true;
      }
      // Don't retry on 4xx errors (except 429 - rate limit)
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        return false;
      }
      // Retry on 5xx errors
      if (error.status >= 500) {
        return true;
      }
      return attempt < maxRetries;
    },
  } = retryOptions;

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout);

      // If response is ok, return it
      if (response.ok || response.status === 423) {
        return response;
      }

      // For non-ok responses, check if we should retry
      const error = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
      error.status = response.status;
      error.response = response;

      if (!shouldRetry(error, attempt)) {
        return response; // Return the error response
      }

      lastResponse = response;
      lastError = error;

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // If we have a response, return it even if it's an error
  if (lastResponse) {
    return lastResponse;
  }

  // Otherwise throw the last error
  throw lastError || new Error("Request failed after all retries");
};

/**
 * Convenience function for GET requests with retry
 */
export const getWithRetry = async (url, options = {}, retryOptions = {}) => {
  return fetchWithRetry(url, { ...options, method: "GET" }, retryOptions);
};

/**
 * Convenience function for POST requests with retry
 */
export const postWithRetry = async (
  url,
  data,
  options = {},
  retryOptions = {}
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
    retryOptions
  );
};

















