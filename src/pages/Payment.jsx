import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FaQrcode, FaMoneyBillWave, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import translations from "../data/translations/payment.json";
import "./Payment.css";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

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

export default function Payment() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadedQR, setUploadedQR] = useState(null);
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  // Track if we've already handled payment completion to prevent re-render loops
  const [hasHandledPayment, setHasHandledPayment] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  // Memoize language and translation function to prevent re-renders
  const language = useMemo(
    () => localStorage.getItem("language") || "en",
    []
  );
  const t = useCallback(
    (key) => translations[language]?.[key] || key,
    [language]
  );

  // Memoize serviceType and orderId to prevent unnecessary re-renders
  const serviceType = useMemo(
    () => localStorage.getItem("terra_serviceType") || "DINE_IN",
    []
  );
  const orderId = useMemo(() => {
    const currentServiceType = localStorage.getItem("terra_serviceType") || "DINE_IN";
    return currentServiceType === "TAKEAWAY"
      ? localStorage.getItem("terra_orderId_TAKEAWAY") ||
        localStorage.getItem("terra_orderId")
      : localStorage.getItem("terra_orderId");
  }, []);

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
      if (orderId) queryParams.set("orderId", orderId);
      const cartScopeId = resolveCartScopeId();
      if (cartScopeId) queryParams.set("cartId", cartScopeId);
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

  const handleCompleteAndRedirect = useCallback(() => {
    // Prevent multiple calls
    if (hasHandledPayment) {
      console.log("[Payment] Payment already handled, skipping");
      return;
    }
    
    setHasHandledPayment(true);
    
    if (orderId) {
      // CRITICAL: Preserve orderId so Menu page can display order data
      localStorage.setItem("terra_orderId", orderId);
      localStorage.setItem("terra_orderStatus", "Paid");
      localStorage.setItem(
        "terra_orderStatusUpdatedAt",
        new Date().toISOString()
      );
      localStorage.setItem("terra_lastPaidOrderId", orderId);

      // Also set service-type-specific keys if needed
      const currentServiceType =
        localStorage.getItem("terra_serviceType") || "DINE_IN";
      const orderType = localStorage.getItem("terra_orderType") || null; // PICKUP or DELIVERY
      const isPickupOrDelivery = orderType === "PICKUP" || orderType === "DELIVERY";
      
      if (currentServiceType === "TAKEAWAY" || currentServiceType === "PICKUP" || currentServiceType === "DELIVERY") {
        localStorage.setItem("terra_orderId_TAKEAWAY", orderId);
        localStorage.setItem("terra_orderStatus_TAKEAWAY", "Paid");
        localStorage.setItem(
          "terra_orderStatusUpdatedAt_TAKEAWAY",
          new Date().toISOString()
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
        localStorage.setItem("terra_orderStatus_DINE_IN", "Paid");
        localStorage.setItem(
          "terra_orderStatusUpdatedAt_DINE_IN",
          new Date().toISOString()
        );
      }
    }
    // Only remove cart, keep order data
    localStorage.removeItem("terra_cart");
    
    // CRITICAL: Set flag to indicate payment was completed
    // This will trigger session clearing when user scans a new table QR after refresh
    localStorage.setItem("terra_paymentCompleted", "true");
    console.log("[Payment] Payment completed - flag set for session clearing on next table scan");
    
    navigate("/menu");
  }, [orderId, navigate, hasHandledPayment]);

  useEffect(() => {
    if (!orderId) {
      alert(t("noOrderFound") || "No order found for payment.");
      navigate("/menu");
      return;
    }
    fetchLatestPayment();
    fetchUploadedQR();
  }, [orderId, fetchLatestPayment, fetchUploadedQR, navigate, t]);

  useEffect(() => {
    if (!paymentPending) return;
    const interval = setInterval(() => {
      fetchLatestPayment();
    }, 10000);
    return () => clearInterval(interval);
  }, [paymentPending, fetchLatestPayment]);

  useEffect(() => {
    // Only handle payment completion once and only if status is PAID
    if (payment?.status === "PAID" && !hasHandledPayment) {
      handleCompleteAndRedirect();
    }
  }, [payment?.status, handleCompleteAndRedirect, hasHandledPayment]);

  const createPaymentIntent = async (method) => {
    if (!orderId) return;
    setCreating(true);
    try {
      const res = await fetch(`${nodeApi}/api/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Unable to create payment");
      }
      setPayment(data);
    } catch (err) {
      alert(err.message || "Unable to create payment");
    } finally {
      setCreating(false);
    }
  };

  // For takeaway only: cancel the order when user goes back without paying (so order is not "placed")
  const handleBackWithoutPayment = useCallback(async () => {
    const isTakeaway =
      serviceType === "TAKEAWAY" ||
      serviceType === "PICKUP" ||
      serviceType === "DELIVERY";
    if (
      !isTakeaway ||
      !orderId ||
      hasHandledPayment ||
      payment?.status === "PAID"
    ) {
      navigate("/menu");
      return;
    }
    setCancellingOrder(true);
    try {
      const sessionToken =
        localStorage.getItem("terra_takeaway_sessionToken") || undefined;
      const res = await fetch(
        `${nodeApi}/api/orders/${orderId}/customer-status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "Cancelled",
            sessionToken,
            reason: "Customer left payment without paying",
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("[Payment] Cancel order failed:", data?.message || res.status);
      }
    } catch (err) {
      console.warn("[Payment] Cancel order error:", err);
    } finally {
      localStorage.removeItem("terra_orderId_TAKEAWAY");
      localStorage.removeItem("terra_orderStatus_TAKEAWAY");
      localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
      localStorage.removeItem("terra_takeaway_sessionToken");
      if (localStorage.getItem("terra_orderId") === orderId) {
        localStorage.removeItem("terra_orderId");
      }
      setCancellingOrder(false);
      navigate("/menu");
    }
  }, [
    serviceType,
    orderId,
    hasHandledPayment,
    payment?.status,
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

  // Back to payment method selection (cancel current payment intent, no confirm). Used when user clicks back from QR/Cash screen.
  const handleBackToMethodSelection = useCallback(async () => {
    if (!payment?.id) {
      setPayment(null);
      return;
    }
    setCanceling(true);
    try {
      await fetch(`${nodeApi}/api/payments/${payment.id}/cancel`, {
        method: "POST",
      });
    } catch (err) {
      console.warn("[Payment] Cancel payment on back:", err);
    } finally {
      setPayment(null);
      setCanceling(false);
    }
  }, [payment?.id]);

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
    const shouldShowQrSection = showOnline || showCash;
    const hasUploadedQr = Boolean(uploadedQR?.qrImageUrl);
    const hasGeneratedUpiQr = Boolean(payment?.upiPayload);

    return (
      <div className="payment-status-card">
        <p className="payment-status-title">
          {showCash ? t("cashPendingTitle") : t("pendingPaymentTitle")}
        </p>
        <p className="payment-status-text">
          {showCash ? t("cashInstructions") : t("onlineInstructions")}
        </p>

        {shouldShowQrSection && (hasUploadedQr || hasGeneratedUpiQr) && (
          <div className="payment-qr-wrapper">
            {hasUploadedQr ? (
              // Show QR code uploaded from cart admin payment panel (clickable when we have UPI payload)
              <>
                {showOnline && payment?.upiPayload ? (
                  <button
                    type="button"
                    className="payment-qr-clickable"
                    onClick={() => {
                      if (payment?.upiPayload) window.location.href = payment.upiPayload;
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
                {uploadedQR.upiId && (
                  <p className="text-sm text-slate-600 mt-2">
                    UPI ID: <strong>{uploadedQR.upiId}</strong>
                  </p>
                )}
                {showOnline && payment?.upiPayload && (
                  <div className="payment-upi-app-buttons">
                    <button
                      type="button"
                      className="payment-button payment-button-upi-open"
                      onClick={() => {
                        if (payment?.upiPayload) window.location.href = payment.upiPayload;
                      }}
                    >
                      {t("payNow")}
                    </button>
                    <div className="payment-upi-app-row">
                      <button
                        type="button"
                        className="payment-button payment-button-phonepe"
                        onClick={() => {
                          const url = getUpiAppUrl(payment.upiPayload, "phonepe");
                          if (url) window.location.href = url;
                        }}
                      >
                        {t("payWithPhonePe")}
                      </button>
                      <button
                        type="button"
                        className="payment-button payment-button-paytm"
                        onClick={() => {
                          const url = getUpiAppUrl(payment.upiPayload, "paytmmp");
                          if (url) window.location.href = url;
                        }}
                      >
                        {t("payWithPaytm")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : showOnline && payment?.upiPayload ? (
              // Fallback: generated QR (clickable) + direct pay buttons
              <>
                <button
                  type="button"
                  className="payment-qr-clickable"
                  onClick={() => {
                    if (payment?.upiPayload) window.location.href = payment.upiPayload;
                  }}
                  title={t("payNow")}
                >
                  <QRCode value={payment.upiPayload} size={180} />
                </button>
                <div className="payment-upi-app-buttons">
                  <button
                    type="button"
                    className="payment-button payment-button-upi-open"
                    onClick={() => {
                      if (payment?.upiPayload) window.location.href = payment.upiPayload;
                    }}
                  >
                    {t("payNow")}
                  </button>
                  <div className="payment-upi-app-row">
                    <button
                      type="button"
                      className="payment-button payment-button-phonepe"
                      onClick={() => {
                        const url = getUpiAppUrl(payment.upiPayload, "phonepe");
                        if (url) window.location.href = url;
                      }}
                    >
                      {t("payWithPhonePe")}
                    </button>
                    <button
                      type="button"
                      className="payment-button payment-button-paytm"
                      onClick={() => {
                        const url = getUpiAppUrl(payment.upiPayload, "paytmmp");
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
          const isTakeaway =
            serviceType === "TAKEAWAY" ||
            serviceType === "PICKUP" ||
            serviceType === "DELIVERY";
          if (isTakeaway && orderId && !hasHandledPayment) {
            // If user already chose a method (QR/Cash) and is on that screen, back = return to method selection
            if (payment?.id) {
              handleBackToMethodSelection();
            } else {
              handleBackWithoutPayment();
            }
          } else {
            navigate(-1);
          }
        }}
        disabled={cancellingOrder || canceling}
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
            <p className="payment-status-title">Loading payment details…</p>
          </div>
        ) : payment ? (
          renderPaymentStatus()
        ) : (
          <div className="payment-options">
            <p className="payment-status-text">
              Choose how you’d like to complete your payment.
            </p>
            <div className="payment-buttons">
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
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
