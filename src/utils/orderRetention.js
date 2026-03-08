const SAME_TAB_ORDER_RETENTION_KEY = "terra_same_tab_order_retention";

const PERSISTED_ORDER_KEYS = [
  "terra_orderId",
  "terra_orderId_DINE_IN",
  "terra_orderId_TAKEAWAY",
  "terra_orderStatus",
  "terra_orderStatus_DINE_IN",
  "terra_orderStatus_TAKEAWAY",
  "terra_orderStatusUpdatedAt",
  "terra_orderStatusUpdatedAt_DINE_IN",
  "terra_orderStatusUpdatedAt_TAKEAWAY",
  "terra_orderPaymentStatus",
  "terra_previousOrder",
  "terra_previousOrderDetail",
  "terra_lastPaidOrderId",
];

const hasStorageValue = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const rememberOrderForCurrentTab = (metadata = {}) => {
  try {
    sessionStorage.setItem(
      SAME_TAB_ORDER_RETENTION_KEY,
      JSON.stringify({
        orderId: metadata.orderId || "",
        serviceType: metadata.serviceType || "",
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore sessionStorage access failures.
  }
};

export const clearOrderRetentionForCurrentTab = () => {
  try {
    sessionStorage.removeItem(SAME_TAB_ORDER_RETENTION_KEY);
  } catch {
    // Ignore sessionStorage access failures.
  }
};

export const hasPersistedCustomerOrderState = () => {
  try {
    return PERSISTED_ORDER_KEYS.some((key) =>
      hasStorageValue(localStorage.getItem(key)),
    );
  } catch {
    return false;
  }
};

export const shouldPreserveOrderForCurrentTab = () => {
  try {
    if (!sessionStorage.getItem(SAME_TAB_ORDER_RETENTION_KEY)) {
      return false;
    }
  } catch {
    return false;
  }

  return hasPersistedCustomerOrderState();
};
