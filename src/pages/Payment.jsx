import { useCallback, useEffect, useMemo, useState } from "react";
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

const extractUpiIdFromPayload = (payload) => {
  if (!payload || typeof payload !== "string") return "";
  const match = payload.match(/[?&]pa=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
};

const parseAmountCandidates = (text) => {
  if (!text) return [];
  const matches = text.match(/\d+(?:[.,]\d{1,2})?/g) || [];
  const values = matches
    .map((value) => Number(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1000000);
  return [...new Set(values)];
};

const extractReferenceId = (text) => {
  if (!text) return "";
  const patterns = [
    /utr[\s:.-]*([a-z0-9]{8,})/i,
    /upi[\s]*(?:ref(?:erence)?|id)?[\s:.-]*([a-z0-9]{8,})/i,
    /txn[\s]*(?:id|no|number)?[\s:.-]*([a-z0-9]{8,})/i,
    /ref(?:erence)?[\s]*(?:id|no|number)?[\s:.-]*([a-z0-9]{8,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  const longDigit = text.match(/\b\d{10,18}\b/);
  return longDigit ? longDigit[0] : "";
};

const validateReceiptText = ({ rawText, amount, upiId, orderId }) => {
  const normalizedText = String(rawText || "").toLowerCase();
  const expectedAmount = Number(amount || 0);
  const amountCandidates = parseAmountCandidates(normalizedText);
  const amountMatch = amountCandidates.find(
    (candidate) => Math.abs(candidate - expectedAmount) <= 1
  );

  const successKeywords = [
    "success",
    "successful",
    "paid",
    "completed",
    "debited",
    "credited",
    "transaction",
    "upi",
  ];
  const failureKeywords = ["failed", "failure", "reversed", "declined", "pending"];

  const successCount = successKeywords.reduce(
    (count, keyword) => count + (normalizedText.includes(keyword) ? 1 : 0),
    0
  );
  const hasFailureKeyword = failureKeywords.some((keyword) =>
    normalizedText.includes(keyword)
  );

  const expectedUpiId = String(upiId || "").trim().toLowerCase();
  const upiMatched =
    expectedUpiId.length > 0 && normalizedText.includes(expectedUpiId);

  const referenceId = extractReferenceId(normalizedText);
  const orderTail = String(orderId || "").slice(-5).toLowerCase();
  const orderHintMatched =
    orderTail.length >= 4 ? normalizedText.includes(orderTail) : false;

  let score = 0;
  if (amountMatch) score += 2;
  if (referenceId) score += 1;
  if (upiMatched) score += 1;
  if (successCount > 0) score += 1;
  if (orderHintMatched) score += 1;
  if (hasFailureKeyword) score -= 2;

  return {
    amountMatched: Boolean(amountMatch),
    detectedAmount: amountMatch || null,
    referenceId,
    upiMatched,
    successCount,
    hasFailureKeyword,
    orderHintMatched,
    isValid: Boolean(amountMatch) && score >= 3 && !hasFailureKeyword,
  };
};

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
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrResult, setOcrResult] = useState(null);

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
  const expectedUpiId = useMemo(
    () => uploadedQR?.upiId || extractUpiIdFromPayload(payment?.upiPayload),
    [uploadedQR?.upiId, payment?.upiPayload]
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

  useEffect(() => {
    return () => {
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
      }
    };
  }, [receiptPreview]);

  useEffect(() => {
    setReceiptFile(null);
    setReceiptPreview("");
    setOcrError("");
    setOcrResult(null);
  }, [payment?.id]);

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

  const handleReceiptFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (receiptPreview) {
      URL.revokeObjectURL(receiptPreview);
    }
    setReceiptFile(file);
    setOcrResult(null);
    setOcrError("");
    if (!file) {
      setReceiptPreview("");
      return;
    }
    setReceiptPreview(URL.createObjectURL(file));
  };

  const handleScanReceipt = async () => {
    if (!receiptFile || !payment) {
      setOcrError("Please upload a receipt image first.");
      return;
    }

    setOcrLoading(true);
    setOcrError("");
    try {
      const Tesseract = await import("tesseract.js");
      const result = await Tesseract.recognize(receiptFile, "eng", {
        logger: () => {},
      });
      const rawText = String(result?.data?.text || "").trim();
      if (!rawText) {
        throw new Error("No readable text found in receipt image.");
      }

      const validation = validateReceiptText({
        rawText,
        amount: payment.amount,
        upiId: expectedUpiId,
        orderId,
      });
      setOcrResult({
        ...validation,
        rawText,
      });
    } catch (err) {
      setOcrResult(null);
      setOcrError(
        err?.message ||
          "Could not scan receipt. Please upload a clear screenshot."
      );
    } finally {
      setOcrLoading(false);
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
              // Show QR code uploaded from cart admin payment panel
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
                {showOnline && payment?.upiPayload && (
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
            ) : showOnline && payment?.upiPayload ? (
              // Fallback to generated QR code from UPI payload for online method
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

        {showOnline && (
          <div className="receipt-ocr-wrapper">
            <p className="receipt-ocr-title">Receipt Validation (OCR)</p>
            <p className="receipt-ocr-subtitle">
              Upload your UPI payment receipt screenshot to auto-check if it
              looks valid.
            </p>

            <input
              type="file"
              accept="image/*"
              onChange={handleReceiptFileChange}
              className="receipt-file-input"
            />

            {receiptPreview && (
              <img
                src={receiptPreview}
                alt="Uploaded receipt preview"
                className="receipt-preview-image"
              />
            )}

            <button
              type="button"
              onClick={handleScanReceipt}
              disabled={!receiptFile || ocrLoading}
              className={`payment-button secondary ${
                !receiptFile || ocrLoading ? "disabled" : ""
              }`}
            >
              {ocrLoading ? "Scanning receipt..." : "Scan receipt"}
            </button>

            {ocrError && <p className="receipt-ocr-error">{ocrError}</p>}

            {ocrResult && (
              <div
                className={`receipt-ocr-result ${
                  ocrResult.isValid ? "valid" : "review"
                }`}
              >
                <p className="receipt-ocr-result-title">
                  {ocrResult.isValid
                    ? "Receipt looks valid"
                    : "Receipt needs manual review"}
                </p>
                <div className="receipt-ocr-checks">
                  <p>
                    Amount match:{" "}
                    <strong>
                      {ocrResult.amountMatched
                        ? `Yes (Rs ${Number(
                            ocrResult.detectedAmount || 0
                          ).toFixed(2)})`
                        : "No"}
                    </strong>
                  </p>
                  <p>
                    Transaction reference:{" "}
                    <strong>{ocrResult.referenceId || "Not found"}</strong>
                  </p>
                  <p>
                    UPI ID match:{" "}
                    <strong>{ocrResult.upiMatched ? "Yes" : "No"}</strong>
                  </p>
                </div>

                <details className="receipt-ocr-text-block">
                  <summary>View extracted text</summary>
                  <pre>{ocrResult.rawText}</pre>
                </details>
              </div>
            )}
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
