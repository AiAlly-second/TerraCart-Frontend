import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { FaQrcode, FaMoneyBillWave, FaArrowLeft } from "react-icons/fa";
import { MdPayments } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import translations from "../data/translations/payment.json";
import "./Payment.css";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

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

  const language = localStorage.getItem("language") || "en";
  const t = useCallback(
    (key) => translations[language]?.[key] || key,
    [language]
  );

  // Read current order ID from localStorage (service-type aware)
  const serviceType = localStorage.getItem("terra_serviceType") || "DINE_IN";
  const orderId =
    serviceType === "TAKEAWAY"
      ? localStorage.getItem("terra_orderId_TAKEAWAY") ||
        localStorage.getItem("terra_orderId")
      : localStorage.getItem("terra_orderId");

  const paymentPending = useMemo(
    () =>
      payment &&
      payment.status &&
      ["PENDING", "PROCESSING", "CASH_PENDING"].includes(payment.status),
    [payment]
  );

  const fetchLatestPayment = useCallback(
    async (signal) => {
      if (!orderId) return;
      try {
        setLoading(true);
        const res = await fetch(
          `${nodeApi}/api/payments/order/${orderId}/latest`,
          { signal }
        );
        // Handle both 200 (with null) and 404 gracefully - both mean no payment exists yet
        if (res.status === 404) {
          setPayment(null);
          return;
        }
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.message || "Failed to fetch payment status"
          );
        }
        const data = await res.json();
        // Backend now returns null instead of 404 when no payment exists
        setPayment(data || null);
      } catch (err) {
        // Ignore AbortError (request was cancelled)
        if (err.name === "AbortError") {
          return;
        }
        // Silently handle expected "not found" scenarios
        if (
          err.message?.includes("404") ||
          err.message?.includes("not found")
        ) {
          setPayment(null);
        } else {
          if (import.meta.env.DEV) {
            console.warn("Failed to fetch payment:", err);
          }
          setPayment(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [orderId]
  );

  const fetchUploadedQR = useCallback(async (signal) => {
    try {
      const res = await fetch(`${nodeApi}/api/payment-qr/active`, { signal });
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
      // Ignore AbortError (request was cancelled)
      if (err.name === "AbortError") {
        return;
      }
      // Silently handle expected "not found" scenarios - no uploaded QR is okay
      setUploadedQR(null);
    }
  }, []);

  // Use ref to track if we're already fetching to prevent duplicate requests
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!orderId) {
      alert(t("noOrderFound") || "No order found for payment.");
      navigate("/menu");
      return;
    }

    // Prevent duplicate simultaneous requests
    if (fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;

    // Create AbortController to cancel requests if component unmounts or orderId changes
    const abortController = new AbortController();
    const signal = abortController.signal;

    // Fetch payment and QR code in parallel
    Promise.all([
      fetchLatestPayment(signal).catch(() => {}),
      fetchUploadedQR(signal).catch(() => {}),
    ]).finally(() => {
      fetchingRef.current = false;
    });

    // Cleanup: abort requests if component unmounts or dependencies change
    return () => {
      fetchingRef.current = false;
      abortController.abort();
    };
  }, [orderId, fetchLatestPayment, fetchUploadedQR, navigate, t]);

  useEffect(() => {
    if (!paymentPending) return;

    // Create AbortController for interval requests
    const abortController = new AbortController();
    const signal = abortController.signal;

    const interval = setInterval(() => {
      fetchLatestPayment(signal);
    }, 10000);

    // Cleanup: clear interval and abort pending requests
    return () => {
      clearInterval(interval);
      abortController.abort();
    };
  }, [paymentPending, fetchLatestPayment]);

  const handleCompleteAndRedirect = useCallback(() => {
    if (orderId) {
      // CRITICAL: Preserve orderId so Menu page can display order data
      localStorage.setItem("terra_orderId", orderId);
      localStorage.setItem("terra_orderStatus", "Paid");
      localStorage.setItem(
        "terra_orderStatusUpdatedAt",
        new Date().toISOString()
      );
      localStorage.setItem("terra_lastPaidOrderId", orderId);
      // Set flag to show invoice automatically when redirected to menu
      localStorage.setItem("terra_showInvoiceOnLoad", "true");

      // Also set service-type-specific keys if needed
      const serviceType =
        localStorage.getItem("terra_serviceType") || "DINE_IN";
      if (serviceType === "TAKEAWAY") {
        localStorage.setItem("terra_orderId_TAKEAWAY", orderId);
        localStorage.setItem("terra_orderStatus_TAKEAWAY", "Paid");
        localStorage.setItem(
          "terra_orderStatusUpdatedAt_TAKEAWAY",
          new Date().toISOString()
        );

        // CRITICAL: Clear takeaway customer data after order is paid
        // This ensures new customers don't see previous customer's data
        localStorage.removeItem("terra_takeaway_customerName");
        localStorage.removeItem("terra_takeaway_customerMobile");
        localStorage.removeItem("terra_takeaway_customerEmail");
        if (import.meta.env.DEV) {
          console.log("[Payment] Cleared takeaway customer data after payment");
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
    navigate("/menu");
  }, [orderId, navigate]);

  useEffect(() => {
    if (payment?.status === "PAID") {
      handleCompleteAndRedirect();
    }
  }, [payment?.status, handleCompleteAndRedirect]);

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

    return (
      <div className="payment-status-card">
        <p className="payment-status-title">
          {showCash ? t("cashPendingTitle") : t("pendingPaymentTitle")}
        </p>
        <p className="payment-status-text">
          {showCash ? t("cashInstructions") : t("onlineInstructions")}
        </p>

        {showOnline && (
          <div className="payment-qr-wrapper">
            {uploadedQR ? (
              // Show uploaded QR code image
              <>
                <img
                  src={`${nodeApi}${uploadedQR.qrImageUrl}`}
                  alt="Payment QR Code"
                  style={{
                    maxWidth: "180px",
                    maxHeight: "180px",
                    width: "auto",
                    height: "auto",
                  }}
                />
                {uploadedQR.upiId && (
                  <p className="text-sm text-slate-600 mt-2">
                    UPI ID: <strong>{uploadedQR.upiId}</strong>
                  </p>
                )}
                {payment?.upiPayload && (
                  <>
                    <textarea
                      className="payment-qr-text"
                      readOnly
                      value={payment.upiPayload}
                      rows={3}
                    />
                    <button
                      className="payment-button secondary"
                      onClick={() =>
                        payment?.upiPayload &&
                        navigator.clipboard.writeText(payment.upiPayload)
                      }
                    >
                      Copy UPI string
                    </button>
                  </>
                )}
              </>
            ) : payment?.upiPayload ? (
              // Fallback to generated QR code from UPI payload
              <>
                <QRCode value={payment.upiPayload} size={180} />
                <textarea
                  className="payment-qr-text"
                  readOnly
                  value={payment.upiPayload}
                  rows={3}
                />
                <button
                  className="payment-button secondary"
                  onClick={() =>
                    payment?.upiPayload &&
                    navigator.clipboard.writeText(payment.upiPayload)
                  }
                >
                  Copy UPI string
                </button>
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
        onClick={() => navigate(-1)}
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

              <motion.button
                whileHover={{ scale: creating ? 1 : 1.03 }}
                whileTap={{ scale: creating ? 1 : 0.97 }}
                onClick={() => createPaymentIntent("ONLINE")}
                disabled={creating}
                className={`payment-button ${
                  accessibilityMode ? "accessibility-mode" : ""
                }`}
              >
                <MdPayments size={20} />
                {creating ? "Starting..." : t("payOnline")}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
