import {
  buildIdentityHeaders,
  ensureAnonymousSessionId,
} from "../utils/anonymousSession";
import {
  notifyBrowserMessage,
  requestOrderNotificationPermission,
} from "../utils/orderStatusNotifications";

const nodeApiBase = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

const SW_PATH = "/firebase-messaging-sw.js";

let _initPromise = null;
let _foregroundUnsubscribe = null;
let _messagingContext = null;

const getResolvedCartId = () => {
  try {
    const takeoverCartId = localStorage.getItem("terra_takeaway_cartId");
    if (takeoverCartId) return takeoverCartId;
    const selectedCartId = localStorage.getItem("terra_selectedCartId");
    if (selectedCartId) return selectedCartId;

    const tableSelection = JSON.parse(
      localStorage.getItem("terra_selectedTable") || "{}",
    );
    return (
      tableSelection?.cartId?._id ||
      tableSelection?.cartId ||
      tableSelection?.cafeId?._id ||
      tableSelection?.cafeId ||
      null
    );
  } catch {
    return null;
  }
};

const fetchFirebaseWebConfig = async () => {
  const response = await fetch(`${nodeApiBase}/api/firebase-web-config`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Failed to load web push config");
  }
  if (!payload?.enabled || !payload?.config) {
    return null;
  }
  return {
    config: payload.config,
    vapidKey: payload.vapidKey || null,
  };
};

const saveTokenToBackend = async (token) => {
  if (!token) return;

  const anonymousSessionId = ensureAnonymousSessionId();
  const cartId = getResolvedCartId();
  const headers = buildIdentityHeaders({
    "Content-Type": "application/json",
  });

  await fetch(`${nodeApiBase}/api/save-token`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      token,
      firebaseToken: token,
      platform: "web",
      source: "web",
      anonymousSessionId: anonymousSessionId || undefined,
      cartId: cartId || undefined,
      metadata: {
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      },
    }),
  }).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn("[Push] Failed to save token to backend:", error);
    }
  });
};

const attachForegroundMessageListener = (onMessage) => {
  if (_foregroundUnsubscribe) {
    _foregroundUnsubscribe();
    _foregroundUnsubscribe = null;
  }

  _foregroundUnsubscribe = onMessage(_messagingContext.messaging, (payload) => {
    const data = payload?.data || {};
    const title =
      payload?.notification?.title ||
      data.title ||
      data.notificationTitle ||
      "Order Update";
    const body =
      payload?.notification?.body ||
      data.body ||
      data.notificationBody ||
      "Your order has been updated.";
    const orderId = data.orderId || "";
    notifyBrowserMessage({
      title,
      body,
      tag: `fcm-order-${orderId || "unknown"}`,
      data,
      onlyWhenHidden: true,
      vibrate: true,
    });
  });
};

const initializeMessagingContext = async () => {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return null;
  }

  const permission = await requestOrderNotificationPermission();
  if (permission !== "granted") {
    return null;
  }

  const firebaseWebConfig = await fetchFirebaseWebConfig();
  if (!firebaseWebConfig) {
    return null;
  }

  const [{ initializeApp, getApps }, messagingModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);

  const { getMessaging, getToken, onMessage, isSupported } = messagingModule;
  if (!(await isSupported())) {
    return null;
  }

  const swUrl = `${SW_PATH}?apiBase=${encodeURIComponent(nodeApiBase)}`;
  const serviceWorkerRegistration = await navigator.serviceWorker.register(swUrl);
  const app =
    getApps().length > 0 ? getApps()[0] : initializeApp(firebaseWebConfig.config);
  const messaging = getMessaging(app);

  const tokenOptions = { serviceWorkerRegistration };
  if (firebaseWebConfig.vapidKey) {
    tokenOptions.vapidKey = firebaseWebConfig.vapidKey;
  }

  const token = await getToken(messaging, tokenOptions).catch(() => "");
  if (token) {
    await saveTokenToBackend(token);
  }

  _messagingContext = {
    messaging,
    getToken,
    tokenOptions,
  };
  attachForegroundMessageListener(onMessage);
  return _messagingContext;
};

export const initializeCustomerPush = async () => {
  if (_initPromise) return _initPromise;
  _initPromise = initializeMessagingContext().catch((error) => {
    if (import.meta.env.DEV) {
      console.warn("[Push] Initialization failed:", error);
    }
    return null;
  });
  const result = await _initPromise;
  if (!result) {
    _initPromise = null;
  }
  return result;
};

export const refreshCustomerPushToken = async () => {
  const ctx = _messagingContext || (await initializeCustomerPush());
  if (!ctx?.messaging || !ctx?.getToken) return null;

  try {
    const token = await ctx.getToken(ctx.messaging, ctx.tokenOptions);
    if (token) {
      await saveTokenToBackend(token);
      return token;
    }
    return null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[Push] Token refresh failed:", error);
    }
    return null;
  }
};
