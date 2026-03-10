const RECENT_NOTIFICATION_WINDOW_MS = 10000;
const _recentNotificationKeys = new Map();

const ORDER_STATUS_LABELS = Object.freeze({
  PREPARING: "Order Preparing",
  READY: "Order Ready",
  SERVED: "Order Served",
  PAID: "Order Paid",
});

const ORDER_STATUS_BODIES = Object.freeze({
  PREPARING: "Your order is now being prepared.",
  READY: "Your order is ready.",
  SERVED: "Your order has been served.",
  PAID: "Your order payment is complete.",
});

const normalizeOrderStatus = (value) => {
  const token = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
  if (!token) return "PREPARING";
  if (["NEW", "PENDING", "CONFIRMED", "ACCEPT", "ACCEPTED"].includes(token)) {
    return "PREPARING";
  }
  if (["PREPARING", "BEING PREPARED", "BEINGPREPARED"].includes(token)) {
    return "PREPARING";
  }
  if (token === "READY") return "READY";
  if (token === "PAID") return "PAID";
  if (
    [
      "COMPLETED",
      "SERVED",
      "FINALIZED",
      "CANCELLED",
      "CANCELED",
      "RETURNED",
      "REJECTED",
      "EXIT",
      "CLOSED",
    ].includes(token)
  ) {
    return "SERVED";
  }
  return "PREPARING";
};

const canUseBrowserNotifications = () =>
  typeof window !== "undefined" && "Notification" in window;

const cleanupRecentNotificationKeys = () => {
  const now = Date.now();
  for (const [key, shownAt] of _recentNotificationKeys.entries()) {
    if (now - shownAt > RECENT_NOTIFICATION_WINDOW_MS) {
      _recentNotificationKeys.delete(key);
    }
  }
};

export const requestOrderNotificationPermission = async () => {
  if (!canUseBrowserNotifications()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return "error";
  }
};

export const notifyBrowserMessage = ({
  title,
  body,
  tag,
  data = {},
  onlyWhenHidden = true,
  vibrate = true,
} = {}) => {
  if (!canUseBrowserNotifications()) return false;
  if (Notification.permission !== "granted") return false;
  if (onlyWhenHidden && document.visibilityState === "visible") {
    return false;
  }

  const normalizedTitle = String(title || "").trim();
  const normalizedBody = String(body || "").trim();
  if (!normalizedTitle || !normalizedBody) return false;

  cleanupRecentNotificationKeys();
  const dedupeKey = `${tag || "terra-order"}:${normalizedTitle}:${normalizedBody}`;
  if (_recentNotificationKeys.has(dedupeKey)) {
    return false;
  }
  _recentNotificationKeys.set(dedupeKey, Date.now());

  try {
    const notification = new Notification(normalizedTitle, {
      body: normalizedBody,
      tag: String(tag || "terra-order"),
      renotify: false,
      requireInteraction: false,
      data,
    });

    if (vibrate && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([180, 80, 180]);
    }

    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // Ignore close errors.
      }
    }, 9000);
    return true;
  } catch {
    return false;
  }
};

export const notifyOrderStatusUpdate = ({
  orderId,
  status,
  paymentStatus,
  serviceType,
} = {}) => {
  const paymentToken = String(paymentStatus || "").trim().toUpperCase();
  const normalizedStatus = normalizeOrderStatus(status);
  const title = ORDER_STATUS_LABELS[normalizedStatus] || "Order Update";
  const serviceToken = String(serviceType || "").trim().toUpperCase();
  const bodyFromStatus =
    ORDER_STATUS_BODIES[normalizedStatus] || "Your order status has changed.";
  const paymentSuffix =
    paymentToken === "PAID" ? " Payment received." : "";
  const serviceSuffix =
    serviceToken === "TAKEAWAY" || serviceToken === "DELIVERY"
      ? " Please check your order summary."
      : "";

  return notifyBrowserMessage({
    title,
    body: `${bodyFromStatus}${paymentSuffix}${serviceSuffix}`,
    tag: `order-status-${String(orderId || "unknown")}`,
    data: {
      orderId: String(orderId || ""),
      status: normalizedStatus,
      paymentStatus: paymentToken || "",
      serviceType: serviceToken || "",
    },
    onlyWhenHidden: true,
    vibrate: true,
  });
};
