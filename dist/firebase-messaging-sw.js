/* eslint-disable no-undef */
const FIREBASE_SDK_VERSION = "10.13.2";

importScripts(
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`,
);
importScripts(
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`,
);

const extractApiBase = () => {
  try {
    const url = new URL(self.location.href);
    const fromQuery = String(url.searchParams.get("apiBase") || "").trim();
    if (fromQuery) return fromQuery.replace(/\/$/, "");
  } catch (_error) {
    // Ignore malformed URL parsing.
  }
  return "";
};

const apiBase = extractApiBase();
let messagingInstance = null;
let initPromise = null;

const resolveNotificationPayload = (payload) => {
  const data = payload?.data || {};
  const notification = payload?.notification || {};
  const title =
    notification.title ||
    data.title ||
    data.notificationTitle ||
    "Order Update";
  const body =
    notification.body ||
    data.body ||
    data.notificationBody ||
    "Your order has been updated.";
  const orderId = data.orderId || "";
  const targetUrl = orderId
    ? `/order-summary?orderId=${encodeURIComponent(orderId)}`
    : "/menu";

  return {
    title,
    options: {
      body,
      tag: `terra-order-${orderId || "unknown"}`,
      renotify: true,
      data: {
        ...data,
        url: targetUrl,
      },
    },
  };
};

const loadFirebaseWebConfig = async () => {
  if (!apiBase) return null;
  const response = await fetch(`${apiBase}/api/firebase-web-config`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.enabled || !payload?.config) {
    return null;
  }
  return payload.config;
};

const ensureFirebaseMessaging = async () => {
  if (messagingInstance) return messagingInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const firebaseConfig = await loadFirebaseWebConfig();
    if (!firebaseConfig) return null;

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const details = resolveNotificationPayload(payload);
      return self.registration.showNotification(details.title, details.options);
    });

    messagingInstance = messaging;
    return messaging;
  })();

  return initPromise;
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/menu";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});

ensureFirebaseMessaging();
