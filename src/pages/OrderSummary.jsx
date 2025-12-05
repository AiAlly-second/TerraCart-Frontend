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

const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");
const socket = io(nodeApi);

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
    return sum + (priceInPaise * quantity);
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
  const tail = (order._id || "").toString().slice(-6).toUpperCase();
  return `INV-${date}-${tail}`;
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
  Returned: "↩️ Order has been returned. Please contact staff if you need assistance.",
  };

  const language = localStorage.getItem("language") || "en";
  const t  = k => translations[language]?.[k] || k;
  const bt = floatingButtonTranslations[language] || floatingButtonTranslations.en;

  // Listen for real-time order updates
  useEffect(() => {
    const id = localStorage.getItem("terra_orderId");
    if (!id) return;

    // Initial order fetch
    const fetchOrder = () => {
      fetch(`${nodeApi}/api/orders/${id}`)
        .then(r => r.json())
        .then(data => {
          setOrder(data);
          
          // If cancelled or returned, clear storage and redirect
          if (data.status === "Cancelled" || data.status === "Returned") {
            localStorage.removeItem("terra_orderId");
            localStorage.removeItem("terra_cart");
            alert(
              data.status === "Returned"
                ? "Order has been returned."
                : (translations[language]?.orderCancelled || "Order cancelled")
            );
            navigate("/menu");
          }
        })
        .catch(() => alert(translations[language]?.noOrderFound || "No order found"));
    };

    fetchOrder();

    // Listen for real-time updates
    socket.on("orderUpdated", (updatedOrder) => {
      if (updatedOrder._id === id) {
        setOrder(updatedOrder);
        
        // Handle cancellation / return
        if (updatedOrder.status === "Cancelled" || updatedOrder.status === "Returned") {
          localStorage.removeItem("terra_orderId");
          localStorage.removeItem("terra_cart");
          alert(
            updatedOrder.status === "Returned"
              ? "Order has been returned."
              : (translations[language]?.orderCancelled || "Order cancelled")
          );
          navigate("/menu");
        }
      }
    });

    return () => socket.off("orderUpdated");
  }, [language, navigate]); // Removed 't' from dependencies to prevent infinite loop

  if (!order) {
    return (
      <div className="order-summary-page loading-screen">{t("loading")}</div>
    );
  }

  const combinedItems = mergeKotLines(order.kotLines);
  const totals        = sumTotals(order.kotLines);
  const totalQty      = combinedItems.reduce((n, i) => n + i.quantity, 0);
  const isTakeaway    = order.serviceType === "TAKEAWAY";
  const baseTableNumber = order.table?.number ?? order.tableNumber ?? "—";
  const tableName     = order.table?.name;
  const serviceValue  = isTakeaway ? t("takeawayLabel") : t("dineInLabel");
  const invoiceId     = buildInvoiceId(order);

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
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [80, "auto"]
      });
      const pdfWidth = 80;
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 4;
      const usableWidth = pdfWidth - margin * 2;
      const imgProps = pdf.getImageProperties(imageData);
      const imgRatio = imgProps.height / imgProps.width;
      const imgHeight = usableWidth * imgRatio;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imageData, "PNG", margin, position, usableWidth, imgHeight);
      heightLeft -= pdfHeight - margin * 2;

      while (heightLeft > 0) {
        pdf.addPage();
        position = margin - (imgHeight - heightLeft);
        pdf.addImage(imageData, "PNG", margin, position, usableWidth, imgHeight);
        heightLeft -= pdfHeight - margin * 2;
      }

      pdf.save(`${invoiceId}.pdf`);
    } catch (err) {
      console.error("Invoice download failed", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={`order-summary-page ${accessibility ? "accessibility" : ""}`}>
      <div className="background-container">
        <img src={bgImage} alt={t("restaurantName")} className="background-image" />
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
              <div className="order-meta-row">
                <span>{t("serviceTypeLabel")}</span>
                <span>{serviceValue}</span>
              </div>
              {!isTakeaway && (
                <div className="order-meta-row">
                  <span>{t("tableLabel")}</span>
                  <span>
                    {baseTableNumber}
                    {tableName ? ` · ${tableName}` : ""}
                  </span>
                </div>
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
                      {it.quantity > 0
                        ? `₹${formatMoney(amount)}`
                        : "Returned"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="summary-totals">
              <div className="total-row"><span>{t("totalItems")}</span><span>{totalQty}</span></div>
              <div className="total-row"><span>{t("subtotal")}</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
              <div className="total-row"><span>{t("gst")}</span><span>₹{totals.gst.toFixed(2)}</span></div>
              <div className="total-row total-bold"><span>{t("total")}</span><span>₹{totals.totalAmount.toFixed(2)}</span></div>
            </div>

            <div className="buttons-row">
              {/* Confirm shows the KOT confirmation screen */}
              <button onClick={() => navigate("/order-confirmed")} className="primary-btn">
                {t("confirmOrder")}
              </button>
              <button onClick={() => setShowBill(true)} className="secondary-btn">
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
            <span>{t("orderId")} {order._id}</span>
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
          <button onClick={() => setShowBill(false)} className="invoice-close-btn">
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
            <div className="meta-line">
              <span>Date:</span>
              <span>{new Date(order.paidAt || order.updatedAt || order.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="meta-line">
              <span>Time:</span>
              <span>{new Date(order.paidAt || order.updatedAt || order.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <div className="invoice-billed">
          <div className="meta-line">
            <span>{t("serviceTypeLabel")}:</span>
            <span>{serviceValue}</span>
          </div>
          <div className="meta-line">
            <span>{t("tableLabel")}:</span>
            <span>
              {isTakeaway ? t("takeawayLabel") : baseTableNumber}
              {!isTakeaway && tableName ? ` · ${tableName}` : ""}
            </span>
          </div>
          {/* Customer information for takeaway orders */}
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
              <th className="align-right">{t("amountHeader") || "Amount (₹)"}</th>
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
