import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import OrderStatus from "../components/OrderStatus";
import bgImage from "../assets/images/restaurant-img.jpg";
import translations from "../data/translations/orderSummary.json";
import floatingButtonTranslations from "../data/translations/floatingButtons.json";
import io from "socket.io-client";
import "./OrderSummary.css";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

/* helpers */
// Convert paise to rupees
const paiseToRupees = (paise) => {
  if (paise === undefined || paise === null) return 0;
  const num = Number(paise);
  if (Number.isNaN(num)) return 0;
  return num / 100;
};

const mergeKotLines = (kotLines = []) => {
  const collapsed = {};
  kotLines.forEach((kot) => {
    (kot?.items || []).forEach((item) => {
      if (!item) return;
      const key = item.name || "Item";
      if (!collapsed[key]) {
        collapsed[key] = {
          name: key,
          quantity: 0,
          returnedQuantity: 0,
          price: item.price || 0, // Price in paise
          returned: false,
        };
      }
      const entry = collapsed[key];
      if (item.returned) {
        entry.returnedQuantity += Number(item.quantity) || 0;
        entry.returned = true;
      } else {
        entry.quantity += Number(item.quantity) || 0;
      }
      if (!entry.price && item.price) {
        entry.price = item.price;
      }
    });
  });
  return Object.values(collapsed);
};

// Calculate totals from actual items, not from KOT totals (to avoid rounding errors)
const calculateTotalsFromItems = (mergedItems) => {
  // Calculate subtotal from non-returned items (price is in paise)
  const subtotalInPaise = mergedItems.reduce((sum, item) => {
    const priceInPaise = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    return sum + priceInPaise * quantity;
  }, 0);

  // Convert to rupees and round to 2 decimal places
  const subtotal = Number((subtotalInPaise / 100).toFixed(2));

  // Calculate GST (5%)
  const gst = Number((subtotal * 0.05).toFixed(2));

  // Calculate total amount
  const totalAmount = Number((subtotal + gst).toFixed(2));

  return {
    subtotal,
    gst,
    totalAmount,
  };
};

const sumTotals = (kotLines = []) => {
  // Merge all items from all KOTs
  const mergedItems = mergeKotLines(kotLines);

  // Calculate totals from actual items
  return calculateTotalsFromItems(mergedItems);
};

const buildInvoiceId = (order) => {
  if (!order) return "INV-NA";
  const date = new Date(order.createdAt || Date.now())
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  // Use cartId instead of order._id for invoice numbering
  const cartIdTail = (order.cartId || order._id || "").toString().slice(-6).toUpperCase();
  return `INV-${date}-${cartIdTail}`;
};

const formatMoney = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
};

