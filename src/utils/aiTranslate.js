import axios from "axios";

const flaskApi = (
  import.meta.env.VITE_FLASK_API_URL || "http://localhost:5050"
).replace(/\/$/, "");

// Track if translation service is unavailable to skip future attempts
// Use sessionStorage to persist across page reloads during the same session
const STORAGE_KEY = "translation_service_unavailable";
const STORAGE_TIMESTAMP_KEY = "translation_service_check_timestamp";
const SERVICE_CHECK_INTERVAL = 60000; // Check again after 60 seconds

// Helper to check if service should be skipped
const shouldSkipTranslation = () => {
  try {
    const unavailable = sessionStorage.getItem(STORAGE_KEY);
    const timestamp = sessionStorage.getItem(STORAGE_TIMESTAMP_KEY);

    if (unavailable === "true" && timestamp) {
      const now = Date.now();
      const lastCheck = parseInt(timestamp, 10);
      // If checked recently, skip translation
      if (now - lastCheck < SERVICE_CHECK_INTERVAL) {
        return true;
      }
    }
  } catch {
    // If sessionStorage is not available, continue with translation attempt
  }
  return false;
};

// Helper to mark service as unavailable
const markServiceUnavailable = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, "true");
    sessionStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // If sessionStorage is not available, continue silently
  }
};

// Helper to mark service as available
const markServiceAvailable = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_TIMESTAMP_KEY);
  } catch {
    // If sessionStorage is not available, continue silently
  }
};

export const translateText = async (text, targetLang) => {
  // CRITICAL: Check if service is unavailable BEFORE making any request
  // This prevents axios from even attempting the request, avoiding console errors
  if (shouldSkipTranslation()) {
    return text; // Return original text immediately without making request
  }

  try {
    const res = await axios.post(
      `${flaskApi}/api/translate`,
      {
        text,
        targetLang,
      },
      {
        // Suppress axios error logging
        validateStatus: () => true,
        timeout: 1500, // 1.5 second timeout to fail fast
        // Suppress axios request/response logging
        transformRequest: [(data) => data],
        transformResponse: [(data) => data],
      }
    );

    // If service is available, mark it as available
    if (res.status === 200 && res.data?.translatedText) {
      markServiceAvailable();

      const raw = res.data.translatedText;

      // ✅ Extract just the translated word using regex
      const match = raw.match(/as\s+"(.*?)"/);
      const cleanTranslation = match?.[1] || raw || text;

      return cleanTranslation;
    } else {
      // Service returned an error response
      markServiceUnavailable();
      return text;
    }
  } catch (err) {
    // Check if it's a network/connection error
    const isNetworkError =
      err.code === "ECONNREFUSED" ||
      err.code === "ERR_NETWORK" ||
      err.code === "ECONNABORTED" ||
      err.message === "Network Error" ||
      err.message?.includes("ERR_CONNECTION_REFUSED") ||
      err.message?.includes("timeout");

    // Mark service as unavailable for network errors
    if (isNetworkError) {
      markServiceUnavailable();
    }

    // Completely silence ALL errors - don't log anything
    // The feature is kept for future development but won't interfere with the app

    // Return original text on any error (graceful fallback)
    return text;
  }
};
