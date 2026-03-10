import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FaQrcode, FaMoneyBillWave, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import io from "socket.io-client";
import translations from "../data/translations/payment.json";
import { clearScopedCart } from "../utils/cartStorage";
import { refreshCustomerPushToken } from "../services/customerPushService";
import {
  buildSocketIdentityPayload,
  ensureAnonymousSessionId,
} from "../utils/anonymousSession";
import "./Payment.css";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");
const PAYMENT_GATE_ORDER_ID_KEY = "terra_payment_gate_order_id";
const PAYMENT_GATE_MODE_KEY = "terra_payment_gate_mode";
const PAYMENT_GATE_DRAFT_KEY = "terra_payment_gate_order_draft";
const TAKEAWAY_TOKEN_PREVIEW_KEY = "terra_takeaway_token_preview";
const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

let razorpayScriptPromise = null;

/** Build full URL for uploaded QR image (handles relative path or absolute URL). */
function qrImageSrc(qrImageUrl) {
  if (!qrImageUrl) return "";
  if (qrImageUrl.startsWith("http://") || qrImageUrl.startsWith("https://"))
    return qrImageUrl;
  const path = qrImageUrl.startsWith("/") ? qrImageUrl : `/${qrImageUrl}`;
  return `${nodeApi}${path}`;
}

/** Build PhonePe / Paytm deep link from UPI payload for exact amount payment. */
function getUpiAppUrl(upiPayload, scheme) {
  if (!upiPayload || typeof upiPayload !== "string") return null;
  const match = upiPayload.match(/^(upi:\/\/pay\?)(.*)$/i);
  if (!match) return null;
  return `${scheme}://pay?${match[2]}`;
}

function parseUpiPayload(upiPayload) {
  if (!upiPayload || typeof upiPayload !== "string") return null;
  const match = upiPayload.match(/^upi:\/\/pay\?(.*)$/i);
  if (!match) return null;

  try {
    const params = new URLSearchParams(match[1]);
    const upiId = (params.get("pa") || "").trim();
    const payeeName = (params.get("pn") || "").trim();

    if (!upiId && !payeeName) return null;
    return {
      upiId,
      payeeName,
    };
  } catch (_error) {
    return null;
  }
}

function hasOfficeQrMetadata(tableContext) {
  if (!tableContext || typeof tableContext !== "object") return false;
  if (tableContext.qrContextType === "OFFICE") return true;

  const hasOfficeName = String(tableContext.officeName || "").trim().length > 0;
  const hasOfficeAddress =
    String(tableContext.officeAddress || "").trim().length > 0;
  const hasOfficePhone = String(tableContext.officePhone || "").trim().length > 0;
  const hasOfficeDeliveryCharge =
    Number(tableContext.officeDeliveryCharge || 0) > 0;

  return (
    hasOfficeName ||
    hasOfficeAddress ||
    hasOfficePhone ||
    hasOfficeDeliveryCharge
  );
}

function resolveOfficePaymentMode(tableContext) {
  if (!hasOfficeQrMetadata(tableContext)) return null;
  // Business rule: OFFICE QR orders are prepaid-only for now.
  return "ONLINE";
}

function buildFallbackUpiPayload({ upiId, payeeName, amount, orderId }) {
  if (!upiId) return null;

  const normalizedUpiId = String(upiId).trim();
  if (!normalizedUpiId) return null;

  const normalizedPayeeName = String(payeeName || "Terra Cart").trim();
  const amountNumber = Number(amount);
  const amountParam =
    Number.isFinite(amountNumber) && amountNumber > 0
      ? `&am=${amountNumber.toFixed(2)}`
      : "";
  const note = encodeURIComponent(orderId ? `Order ${orderId}` : "Order Payment");

  return `upi://pay?pa=${encodeURIComponent(
    normalizedUpiId
  )}&pn=${encodeURIComponent(normalizedPayeeName)}&tn=${note}${amountParam}&cu=INR`;
}

function isRazorpayPayment(payment) {
  const gateway = String(payment?.metadata?.gateway || "")
    .trim()
    .toUpperCase();
  return gateway === "RAZORPAY" || Boolean(payment?.metadata?.razorpayOrderId);
}

function loadRazorpayCheckoutScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve) => {
    const existingScript = document.querySelector(
      `script[src="${RAZORPAY_CHECKOUT_SCRIPT}"]`
    );
    if (existingScript) {
      existingScript.addEventListener("load", () =>
        resolve(Boolean(window.Razorpay))
      );
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

function resolveInitialOrderId() {
  const deferredDraft = readPaymentGateDraft();
  if (deferredDraft?.orderPayload) {
    // Draft exists: order must be created/updated only after method selection.
    return "";
  }

  const paymentGateOrderId = localStorage.getItem(PAYMENT_GATE_ORDER_ID_KEY) || "";
  if (paymentGateOrderId) return paymentGateOrderId;

  const currentServiceType = localStorage.getItem("terra_serviceType") || "DINE_IN";
  const isTakeawayLike =
    currentServiceType === "TAKEAWAY" ||
    currentServiceType === "PICKUP" ||
    currentServiceType === "DELIVERY";
  return isTakeawayLike
    ? localStorage.getItem("terra_orderId_TAKEAWAY") ||
        localStorage.getItem("terra_orderId")
    : localStorage.getItem("terra_orderId");
}

function readPaymentGateDraft() {
  const raw = localStorage.getItem(PAYMENT_GATE_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.orderPayload || typeof parsed.orderPayload !== "object") return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function resolveOrderStatusValue(...candidates) {
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) return normalized;
  }
  return "Confirmed";
}

function normalizeStatusToken(value) {
  return String(value || "").trim().toUpperCase();
}

function extractPayloadOrderId(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(
    payload.orderId ||
      payload._id ||
      payload.id ||
      payload.order?._id ||
      payload.order?.id ||
      ""
  ).trim();
}

function extractPayloadPaymentStatus(payload) {
  if (!payload || typeof payload !== "object") return "";
  return normalizeStatusToken(
    payload.status ||
      payload.paymentStatus ||
      payload.order?.paymentStatus ||
      payload.order?.status
  );
}

export default function Payment() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [verifyingRazorpay, setVerifyingRazorpay] = useState(false);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadedQR, setUploadedQR] = useState(null);
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  // Track if we've already handled payment completion to prevent re-render loops
  const [hasHandledPayment, setHasHandledPayment] = useState(false);

  // Memoize language and translation function to prevent re-renders
  const language = useMemo(
    () => localStorage.getItem("language") || "en",
    []
  );
  const t = useCallback(
    (key) => translations[language]?.[key] || key,
    [language]
  );

  // Memoize serviceType to prevent unnecessary re-renders
  const serviceType = useMemo(
    () => localStorage.getItem("terra_serviceType") || "DINE_IN",
    []
  );
  const officePaymentMode = useMemo(() => {
    try {
      const tableRaw = localStorage.getItem("terra_selectedTable");
      if (!tableRaw) return null;
      const table = JSON.parse(tableRaw);
      return resolveOfficePaymentMode(table);
    } catch {
      return null;
    }
  }, []);
  const [orderId, setOrderId] = useState(() => resolveInitialOrderId());
  const [paymentGateOrderId, setPaymentGateOrderId] = useState(
    () => localStorage.getItem(PAYMENT_GATE_ORDER_ID_KEY) || ""
  );
  const [paymentGateMode, setPaymentGateMode] = useState(
    () => localStorage.getItem(PAYMENT_GATE_MODE_KEY) || ""
  );
  const [paymentGateDraft, setPaymentGateDraft] = useState(() =>
    readPaymentGateDraft()
  );
  const hasDeferredOrderDraft = useMemo(
    () => Boolean(paymentGateDraft?.orderPayload),
    [paymentGateDraft]
  );
  const isCurrentPaymentGateFlow = useMemo(() => {
    if (!paymentGateMode) return false;
    if (orderId) return !!paymentGateOrderId && paymentGateOrderId === orderId;
    return hasDeferredOrderDraft;
  }, [paymentGateMode, paymentGateOrderId, orderId, hasDeferredOrderDraft]);
  const forceOnlineForCurrentOrder = useMemo(
    () => paymentGateMode === "ONLINE" && isCurrentPaymentGateFlow,
    [paymentGateMode, isCurrentPaymentGateFlow]
  );
  const isChoiceGateCurrentOrder = useMemo(
    () => paymentGateMode === "CHOICE" && isCurrentPaymentGateFlow,
    [paymentGateMode, isCurrentPaymentGateFlow]
  );
  const isCashGateCurrentOrder = useMemo(
    () => paymentGateMode === "CASH" && isCurrentPaymentGateFlow,
    [paymentGateMode, isCurrentPaymentGateFlow]
  );
  const isPaymentGateCurrentOrder = useMemo(
    () =>
      forceOnlineForCurrentOrder ||
      isChoiceGateCurrentOrder ||
      isCashGateCurrentOrder,
    [forceOnlineForCurrentOrder, isChoiceGateCurrentOrder, isCashGateCurrentOrder]
  );
  const showOnlineOption = useMemo(() => {
    if (forceOnlineForCurrentOrder) return true;
    if (isChoiceGateCurrentOrder) return true;
    if (isCashGateCurrentOrder) return false;
    return officePaymentMode !== "COD";
  }, [
    forceOnlineForCurrentOrder,
    isChoiceGateCurrentOrder,
    isCashGateCurrentOrder,
    officePaymentMode,
  ]);
  const isPickupCashChoiceOrder = useMemo(() => {
    if (forceOnlineForCurrentOrder) return false;
    if (officePaymentMode === "ONLINE") return false;
    return serviceType === "PICKUP";
  }, [forceOnlineForCurrentOrder, officePaymentMode, serviceType]);
  const showCashOption = useMemo(() => {
    if (forceOnlineForCurrentOrder) return false;
    if (isCashGateCurrentOrder || isChoiceGateCurrentOrder) return true;
    if (officePaymentMode === "ONLINE") return false;
    if (serviceType === "DELIVERY") return false;
    return true;
  }, [
    forceOnlineForCurrentOrder,
    isCashGateCurrentOrder,
    isChoiceGateCurrentOrder,
    officePaymentMode,
    serviceType,
  ]);
  const paymentModeHint = useMemo(() => {
    if (forceOnlineForCurrentOrder) {
      return "Online payment is required for this order. The order proceeds only after payment confirmation.";
    }
    if (isChoiceGateCurrentOrder) {
      return "Choose Online Payment or Cash. If you choose Online, your order proceeds after payment confirmation.";
    }
    if (isCashGateCurrentOrder) {
      return "Cash confirmation is required to proceed with this order.";
    }
    if (officePaymentMode === "ONLINE") {
      return "This office QR allows online payment only.";
    }
    if (officePaymentMode === "COD") {
      return "This office QR allows Cash on Delivery only.";
    }
    if (officePaymentMode === "BOTH") {
      return "This office QR allows both online payment and Cash on Delivery.";
    }
    if (isPickupCashChoiceOrder) {
      return "For pickup orders, you can pay online now or choose Cash on Pickup.";
    }
    return null;
  }, [
    forceOnlineForCurrentOrder,
    isChoiceGateCurrentOrder,
    isCashGateCurrentOrder,
    officePaymentMode,
    isPickupCashChoiceOrder,
  ]);

  const paymentPending = useMemo(
    () =>
      payment &&
      payment.status &&
      ["PENDING", "PROCESSING", "CASH_PENDING"].includes(payment.status),
    [payment]
  );
  const fetchLatestPayment = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const res = await fetch(
        `${nodeApi}/api/payments/order/${orderId}/latest`
      );
      // Handle both 200 (with null) and 404 gracefully - both mean no payment exists yet
      if (res.status === 404) {
        setPayment(null);
        return;
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch payment status");
      }
      const data = await res.json();
      // Backend now returns null instead of 404 when no payment exists
      setPayment(data || null);
    } catch (err) {
      // Silently handle expected "not found" scenarios
      if (err.message?.includes("404") || err.message?.includes("not found")) {
        setPayment(null);
      } else {
        console.warn("Failed to fetch payment:", err);
        setPayment(null);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const resolveCartScopeId = useCallback(() => {
    const selectedCartId = localStorage.getItem("terra_selectedCartId");
    if (selectedCartId) return selectedCartId;

    const takeawayCartId = localStorage.getItem("terra_takeaway_cartId");
    if (takeawayCartId) return takeawayCartId;

    const selectedTableRaw =
      localStorage.getItem("terra_selectedTable") ||
      localStorage.getItem("tableSelection");
    if (selectedTableRaw) {
      try {
        const selectedTable = JSON.parse(selectedTableRaw);
        return selectedTable?.cartId || selectedTable?.cafeId || null;
      } catch (_err) {
        return null;
      }
    }

    return null;
  }, []);

  const fetchUploadedQR = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams();
      if (orderId) {
        // Prefer orderId scope so backend resolves the exact cart from the order.
        queryParams.set("orderId", orderId);
      } else {
        const cartScopeId = resolveCartScopeId();
        if (cartScopeId) queryParams.set("cartId", cartScopeId);
      }
      const activeQrUrl = `${nodeApi}/api/payment-qr/active${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      const res = await fetch(activeQrUrl);
      // Handle both 200 (with null) and 404 gracefully - both mean no QR code exists yet
      if (res.status === 404) {
        setUploadedQR(null);
        return;
      }
      if (!res.ok) {
        setUploadedQR(null);
        return;
      }
      const data = await res.json();
      // Backend now returns null instead of 404 when no QR code exists
      setUploadedQR(data || null);
    } catch (err) {
      // Silently handle expected "not found" scenarios - no uploaded QR is okay
      setUploadedQR(null);
    }
  }, [orderId, resolveCartScopeId]);

  const clearDeferredOrderDraft = useCallback(() => {
    localStorage.removeItem(PAYMENT_GATE_DRAFT_KEY);
    setPaymentGateDraft(null);
  }, []);

  const clearPaymentGate = useCallback(() => {
    localStorage.removeItem(PAYMENT_GATE_ORDER_ID_KEY);
    localStorage.removeItem(PAYMENT_GATE_MODE_KEY);
    setPaymentGateOrderId("");
    setPaymentGateMode("");
  }, []);

  const clearOrderStorageForCurrentFlow = useCallback(() => {
    const currentServiceType =
      localStorage.getItem("terra_serviceType") || "DINE_IN";
    const isTakeawayLike =
      currentServiceType === "TAKEAWAY" ||
      currentServiceType === "PICKUP" ||
      currentServiceType === "DELIVERY";

    localStorage.removeItem("terra_orderId");
    localStorage.removeItem("terra_orderStatus");
    localStorage.removeItem("terra_orderStatusUpdatedAt");

    if (isTakeawayLike) {
      localStorage.removeItem("terra_orderId_TAKEAWAY");
      localStorage.removeItem("terra_orderStatus_TAKEAWAY");
      localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
    } else {
      localStorage.removeItem("terra_orderId_DINE_IN");
      localStorage.removeItem("terra_orderStatus_DINE_IN");
      localStorage.removeItem("terra_orderStatusUpdatedAt_DINE_IN");
    }
    setOrderId("");
  }, []);

  const persistOrderStorageForCurrentFlow = useCallback(
    (resolvedOrderId, resolvedOrderStatus, isTakeawayLike) => {
      const nowIso = new Date().toISOString();
      localStorage.setItem("terra_orderId", resolvedOrderId);
      localStorage.setItem("terra_orderStatus", resolvedOrderStatus);
      localStorage.setItem("terra_orderStatusUpdatedAt", nowIso);

      if (isTakeawayLike) {
        localStorage.setItem("terra_orderId_TAKEAWAY", resolvedOrderId);
        localStorage.setItem("terra_orderStatus_TAKEAWAY", resolvedOrderStatus);
        localStorage.setItem("terra_orderStatusUpdatedAt_TAKEAWAY", nowIso);
      } else {
        localStorage.setItem("terra_orderId_DINE_IN", resolvedOrderId);
        localStorage.setItem("terra_orderStatus_DINE_IN", resolvedOrderStatus);
        localStorage.setItem("terra_orderStatusUpdatedAt_DINE_IN", nowIso);
      }

      setOrderId(resolvedOrderId);
    },
    []
  );

  const ensureOrderForPayment = useCallback(async () => {
    if (orderId) return orderId;

    const draft = paymentGateDraft || readPaymentGateDraft();
    if (!draft?.orderPayload) {
      throw new Error("Order not ready. Please go back to cart and try again.");
    }

    const url = draft.finalActiveOrderId
      ? `${nodeApi}/api/orders/${draft.finalActiveOrderId}/kot`
      : `${nodeApi}/api/orders`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.orderPayload),
    });

    let data = {};
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : {};
    } catch (_parseError) {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data?.message || data?.error || "Unable to place order");
    }

    const resolvedOrderId = data?._id || draft.finalActiveOrderId || "";
    if (!resolvedOrderId) {
      throw new Error("Order placed but ID was missing. Please retry.");
    }

    const resolvedOrderStatus = resolveOrderStatusValue(
      data?.status,
      draft?.activeOrderStatus
    );
    const isTakeawayLike = Boolean(draft?.isTakeawayLike);

    persistOrderStorageForCurrentFlow(
      resolvedOrderId,
      resolvedOrderStatus,
      isTakeawayLike
    );
    if (isTakeawayLike) {
      localStorage.removeItem(TAKEAWAY_TOKEN_PREVIEW_KEY);
    }

    const nextGateMode = String(draft?.paymentGateMode || paymentGateMode || "")
      .trim()
      .toUpperCase();
    if (nextGateMode) {
      localStorage.setItem(PAYMENT_GATE_ORDER_ID_KEY, resolvedOrderId);
      localStorage.setItem(PAYMENT_GATE_MODE_KEY, nextGateMode);
      setPaymentGateOrderId(resolvedOrderId);
      setPaymentGateMode(nextGateMode);
    } else {
      clearPaymentGate();
    }

    clearDeferredOrderDraft();
    refreshCustomerPushToken().catch(() => {});

    return resolvedOrderId;
  }, [
    orderId,
    paymentGateDraft,
    paymentGateMode,
    clearDeferredOrderDraft,
    clearPaymentGate,
    persistOrderStorageForCurrentFlow,
  ]);

  const handleCompleteAndRedirect = useCallback(async () => {
    // Prevent multiple calls
    if (hasHandledPayment) {
      console.log("[Payment] Payment already handled, skipping");
      return;
    }

    setHasHandledPayment(true);
    clearDeferredOrderDraft();
    clearPaymentGate();
    const currentServiceType =
      localStorage.getItem("terra_serviceType") || "DINE_IN";
    const defaultStatusAfterPayment =
      officePaymentMode === "ONLINE" ? "Confirmed" : "Paid";
    const nowIso = new Date().toISOString();

    if (orderId) {
      let resolvedOrderStatus = defaultStatusAfterPayment;
      try {
        const orderRes = await fetch(`${nodeApi}/api/orders/${orderId}`);
        if (orderRes.ok) {
          const latestOrder = await orderRes.json();
          const latestStatus = String(latestOrder?.status || "").trim();
          if (latestStatus) {
            resolvedOrderStatus = latestStatus;
          }
        }
      } catch (error) {
        console.warn("[Payment] Unable to fetch latest order status:", error);
      }

      // CRITICAL: Preserve orderId so Menu page can display order data
      localStorage.setItem("terra_orderId", orderId);
      localStorage.setItem("terra_orderStatus", resolvedOrderStatus);
      localStorage.setItem("terra_orderStatusUpdatedAt", nowIso);
      if (resolvedOrderStatus === "Paid") {
        localStorage.setItem("terra_lastPaidOrderId", orderId);
      } else {
        localStorage.removeItem("terra_lastPaidOrderId");
      }

      // Also set service-type-specific keys if needed
      const orderType = localStorage.getItem("terra_orderType") || null; // PICKUP or DELIVERY
      const isPickupOrDelivery = orderType === "PICKUP" || orderType === "DELIVERY";

      if (currentServiceType === "TAKEAWAY" || currentServiceType === "PICKUP" || currentServiceType === "DELIVERY") {
        localStorage.setItem("terra_orderId_TAKEAWAY", orderId);
        localStorage.setItem("terra_orderStatus_TAKEAWAY", resolvedOrderStatus);
        localStorage.setItem(
          "terra_orderStatusUpdatedAt_TAKEAWAY",
          nowIso
        );

        // CRITICAL: Only clear customer data for regular TAKEAWAY orders
        // Preserve customer data for PICKUP/DELIVERY orders so users can reorder without re-entering info
        if (!isPickupOrDelivery && currentServiceType === "TAKEAWAY") {
          // Clear takeaway customer data after order is paid (only for regular TAKEAWAY, not PICKUP/DELIVERY)
          // This ensures new customers don't see previous customer's data
          localStorage.removeItem("terra_takeaway_customerName");
          localStorage.removeItem("terra_takeaway_customerMobile");
          localStorage.removeItem("terra_takeaway_customerEmail");
          console.log("[Payment] Cleared takeaway customer data after payment (regular TAKEAWAY order)");
        } else {
          // Preserve customer data for PICKUP/DELIVERY orders to allow easy reordering
          console.log("[Payment] Preserved customer data for " + (orderType || currentServiceType) + " order to allow reordering");
        }
      } else {
        localStorage.setItem("terra_orderId_DINE_IN", orderId);
        localStorage.setItem("terra_orderStatus_DINE_IN", resolvedOrderStatus);
        localStorage.setItem(
          "terra_orderStatusUpdatedAt_DINE_IN",
          nowIso
        );
      }
    }
    // Only remove cart, keep order data
    clearScopedCart(currentServiceType);
    
    // CRITICAL: Set flag to indicate payment was completed
    // This will trigger session clearing when user scans a new table QR after refresh
    localStorage.setItem("terra_paymentCompleted", "true");
    console.log("[Payment] Payment completed - flag set for session clearing on next table scan");

    navigate("/menu");
  }, [
    orderId,
    navigate,
    hasHandledPayment,
    officePaymentMode,
    clearPaymentGate,
    clearDeferredOrderDraft,
  ]);

  useEffect(() => {
    if (!orderId) {
      if (!hasDeferredOrderDraft) {
        clearDeferredOrderDraft();
        clearPaymentGate();
        alert(t("noOrderFound") || "No order found for payment.");
        navigate("/menu");
        return;
      }
      setLoading(false);
      setPayment(null);
      fetchUploadedQR();
      return;
    }
    fetchLatestPayment();
    fetchUploadedQR();
  }, [
    orderId,
    hasDeferredOrderDraft,
    fetchLatestPayment,
    fetchUploadedQR,
    navigate,
    t,
    clearPaymentGate,
    clearDeferredOrderDraft,
  ]);

  useEffect(() => {
    if (
      paymentGateOrderId &&
      orderId &&
      paymentGateOrderId !== orderId
    ) {
      clearPaymentGate();
    }
  }, [paymentGateOrderId, orderId, clearPaymentGate]);

  useEffect(() => {
    if (orderId && hasDeferredOrderDraft) {
      clearDeferredOrderDraft();
    }
  }, [orderId, hasDeferredOrderDraft, clearDeferredOrderDraft]);

  useEffect(() => {
    if (!paymentPending) return;
    const interval = setInterval(() => {
      fetchLatestPayment();
    }, 10000);
    return () => clearInterval(interval);
  }, [paymentPending, fetchLatestPayment]);

  useEffect(() => {
    ensureAnonymousSessionId();
    let socket = null;
    let joinedCartId = "";

    const joinIdentityRoom = () => {
      if (!socket) return;
      const identityPayload = buildSocketIdentityPayload();
      if (identityPayload?.anonymousSessionId) {
        socket.emit("join_room", identityPayload);
      }
    };

    const joinCartRoom = (cartId) => {
      if (!socket) return;
      const normalizedCartId = String(cartId || "").trim();
      if (!normalizedCartId || normalizedCartId === joinedCartId) {
        return;
      }
      socket.emit("join:cart", normalizedCartId);
      joinedCartId = normalizedCartId;
    };

    const isCurrentOrderPayload = (payload) => {
      const payloadOrderId = extractPayloadOrderId(payload);
      if (!payloadOrderId || !orderId) return false;
      return payloadOrderId === String(orderId).trim();
    };

    const handleSocketPaymentEvent = async (payload) => {
      if (!isCurrentOrderPayload(payload)) return;
      await fetchLatestPayment();
      const paymentToken = extractPayloadPaymentStatus(payload);
      if (paymentToken === "PAID" && !hasHandledPayment) {
        handleCompleteAndRedirect();
      }
    };

    try {
      socket = io(nodeApi, {
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 20000,
        timeout: 20000,
        autoConnect: true,
        forceNew: false,
      });

      socket.on("connect", () => {
        joinedCartId = "";
        joinIdentityRoom();
        joinCartRoom(resolveCartScopeId());
      });

      socket.on("reconnect", () => {
        joinedCartId = "";
        joinIdentityRoom();
        joinCartRoom(resolveCartScopeId());
      });

      socket.on("paymentCreated", (payload) => {
        handleSocketPaymentEvent(payload).catch((error) => {
          console.warn("[Payment] paymentCreated socket refresh failed:", error);
        });
      });

      socket.on("paymentUpdated", (payload) => {
        handleSocketPaymentEvent(payload).catch((error) => {
          console.warn("[Payment] paymentUpdated socket refresh failed:", error);
        });
      });
    } catch (error) {
      console.warn("[Payment] Failed to initialize payment socket:", error);
    }

    return () => {
      if (!socket) return;
      socket.off("connect");
      socket.off("reconnect");
      socket.off("paymentCreated");
      socket.off("paymentUpdated");
      socket.disconnect();
      socket = null;
    };
  }, [
    orderId,
    fetchLatestPayment,
    resolveCartScopeId,
    hasHandledPayment,
    handleCompleteAndRedirect,
  ]);

  useEffect(() => {
    // Only handle payment completion once and only if status is PAID
    if (payment?.status === "PAID" && !hasHandledPayment) {
      handleCompleteAndRedirect();
    }
  }, [payment?.status, handleCompleteAndRedirect, hasHandledPayment]);

  const launchRazorpayCheckout = useCallback(
    async (paymentPayload) => {
      if (!paymentPayload?.id || !isRazorpayPayment(paymentPayload)) {
        return;
      }

      const razorpayOrderId =
        paymentPayload?.metadata?.razorpayOrderId ||
        paymentPayload?.providerReference ||
        "";
      const razorpayKeyId =
        paymentPayload?.metadata?.razorpayKeyId ||
        import.meta.env.VITE_RAZORPAY_KEY_ID ||
        "";

      if (!razorpayOrderId || !razorpayKeyId) {
        alert("Unable to start Razorpay checkout. Missing gateway configuration.");
        return;
      }

      const scriptLoaded = await loadRazorpayCheckoutScript();
      if (
        !scriptLoaded ||
        typeof window === "undefined" ||
        typeof window.Razorpay !== "function"
      ) {
        alert("Unable to load Razorpay checkout. Please try again.");
        return;
      }

      const amountInPaise = Math.max(
        0,
        Math.round(Number(paymentPayload?.amount || 0) * 100)
      );

      const options = {
        key: razorpayKeyId,
        order_id: razorpayOrderId,
        amount: amountInPaise || undefined,
        currency: paymentPayload?.metadata?.razorpayCurrency || "INR",
        name: "Terra Cart",
        description:
          paymentPayload?.description ||
          `Payment for order ${paymentPayload?.orderId || orderId}`,
        notes: {
          orderId: paymentPayload?.orderId || orderId || "",
          receipt: paymentPayload?.metadata?.razorpayReceipt || "",
        },
        handler: async (response) => {
          setVerifyingRazorpay(true);
          try {
            const verifyRes = await fetch(
              `${nodeApi}/api/payments/${paymentPayload.id}/verify-razorpay`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response?.razorpay_payment_id,
                  razorpay_order_id: response?.razorpay_order_id,
                  razorpay_signature: response?.razorpay_signature,
                }),
              }
            );

            const verifyData = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok) {
              throw new Error(
                verifyData?.message || "Payment verification failed. Please try again."
              );
            }

            setPayment(verifyData || null);
          } catch (error) {
            alert(error.message || "Payment verification failed.");
            await fetchLatestPayment();
          } finally {
            setVerifyingRazorpay(false);
          }
        },
        modal: {
          ondismiss: async () => {
            await fetchLatestPayment();
          },
        },
        theme: {
          color: "#2563eb",
        },
      };

      const razorpayCheckout = new window.Razorpay(options);
      razorpayCheckout.on("payment.failed", async () => {
        await fetchLatestPayment();
      });
      razorpayCheckout.open();
    },
    [fetchLatestPayment, orderId]
  );

  const createPaymentIntent = async (method) => {
    if (forceOnlineForCurrentOrder && method !== "ONLINE") {
      alert("Only online payment is allowed for this order.");
      return;
    }
    if (method === "ONLINE" && !showOnlineOption) {
      alert("Online payment is not available for this order.");
      return;
    }
    if (method === "CASH" && !showCashOption) {
      alert("Cash payment is not available for this order.");
      return;
    }
    setCreating(true);
    try {
      const resolvedOrderId = await ensureOrderForPayment();
      if (!resolvedOrderId) {
        throw new Error("Order not found for payment.");
      }

      const res = await fetch(`${nodeApi}/api/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: resolvedOrderId, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Unable to create payment");
      }
      setPayment(data);

      if (method === "ONLINE" && isRazorpayPayment(data)) {
        await launchRazorpayCheckout(data);
      }

      if (
        method === "CASH" &&
        (isChoiceGateCurrentOrder ||
          isCashGateCurrentOrder ||
          isPickupCashChoiceOrder)
      ) {
        const currentServiceType =
          localStorage.getItem("terra_serviceType") || "DINE_IN";
        const nowIso = new Date().toISOString();
        let resolvedOrderStatus = "Confirmed";

        try {
          const orderRes = await fetch(`${nodeApi}/api/orders/${resolvedOrderId}`);
          if (orderRes.ok) {
            const latestOrder = await orderRes.json();
            const latestStatus = String(latestOrder?.status || "").trim();
            if (latestStatus) {
              resolvedOrderStatus = latestStatus;
            }
          }
        } catch (error) {
          console.warn("[Payment] Unable to fetch latest order status after cash choice:", error);
        }

        localStorage.setItem("terra_orderId", resolvedOrderId);
        localStorage.setItem("terra_orderStatus", resolvedOrderStatus);
        localStorage.setItem("terra_orderStatusUpdatedAt", nowIso);
        localStorage.removeItem("terra_lastPaidOrderId");

        if (
          currentServiceType === "TAKEAWAY" ||
          currentServiceType === "PICKUP" ||
          currentServiceType === "DELIVERY"
        ) {
          localStorage.setItem("terra_orderId_TAKEAWAY", resolvedOrderId);
          localStorage.setItem("terra_orderStatus_TAKEAWAY", resolvedOrderStatus);
          localStorage.setItem("terra_orderStatusUpdatedAt_TAKEAWAY", nowIso);
        } else {
          localStorage.setItem("terra_orderId_DINE_IN", resolvedOrderId);
          localStorage.setItem("terra_orderStatus_DINE_IN", resolvedOrderStatus);
          localStorage.setItem("terra_orderStatusUpdatedAt_DINE_IN", nowIso);
        }

        setOrderId(resolvedOrderId);
        setHasHandledPayment(true);
        clearPaymentGate();
        clearScopedCart(currentServiceType);
        navigate("/menu");
      }
    } catch (err) {
      alert(err.message || "Unable to create payment");
    } finally {
      setCreating(false);
    }
  };

  // Keep order pending when customer goes back without paying.
  // Allow returning to menu even for payment-compulsory flows.
  const handleBackWithoutPayment = useCallback(async () => {
    if (!orderId) {
      clearDeferredOrderDraft();
      clearPaymentGate();
      navigate("/menu");
      return;
    }

    if (hasHandledPayment || payment?.status === "PAID") {
      clearDeferredOrderDraft();
      clearPaymentGate();
      navigate("/menu");
      return;
    }

    // If a payment intent exists, cancel it before leaving (best effort).
    if (payment?.id) {
      try {
        await fetch(`${nodeApi}/api/payments/${payment.id}/cancel`, {
          method: "POST",
        });
      } catch (err) {
        console.warn("[Payment] Cancel payment on menu back:", err);
      }
    }

    if (isPaymentGateCurrentOrder) {
      try {
        const currentServiceType =
          localStorage.getItem("terra_serviceType") || "DINE_IN";
        const isTakeawayLike =
          currentServiceType === "TAKEAWAY" ||
          currentServiceType === "PICKUP" ||
          currentServiceType === "DELIVERY";
        const sessionToken = isTakeawayLike
          ? localStorage.getItem("terra_takeaway_sessionToken")
          : localStorage.getItem("terra_sessionToken");

        const res = await fetch(`${nodeApi}/api/orders/${orderId}/customer-status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(sessionToken
              ? {
                  "x-session-token": sessionToken,
                }
              : {}),
          },
          body: JSON.stringify({
            status: "Cancelled",
            reason: "Customer exited before payment completion",
            sessionToken: sessionToken || undefined,
          }),
        });

        if (!res.ok) {
          console.warn(
            `[Payment] Failed to cancel payment-gated order ${orderId} on back-to-menu.`
          );
        }
      } catch (err) {
        console.warn("[Payment] Cancel unpaid order on menu back:", err);
      }

      clearOrderStorageForCurrentFlow();
      clearDeferredOrderDraft();
      clearPaymentGate();
      navigate("/menu");
      return;
    }

    navigate("/menu");
  }, [
    orderId,
    hasHandledPayment,
    payment?.status,
    payment?.id,
    isPaymentGateCurrentOrder,
    clearDeferredOrderDraft,
    clearPaymentGate,
    clearOrderStorageForCurrentFlow,
    navigate,
  ]);

  const handleCancelPayment = async () => {
    if (!payment?.id) return;
    const confirmCancel = await window.confirm(
      t("cancelPayment") || "Cancel current payment?"
    );
    if (!confirmCancel) return;
    setCanceling(true);
    try {
      const res = await fetch(`${nodeApi}/api/payments/${payment.id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          const text = await res.text().catch(() => "Unknown error");
          throw new Error(`Failed to cancel payment: ${text}`);
        }
        throw new Error(data?.message || "Unable to cancel payment");
      }
      setPayment(null);
    } catch (err) {
      alert(err.message || "Unable to cancel payment");
    } finally {
      setCanceling(false);
    }
  };

  const renderPaymentStatus = () => {
    if (!payment) return null;

    if (payment.status === "PAID") {
      return (
        <div className="payment-status-card success">
          <p className="payment-status-title">{t("paidMessage")}</p>
          <button
            className="payment-button primary"
            onClick={handleCompleteAndRedirect}
          >
            {t("viewOrder")}
          </button>
        </div>
      );
    }

    if (["CANCELLED", "FAILED"].includes(payment?.status)) {
      return (
        <div className="payment-status-card warning">
          <p className="payment-status-title">
            {payment?.status === "FAILED"
              ? "Payment failed"
              : "Payment cancelled"}
          </p>
          <button
            className="payment-button primary"
            onClick={() => setPayment(null)}
          >
            {t("retryPayment")}
          </button>
        </div>
      );
    }

    const showOnline = payment?.method === "ONLINE";
    const showCash =
      payment?.method === "CASH" || payment?.status === "CASH_PENDING";
    const isRazorpayOnline = showOnline && isRazorpayPayment(payment);
    const shouldShowQrSection = showCash || (showOnline && !isRazorpayOnline);
    const hasUploadedQr = Boolean(uploadedQR?.qrImageUrl);
    const parsedPaymentUpi = parseUpiPayload(payment?.upiPayload);
    const resolvedUpiId = (
      uploadedQR?.upiId ||
      parsedPaymentUpi?.upiId ||
      ""
    ).trim();
    const resolvedPayeeName = (
      uploadedQR?.gatewayName ||
      parsedPaymentUpi?.payeeName ||
      ""
    ).trim();
    const upiLaunchUrl =
      payment?.upiPayload ||
      buildFallbackUpiPayload({
        upiId: resolvedUpiId,
        payeeName: resolvedPayeeName,
        amount: payment?.amount,
        orderId: payment?.orderId || orderId,
      });
    const hasGeneratedUpiQr = Boolean(upiLaunchUrl);
    const canOpenUpi = showOnline && !isRazorpayOnline && Boolean(upiLaunchUrl);

    return (
      <div className="payment-status-card">
        <p className="payment-status-title">
          {showCash ? t("cashPendingTitle") : t("pendingPaymentTitle")}
        </p>
        <p className="payment-status-text">
          {showCash
            ? t("cashInstructions")
            : isRazorpayOnline
              ? "Tap Pay with Razorpay to complete your payment."
              : t("onlineInstructions")}
        </p>

        {shouldShowQrSection && (hasUploadedQr || hasGeneratedUpiQr) && (
          <div className="payment-qr-wrapper">
            {hasUploadedQr ? (
              // Show QR code uploaded from cart admin payment panel (clickable when we have UPI payload)
              <>
                {canOpenUpi ? (
                  <button
                    type="button"
                    className="payment-qr-clickable"
                    onClick={() => {
                      if (upiLaunchUrl) window.location.href = upiLaunchUrl;
                    }}
                    title={t("payNow")}
                  >
                    <img
                      src={qrImageSrc(uploadedQR.qrImageUrl)}
                      alt="Payment QR Code"
                      style={{
                        maxWidth: "180px",
                        maxHeight: "180px",
                        width: "auto",
                        height: "auto",
                      }}
                    />
                  </button>
                ) : (
                  <img
                    src={qrImageSrc(uploadedQR.qrImageUrl)}
                    alt="Payment QR Code"
                    style={{
                      maxWidth: "180px",
                      maxHeight: "180px",
                      width: "auto",
                      height: "auto",
                    }}
                  />
                )}
                {(resolvedPayeeName || resolvedUpiId) && (
                  <div className="text-sm text-slate-600 mt-2">
                    {resolvedPayeeName && (
                      <p>
                        QR Owner: <strong>{resolvedPayeeName}</strong>
                      </p>
                    )}
                    {resolvedUpiId && (
                      <p>
                        UPI ID: <strong>{resolvedUpiId}</strong>
                      </p>
                    )}
                  </div>
                )}
                {canOpenUpi && (
                  <div className="payment-upi-app-buttons">
                    <button
                      type="button"
                      className="payment-button payment-button-upi-open"
                      onClick={() => {
                        if (upiLaunchUrl) window.location.href = upiLaunchUrl;
                      }}
                    >
                      {t("payNow")}
                    </button>
                    <div className="payment-upi-app-row">
                      <button
                        type="button"
                        className="payment-button payment-button-phonepe"
                        onClick={() => {
                          const url = getUpiAppUrl(upiLaunchUrl, "phonepe");
                          if (url) window.location.href = url;
                        }}
                      >
                        {t("payWithPhonePe")}
                      </button>
                      <button
                        type="button"
                        className="payment-button payment-button-paytm"
                        onClick={() => {
                          const url = getUpiAppUrl(upiLaunchUrl, "paytmmp");
                          if (url) window.location.href = url;
                        }}
                      >
                        {t("payWithPaytm")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : showOnline && hasGeneratedUpiQr ? (
              // Fallback: generated QR (clickable) + direct pay buttons
              <>
                <button
                  type="button"
                  className="payment-qr-clickable"
                  onClick={() => {
                    if (upiLaunchUrl) window.location.href = upiLaunchUrl;
                  }}
                  title={t("payNow")}
                >
                  <QRCode value={upiLaunchUrl} size={180} />
                </button>
                {(resolvedPayeeName || resolvedUpiId) && (
                  <div className="text-sm text-slate-600 mt-2">
                    {resolvedPayeeName && (
                      <p>
                        QR Owner: <strong>{resolvedPayeeName}</strong>
                      </p>
                    )}
                    {resolvedUpiId && (
                      <p>
                        UPI ID: <strong>{resolvedUpiId}</strong>
                      </p>
                    )}
                  </div>
                )}
                <div className="payment-upi-app-buttons">
                  <button
                    type="button"
                    className="payment-button payment-button-upi-open"
                    onClick={() => {
                      if (upiLaunchUrl) window.location.href = upiLaunchUrl;
                    }}
                  >
                    {t("payNow")}
                  </button>
                  <div className="payment-upi-app-row">
                    <button
                      type="button"
                      className="payment-button payment-button-phonepe"
                      onClick={() => {
                        const url = getUpiAppUrl(upiLaunchUrl, "phonepe");
                        if (url) window.location.href = url;
                      }}
                    >
                      {t("payWithPhonePe")}
                    </button>
                    <button
                      type="button"
                      className="payment-button payment-button-paytm"
                      onClick={() => {
                        const url = getUpiAppUrl(upiLaunchUrl, "paytmmp");
                        if (url) window.location.href = url;
                      }}
                    >
                      {t("payWithPaytm")}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        <div className="payment-action-buttons">
          {isRazorpayOnline && (
            <button
              className={`payment-button primary ${
                verifyingRazorpay ? "disabled" : ""
              }`}
              onClick={() => launchRazorpayCheckout(payment)}
              disabled={verifyingRazorpay}
            >
              {verifyingRazorpay ? "Verifying..." : "Pay with Razorpay"}
            </button>
          )}
          <button
            className={`payment-button danger ${canceling ? "disabled" : ""}`}
            onClick={handleCancelPayment}
            disabled={canceling}
          >
            {canceling ? t("cancellingPayment") : t("cancelPayment")}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`payment-container ${
        accessibilityMode ? "accessibility-mode" : ""
      }`}
    >
      <button
        onClick={() => {
          const unpaidOrder =
            orderId && !hasHandledPayment && payment?.status !== "PAID";

          if (!unpaidOrder) {
            navigate(-1);
            return;
          }

          handleBackWithoutPayment();
        }}
        disabled={canceling}
        className={`back-button ${
          accessibilityMode ? "accessibility-mode" : ""
        }`}
      >
        <FaArrowLeft size={18} />
      </button>

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`payment-card ${
          accessibilityMode ? "accessibility-mode" : ""
        }`}
      >
        <h2
          className={`payment-title ${
            accessibilityMode ? "accessibility-mode" : ""
          }`}
        >
          {t("choosePayment")}
        </h2>

        {loading ? (
          <div className="payment-status-card">
            <p className="payment-status-title">Loading payment details...</p>
          </div>
        ) : payment ? (
          renderPaymentStatus()
        ) : (
          <div className="payment-options">
            {paymentModeHint && (
              <p className="payment-status-text" style={{ marginBottom: "8px" }}>
                {paymentModeHint}
              </p>
            )}
            <p className="payment-status-text">
              Choose how you'd like to complete your payment.
            </p>
            <div className="payment-buttons">
              {showOnlineOption && (
                <motion.button
                  whileHover={{ scale: creating ? 1 : 1.03 }}
                  whileTap={{ scale: creating ? 1 : 0.97 }}
                  onClick={() => createPaymentIntent("ONLINE")}
                  disabled={creating}
                  className={`payment-button ${
                    accessibilityMode ? "accessibility-mode" : ""
                  }`}
                >
                  <FaQrcode size={20} />
                  {creating ? "Starting..." : t("createOnline")}
                </motion.button>
              )}
              {showCashOption && (
                <motion.button
                  whileHover={{ scale: creating ? 1 : 1.03 }}
                  whileTap={{ scale: creating ? 1 : 0.97 }}
                  onClick={() => createPaymentIntent("CASH")}
                  disabled={creating}
                  className={`payment-button ${
                    accessibilityMode ? "accessibility-mode" : ""
                  }`}
                >
                  <FaMoneyBillWave size={20} />
                  {creating ? "Starting..." : t("createCash")}
                </motion.button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