export default function OrderSummary() {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const invoiceRef = useRef(null);
  const [accessibility] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );

  const statusMessages = {
    Pending: "📝 Order is being processed...",
    Confirmed: "👨‍🍳 Order confirmed! Kitchen is getting ready.",
    Preparing: "🔥 Your food is being prepared",
    Ready: "✨ Your food is ready to be served",
    Served: "🍽️ Enjoy your meal!",
    Finalized: "📋 Order completed, preparing bill",
    Paid: "✅ Thank you for dining with us!",
    Cancelled: "❌ Order has been cancelled",
    Returned:
      "↩️ Order has been returned. Please contact staff if you need assistance.",
  };

  const language = localStorage.getItem("language") || "en";
  const t = (k) => translations[language]?.[k] || k;
  const bt =
    floatingButtonTranslations[language] || floatingButtonTranslations.en;

  // Read current order ID from localStorage (service-type aware)
  const serviceType = localStorage.getItem("terra_serviceType") || "DINE_IN";
  const orderId =
    serviceType === "TAKEAWAY"
      ? localStorage.getItem("terra_orderId_TAKEAWAY") ||
        localStorage.getItem("terra_orderId")
      : localStorage.getItem("terra_orderId_DINE_IN") ||
        localStorage.getItem("terra_orderId");

  console.log("[OrderSummary] Loading order:", {
    serviceType,
    orderId,
    fromStorage: {
      generic: localStorage.getItem("terra_orderId"),
      dineIn: localStorage.getItem("terra_orderId_DINE_IN"),
      takeaway: localStorage.getItem("terra_orderId_TAKEAWAY"),
    },
  });

  // Listen for real-time order updates
  useEffect(() => {
    if (!orderId) return;

    // Initial order fetch
    const fetchOrder = async () => {
      try {
        const res = await fetch(`${nodeApi}/api/orders/${orderId}`);
        if (!res.ok) {
          if (res.status === 404) {
            alert(translations[language]?.noOrderFound || "No order found");
            navigate("/menu");
            return;
          }
          throw new Error(`Failed to fetch order: ${res.status}`);
        }
        const data = await res.json();
        if (!data) {
          alert(translations[language]?.noOrderFound || "No order found");
          navigate("/menu");
          return;
        }
        setOrder(data);

        // If cancelled or returned, clear storage and redirect
        if (data.status === "Cancelled" || data.status === "Returned") {
          // Clear generic keys
          localStorage.removeItem("terra_orderId");
          localStorage.removeItem("terra_cart");
          // Clear service-type-specific keys
          localStorage.removeItem("terra_orderId_TAKEAWAY");
          localStorage.removeItem("terra_orderId_DINE_IN");
          alert(
            data.status === "Returned"
              ? "Order has been returned."
              : translations[language]?.orderCancelled || "Order cancelled"
          );
          navigate("/menu");
        }
      } catch (err) {
        console.error("Error fetching order:", err);
        alert(translations[language]?.noOrderFound || "No order found");
      }
    };

    fetchOrder();

    // Define event handler
    const handleOrderUpdated = (updatedOrder) => {
      if (updatedOrder?._id === orderId) {
        setOrder(updatedOrder);

        // Handle cancellation / return
        if (
          updatedOrder.status === "Cancelled" ||
          updatedOrder.status === "Returned"
        ) {
          // Clear generic keys
          localStorage.removeItem("terra_orderId");
          localStorage.removeItem("terra_cart");
          // Clear service-type-specific keys
          localStorage.removeItem("terra_orderId_TAKEAWAY");
          localStorage.removeItem("terra_orderId_DINE_IN");
          alert(
            updatedOrder.status === "Returned"
              ? "Order has been returned."
              : translations[language]?.orderCancelled || "Order cancelled"
          );
          navigate("/menu");
        }
      }
    };

    // Create socket connection for order updates (only when needed)
    let orderSocket = null;
    try {
      orderSocket = io(nodeApi, {
        transports: ["polling", "websocket"], // Try polling first for better stability
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000,
        autoConnect: true,
        // Suppress connection errors in console
        forceNew: false,
      });

      orderSocket.on("connect", () => {
        console.log("[OrderSummary] Socket connected");
      });

      orderSocket.on("connect_error", (error) => {
        // Silently handle connection errors - socket will retry automatically
        // Don't log to avoid console spam
        if (error.message && !error.message.includes("xhr poll error")) {
          console.warn(
            "[OrderSummary] Socket connection error:",
            error.message
          );
        }
      });

      orderSocket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          console.log("[OrderSummary] Socket disconnected:", reason);
        }
      });

      orderSocket.on("orderUpdated", handleOrderUpdated);
    } catch (err) {
      console.warn("[OrderSummary] Failed to create socket connection:", err);
    }

    // Cleanup: Remove event listener and disconnect on unmount
    return () => {
      if (orderSocket) {
        orderSocket.off("orderUpdated", handleOrderUpdated);
        orderSocket.off("connect");
        orderSocket.off("connect_error");
        orderSocket.off("disconnect");
        orderSocket.disconnect();
        orderSocket = null;
      }
    };
  }, [orderId, language, navigate]);

  if (!order) {
    return (
      <div className="order-summary-page loading-screen">{t("loading")}</div>
    );
  }

  const combinedItems = mergeKotLines(order.kotLines);
  const totals = sumTotals(order.kotLines);
  const totalQty = combinedItems.reduce((n, i) => n + i.quantity, 0);
  const isTakeaway = order.serviceType === "TAKEAWAY";
  const baseTableNumber = order.table?.number ?? order.tableNumber ?? "—";
  const tableName = order.table?.name;
  const serviceValue = isTakeaway ? t("takeawayLabel") : t("dineInLabel");
  const invoiceId = buildInvoiceId(order);

  const handlePrintInvoice = () => {
    if (!invoiceRef.current || printing) return;
    setPrinting(true);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      setPrinting(false);
      return;
    }
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${invoiceId}</title>
          <style>
            * { box-sizing: border-box; }
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Courier New', monospace;
              margin: 0;
              padding: 8px;
              background: #ffffff;
              color: #000;
              width: 80mm;
              max-width: 302px;
              font-size: 11px;
            }
            h1, h2, h3, h4 { margin: 0; }
            table { border-collapse: collapse; width: 100%; font-size: 9px; }
            th, td { padding: 3px 2px; border-bottom: 1px dashed #000; }
            th { text-align: left; color: #000; font-weight: 600; font-size: 9px; }
            .invoice-shell {
              width: 80mm;
              max-width: 302px;
              margin: 0 auto;
              padding: 8px;
            }
            .invoice-flex {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .invoice-flex + .invoice-flex {
              margin-top: 8px;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              margin-top: 4px;
              font-size: 10px;
            }
            .totals-row:last-child {
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="invoice-shell">
            ${invoiceRef.current.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();
    iframe.onload = function () {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        document.body.removeChild(iframe);
        setPrinting(false);
      }, 80);
    };
  };

  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2, // Fixed scale for consistency
        useCORS: true,
        logging: false, // Disable verbose logging
        backgroundColor: "#ffffff",
        // Handle unsupported color functions like oklch()
        onclone: (clonedDoc) => {
          // Convert any oklch() colors to fallback colors
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const computedStyle = window.getComputedStyle(el);
            // Check for oklch in various properties
            ['color', 'backgroundColor', 'borderColor'].forEach((prop) => {
              const value = computedStyle[prop];
              if (value && value.includes('oklch')) {
                // Set a fallback color
                el.style[prop] = '#000000'; // Default to black for text
                if (prop === 'backgroundColor') {
                  el.style[prop] = 'transparent';
                }
              }
            });
          });
        }
      });
      
      const imgData = canvas.toDataURL("image/png");
      
      // Calculate dimensions
      // PDF Width = 80mm
      const pdfWidth = 80;
      const margin = 4;
      const usableWidth = pdfWidth - (margin * 2);
      
      // Calculate corresponding height keeping aspect ratio
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      const ratio = imgHeightPx / imgWidthPx;
      const pdfHeight = (usableWidth * ratio) + (margin * 2); // Add margins to height too
      
      // Initialize jsPDF with calculated height
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pdfWidth, pdfHeight],
      });
      
      // Add image
      pdf.addImage(imgData, "PNG", margin, margin, usableWidth, usableWidth * ratio);
      
      pdf.save(`${invoiceId}.pdf`);
    } catch (err) {
      console.error("Invoice download failed (Detailed):", err);
      alert(`Failed to generate PDF: ${err.message || "Unknown error"}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={`order-summary-page ${accessibility ? "accessibility" : ""}`}
    >
      <div className="background-container">
        <img
          src={bgImage}
          alt={t("restaurantName")}
          className="background-image"
        />
        <div className="background-overlay" />
      </div>

      <div className="content-wrapper">
        <Header />

        <div className="main-content">
          <div className="summary-card">
            <h2 className="summary-title">{t("orderSummary")}</h2>

            <div className="order-meta">
              <div className="order-meta-row">
                <span>{t("orderId")}</span>
                <span>{order._id || "—"}</span>
              </div>
              {isTakeaway && order.takeawayToken && (
                <div
                  className="order-meta-row"
                  style={{
                    backgroundColor: "#dbeafe",
                    padding: "8px",
                    borderRadius: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ fontWeight: "600", color: "#1e40af" }}>
                    Token:
                  </span>
                  <span
                    style={{
                      fontSize: "1.2em",
                      fontWeight: "bold",
                      color: "#2563eb",
                    }}
                  >
                    {order.takeawayToken}
                  </span>
                </div>
              )}
              {/* Service type label - only show for dine-in orders */}
              {!isTakeaway && (
                <div className="order-meta-row">
                  <span>{t("serviceTypeLabel")}</span>
                  <span>{serviceValue}</span>
                </div>
              )}
              {!isTakeaway && (
                <div className="order-meta-row">
                  <span>{t("tableLabel")}</span>
                  <span>
                    {baseTableNumber}
                    {tableName ? ` · ${tableName}` : ""}
                  </span>
                </div>
              )}
              {/* Customer information for takeaway orders */}
              {isTakeaway && (order.customerName || order.customerMobile) && (
                <>
                  {order.customerName && (
                    <div className="order-meta-row">
                      <span>Customer Name:</span>
                      <span>{order.customerName}</span>
                    </div>
                  )}
                  {order.customerMobile && (
                    <div className="order-meta-row">
                      <span>Mobile:</span>
                      <span>{order.customerMobile}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Order Status */}
            <div className="mb-6">
              <OrderStatus status={order.status} className="mb-2" />
              <p className="text-lg text-center font-medium text-gray-700">
                {statusMessages[order.status]}
              </p>
            </div>

            <div className="items-list">
              {combinedItems.map((it) => {
                const unitPrice = (it.price || 0) / 100;
                const amount = unitPrice * (it.quantity || 0);
                return (
                  <div key={it.name} className="item-row">
                    <span className="flex flex-wrap items-center gap-2">
                      <span>
                        {it.name}
                        {it.quantity > 0 ? ` × ${it.quantity}` : ""}
                      </span>
                      {it.returned && (
                        <span className="meta-chip returned-chip">
                          Returned {it.returnedQuantity}
                        </span>
                      )}
                    </span>
                    <span>
                      {it.quantity > 0 ? `₹${formatMoney(amount)}` : "Returned"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="summary-totals">
              <div className="total-row">
                <span>{t("totalItems")}</span>
                <span>{totalQty}</span>
              </div>
              <div className="total-row">
                <span>{t("subtotal")}</span>
                <span>₹{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>{t("gst")}</span>
                <span>₹{totals.gst.toFixed(2)}</span>
              </div>
              <div className="total-row total-bold">
                <span>{t("total")}</span>
                <span>₹{totals.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="buttons-row">
              {/* Confirm order and go back to menu */}
              <button onClick={() => navigate("/menu")} className="primary-btn">
                {t("confirmOrder")}
              </button>
              <button
                onClick={() => setShowBill(true)}
                className="secondary-btn"
              >
                {t("viewBill")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bill Popup Modal */}
      {showBill && (
        <div className="bill-modal-overlay">
          <div className="bill-modal">
            <div className="bill-modal-header">
              <div>
                <h3>Invoice</h3>
                <p className="invoice-meta">
                  <span>
                    {t("orderId")} {order._id}
                  </span>
                  <span>{new Date(order.createdAt).toLocaleString()}</span>
                </p>
              </div>
              <div className="bill-modal-actions">
                <button
                  onClick={handleDownloadInvoice}
                  disabled={downloading}
                  className="invoice-action-btn download"
                >
                  {downloading ? "Preparing…" : "Download"}
                </button>
                <button
                  onClick={() => setShowBill(false)}
                  className="invoice-close-btn"
                >
                  ✕
                </button>
              </div>
            </div>

            <div ref={invoiceRef} className="invoice-preview">
              <div className="invoice-top">
                <div>
                  <div className="brand-name">Terra Cart</div>
                  <div className="brand-address">123 Main Street, City</div>
                  <div className="brand-address">GSTIN: 22AAAAA0000A1Z5</div>
                </div>
                <div className="invoice-meta-block">
                  <div className="meta-line">
                    <span>Invoice No:</span>
                    <span>{invoiceId}</span>
                  </div>
                  {isTakeaway && order.takeawayToken && (
                    <div className="meta-line">
                      <span>Token:</span>
                      <span className="font-bold text-blue-600">
                        {order.takeawayToken}
                      </span>
                    </div>
                  )}
                  <div className="meta-line">
                    <span>Date:</span>
                    <span>
                      {new Date(
                        order.paidAt || order.updatedAt || order.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="meta-line">
                    <span>Time:</span>
                    <span>
                      {new Date(
                        order.paidAt || order.updatedAt || order.createdAt
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="invoice-billed">
                {/* Service type label - only show for dine-in invoices */}
                {!isTakeaway && (
                  <div className="meta-line">
                    <span>{t("serviceTypeLabel")}:</span>
                    <span>{serviceValue}</span>
                  </div>
                )}
                {/* Show table only for dine-in invoices */}
                {!isTakeaway && (
                  <div className="meta-line">
                    <span>{t("tableLabel")}:</span>
                    <span>
                      {baseTableNumber}
                      {tableName ? ` · ${tableName}` : ""}
                    </span>
                  </div>
                )}
                {/* Customer information is optional - only show if provided (takeaway only) */}
                {isTakeaway && (order.customerName || order.customerMobile) && (
                  <>
                    {order.customerName && (
                      <div className="meta-line">
                        <span>Customer Name:</span>
                        <span>{order.customerName}</span>
                      </div>
                    )}
                    {order.customerMobile && (
                      <div className="meta-line">
                        <span>Mobile Number:</span>
                        <span>{order.customerMobile}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>{t("itemHeader") || "Item"}</th>
                    <th>{t("quantityHeader") || "Qty"}</th>
                    <th>{t("priceHeader") || "Price (₹)"}</th>
                    <th className="align-right">
                      {t("amountHeader") || "Amount (₹)"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {combinedItems.length > 0 ? (
                    combinedItems.map((it) => {
                      const unitPrice = (it.price || 0) / 100;
                      const amount = unitPrice * (it.quantity || 0);
                      return (
                        <tr key={it.name}>
                          <td>
                            <div className="flex flex-col gap-0.5">
                              <span>{it.name}</span>
                              {it.returned && (
                                <span className="invoice-returned-note">
                                  Returned {it.returnedQuantity}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>{it.quantity > 0 ? it.quantity : "—"}</td>
                          <td>₹{formatMoney(unitPrice)}</td>
                          <td className="align-right">
                            {it.quantity > 0
                              ? `₹${formatMoney(amount)}`
                              : "Returned"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="empty-row">
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="invoice-totals">
                <div className="meta-line">
                  <span>{t("totalItems")}</span>
                  <span>{totalQty}</span>
                </div>
                <div className="meta-line">
                  <span>{t("subtotal")}</span>
                  <span>₹{formatMoney(totals.subtotal)}</span>
                </div>
                <div className="meta-line">
                  <span>{t("gst")}</span>
                  <span>₹{formatMoney(totals.gst)}</span>
                </div>
                <div className="meta-line total">
                  <span>{t("total")}</span>
                  <span>₹{formatMoney(totals.totalAmount)}</span>
                </div>
              </div>

              <div className="invoice-footer">
                Thank you for dining with Terra Cart. We hope to see you again!
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
