import axios from 'axios';
import { getCustomerApiOrigin } from './customerApiOrigin';
import { STABILITY_FLAGS } from './stabilityFlags';

// Primary backend (AWS EC2)
const PRIMARY_API_URL = getCustomerApiOrigin();

// Fallback backend (Render.com)
const FALLBACK_API_URL = import.meta.env.VITE_FALLBACK_API_URL || PRIMARY_API_URL;

// Health check timeout (2 seconds)
const HEALTH_CHECK_TIMEOUT = 2000;
const HEALTH_CHECK_INTERVAL_MS = 45000;

// Current active backend
let activeBackend = PRIMARY_API_URL;
let healthCheckInterval = null;
const backendSwitchListeners = new Set();

/**
 * Check if a backend is healthy
 */
const checkBackendHealth = async (url) => {
  try {
    const response = await axios.get(`${url}/api/health`, {
      timeout: HEALTH_CHECK_TIMEOUT,
    });
    return response.status === 200;
  } catch (error) {
    console.warn(`Backend health check failed for ${url}:`, error.message);
    return false;
  }
};

/**
 * Determine which backend to use
 */
const selectBackend = async () => {
  // Try primary first
  const primaryHealthy = await checkBackendHealth(PRIMARY_API_URL);

  if (primaryHealthy) {
    console.log('Using PRIMARY backend (AWS):', PRIMARY_API_URL);
    activeBackend = PRIMARY_API_URL;
    return PRIMARY_API_URL;
  }

  // Fallback to secondary
  console.warn('PRIMARY backend unavailable, trying FALLBACK...');
  const fallbackHealthy = await checkBackendHealth(FALLBACK_API_URL);

  if (fallbackHealthy) {
    console.log('Using FALLBACK backend (Render):', FALLBACK_API_URL);
    activeBackend = FALLBACK_API_URL;
    return FALLBACK_API_URL;
  }

  // Both failed - use primary anyway (will show error to user)
  console.error('Both backends unavailable. Using primary as last resort.');
  activeBackend = PRIMARY_API_URL;
  return PRIMARY_API_URL;
};

/**
 * Initialize backend selection
 */
const initializeBackend = async () => {
  await selectBackend();

  // Periodic health check with visibility pause
  if (!healthCheckInterval) {
    healthCheckInterval = setInterval(async () => {
      if (
        STABILITY_FLAGS.ENABLE_VISIBILITY_POLLING_PAUSE &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      const previousBackend = activeBackend;
      const newBackend = await selectBackend();
      if (newBackend !== previousBackend) {
        console.log(`Backend switched from ${previousBackend} to ${newBackend}`);
        for (const listener of backendSwitchListeners) {
          try {
            listener({ previousBackend, activeBackend: newBackend });
          } catch (_error) {
            // Listener errors should not break health checks.
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }
};

/**
 * Create axios instance with automatic fallback
 */
const createApiInstance = () => {
  const instance = axios.create({
    baseURL: activeBackend,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - add auth token
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor - handle errors and retry with fallback
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config || {};

      // If request failed and we haven't retried yet
      if (
        !originalRequest._retry &&
        (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK')
      ) {
        originalRequest._retry = true;

        // Try fallback backend
        if (activeBackend === PRIMARY_API_URL) {
          console.warn('Primary backend failed, switching to fallback...');
          activeBackend = FALLBACK_API_URL;
          originalRequest.baseURL = FALLBACK_API_URL;
          return instance(originalRequest);
        }
      }

      return Promise.reject(error);
    },
  );

  return instance;
};

// Initialize on module load
initializeBackend();

// Export API instance
const api = createApiInstance();

export default api;

export const onBackendSwitch = (listener) => {
  if (typeof listener !== 'function') return () => {};
  backendSwitchListeners.add(listener);
  return () => backendSwitchListeners.delete(listener);
};

// Export utility functions
export { activeBackend, selectBackend, PRIMARY_API_URL, FALLBACK_API_URL };
