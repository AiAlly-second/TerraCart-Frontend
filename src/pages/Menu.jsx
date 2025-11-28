import Header from "../components/Header";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FiMic, FiMicOff } from "react-icons/fi";
import { useAITranslation } from "../hooks/useAITranslation";
import fallbackMenuItems from "../data/menuData";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import { HiSpeakerWave } from "react-icons/hi2";
import { motion } from "framer-motion";
import "./MenuPage.css";
import { buildOrderPayload } from "../utils/orderUtils";
import ProcessOverlay from "../components/ProcessOverlay";
import OrderStatus from "../components/OrderStatus";
import { io } from "socket.io-client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
// import AccessibilityFooter from "../components/AccessibilityFooter";
const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");
// CRITICAL: Flask API URL - default to 5050, but allow override via env
const flaskApi = (import.meta.env.VITE_FLASK_API_URL || "http://localhost:5050").replace(/\/$/, "");
console.log("[Menu] Flask API URL:", flaskApi); // Debug log

// Helper function to normalize image URLs
// If image URL is relative (starts with /), prepend API base URL
// If it's already absolute (http:// or https://), use as-is
const getImageUrl = (imagePath) => {
  if (!imagePath) return "/defaultImg.jpg";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath; // Already absolute URL
  }
  if (imagePath.startsWith("/")) {
    return `${nodeApi}${imagePath}`; // Relative path, prepend API base URL
  }
  return `${nodeApi}/uploads/${imagePath}`; // Just filename, construct full path
};

const SERVICE_TYPE_KEY = "terra_serviceType";
const TABLE_SELECTION_KEY = "terra_selectedTable";
const REORDER_ALLOWED_STATUSES = ["Pending", "Confirmed", "Preparing", "Ready", "Served", "Completed", "Paid", "Returned", "Cancelled"];
const CANCEL_ALLOWED_STATUSES = ["Pending", "Confirmed", "Preparing", "Ready", "Served", "Finalized", "Completed"];
const RETURN_ALLOWED_STATUSES = ["Paid"];

const paiseToRupees = (value) => {
  if (value === undefined || value === null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return num / 100;
};

const formatMoney = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
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

const getLatestKot = (order) => {
  if (!order) return null;
  const lines = Array.isArray(order.kotLines) ? order.kotLines : [];
  if (!lines.length) return null;
  return lines[lines.length - 1];
};

const aggregateOrderItems = (order) => {
  if (!order) return [];
  const map = new Map();
  const lines = Array.isArray(order.kotLines) ? order.kotLines : [];
  lines.forEach((kot) => {
    (kot?.items || []).forEach((item) => {
      if (!item) return;
      const name = item.name || "Item";
      const quantity = Number(item.quantity) || 0;
      const unitPrice = paiseToRupees(item.price || 0);
      const returned = Boolean(item.returned);
      if (!map.has(name)) {
        map.set(name, {
          name,
          unitPrice,
          activeQuantity: 0,
          returnedQuantity: 0,
          totalQuantity: 0,
          amount: 0,
          returned: false,
        });
      }
      const entry = map.get(name);
      entry.totalQuantity += quantity;
      if (returned) {
        entry.returnedQuantity += quantity;
        entry.returned = true;
      } else {
        entry.activeQuantity += quantity;
        entry.amount += unitPrice * quantity;
      }
      if (!entry.unitPrice) {
        entry.unitPrice = unitPrice;
      }
    });
  });
  return Array.from(map.values()).map((entry) => ({
    ...entry,
    quantity: entry.activeQuantity,
  }));
};

const computeOrderTotals = (order, aggregatedItems) => {
  const items = aggregatedItems || aggregateOrderItems(order);
  
  // Calculate subtotal from actual items (amount is already in rupees)
  const subtotal = items.reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    return sum + amount;
  }, 0);
  
  // Round subtotal to 2 decimal places
  const subtotalRounded = Number(subtotal.toFixed(2));
  
  // Calculate GST (5%)
  const gst = Number((subtotalRounded * 0.05).toFixed(2));
  
  // Calculate total amount
  const totalAmount = Number((subtotalRounded + gst).toFixed(2));
  
  return {
    subtotal: subtotalRounded,
    gst: gst,
    totalAmount: totalAmount,
    totalItems: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
  };
};

const resolveOrderTimestamp = (order) => {
  if (!order) return null;
  const timestamp = order.paidAt || order.updatedAt || order.createdAt;
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildCategoriesFromFlatItems = (items) => {
  const grouped = items.reduce((acc, item) => {
    const categoryName = item.category || "Menu";
    if (!acc[categoryName]) {
      acc[categoryName] = {
        _id: categoryName,
        name: categoryName,
        description: "",
        sortOrder: 0,
        isActive: true,
        items: [],
      };
    }
    acc[categoryName].items.push({
      ...item,
      isAvailable: item.isAvailable !== false,
      categoryName,
      _id: item._id || `${categoryName}-${item.name}`.replace(/\s+/g, "-"),
    });
    return acc;
  }, {});
  return Object.values(grouped);
};

const buildCatalogFromCategories = (categories) => {
  const catalog = {};
  categories.forEach((category) => {
    (category.items || []).forEach((item) => {
      catalog[item.name] = item;
    });
  });
  return catalog;
};

const TranslatedItem = ({ item, onAdd, onRemove, count }) => {
  const [translatedName] = useAITranslation(item.name);
  const isAvailable = item.isAvailable !== false;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`item-card group ${!isAvailable ? "unavailable" : ""}`}
    >
      <div className="item-image-container">
        <img
          src={getImageUrl(item.image)}
          alt={item.name}
          className="item-image"
        />
      </div>

      <div className="item-gradient"></div>

      <div className="item-footer">
        <div className="item-info">
          <h4 className="item-name">{translatedName}</h4>
          <p className="item-price">₹{item.price}</p>
          {!isAvailable && (
            <span className="item-status-badge unavailable">Not available</span>
          )}
        </div>

        <div className="item-controls">
          <button
            aria-label={`Remove one ${item.name}`}
            className="quantity-button"
            onClick={() => onRemove(item.name)}
            disabled={!count}
          >
            -
          </button>

          <span className="item-count">{count}</span>

          <button
            aria-label={`Add one ${item.name}`}
            className={`quantity-button ${!isAvailable ? "disabled" : ""}`}
            onClick={() => onAdd(item)}
            disabled={!isAvailable}
            title={!isAvailable ? "Currently unavailable" : undefined}
          >
            +
          </button>
        </div>
      </div>
    </motion.div>
  );
};



const TranslatedSummaryItem = ({ item, qty }) => {
  const [translatedItem] = useAITranslation(item);
  return <li className="summary-item">{qty} x {translatedItem}</li>;
};

// NEW: CategoryBlock.jsx-inlined component
const CategoryBlock = ({ category, items, openCategory, setOpenCategory, cart, onAdd, onRemove }) => {
  const [translatedCategory] = useAITranslation(category);

  return (
    <div className="category-wrapper">
      <button
        onClick={() => setOpenCategory(openCategory === category ? null : category)}
        className="category-button"
      >
        {translatedCategory} <span>{openCategory === category ? "▲" : "▼"}</span>
      </button>

      {openCategory === category && (
        <div className="category-items">
          {items.map((item, idx) => (
            <TranslatedItem
              key={item._id || `${category}-${idx}`}
              item={item}
              onAdd={onAdd}
              onRemove={onRemove}
              count={cart[item.name] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
};


export default function MenuPage() {

  const location = useLocation();

  const initialProcessSteps = [
  { label: "Validating cart", state: "pending" },
  { label: "Order processing", state: "pending" },
  { label: "Sending to backend", state: "pending" },
  { label: "Routing to kitchen", state: "pending" },
  { label: "Loading order summary", state: "pending" },
];

const [processOpen, setProcessOpen] = useState(false);
const [processSteps, setProcessSteps] = useState(initialProcessSteps);

const setStepState = (index, state) =>
  setProcessSteps(prev =>
    prev.map((s, i) => (i === index ? { ...s, state } : s))
  );

  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );

  const toggleAccessibility = () => {
    const newMode = !accessibilityMode;
    setAccessibilityMode(newMode);
    localStorage.setItem("accessibilityMode", newMode.toString());
  };

  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem("terra_cart");
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem("terra_cart", JSON.stringify(cart));
  }, [cart]);

  const [recording, setRecording] = useState(false);
  const [orderText, setOrderText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [returning, setReturning] = useState(false);
  const [isOrderingMore, setIsOrderingMore] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuCategories, setMenuCategories] = useState([]);
  const [menuCatalog, setMenuCatalog] = useState({});
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState(null);
  const flatMenuItems = useMemo(
    () =>
      menuCategories.flatMap((category) =>
        (category.items || []).map((item) => ({
          ...item,
          categoryName: category.name,
        }))
      ),
    [menuCategories]
  );
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return flatMenuItems.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        (item.description || "").toLowerCase().includes(query) ||
        (item.tags || []).some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [flatMenuItems, searchQuery]);
  const navigate = useNavigate();
  const recognitionRef = useRef(null);
  const invoiceRef = useRef(null);
  const [activeOrderId, setActiveOrderId] = useState(() => {
    const stored = localStorage.getItem("terra_orderId");
    return stored || null;
  });
  const [orderStatus, setOrderStatus] = useState(() => {
    const stored = localStorage.getItem("terra_orderStatus");
    return stored || null;
  });
  const [orderStatusUpdatedAt, setOrderStatusUpdatedAt] = useState(() => {
    const stored = localStorage.getItem("terra_orderStatusUpdatedAt");
    return stored || null;
  });

const [serviceType, setServiceType] = useState(() =>
  localStorage.getItem(SERVICE_TYPE_KEY) || "DINE_IN"
);
const [tableInfo, setTableInfo] = useState(() => {
  try {
    const stored = localStorage.getItem(TABLE_SELECTION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.warn("Invalid table selection cache", err);
    return null;
  }
});
const [sessionToken, setSessionToken] = useState(() => localStorage.getItem("terra_sessionToken"));
// Customer info for takeaway orders (optional) - loaded from localStorage
const [customerName] = useState(() => localStorage.getItem("terra_takeaway_customerName") || "");
const [customerMobile] = useState(() => localStorage.getItem("terra_takeaway_customerMobile") || "");
const [customerEmail] = useState(() => localStorage.getItem("terra_takeaway_customerEmail") || "");
const [previousOrder, setPreviousOrder] = useState(() => {
  try {
    const stored = localStorage.getItem("terra_previousOrder");
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.warn("Invalid previous order cache", err);
    localStorage.removeItem("terra_previousOrder");
    return null;
  }
});
const [previousOrderDetail, setPreviousOrderDetail] = useState(() => {
  try {
    const stored = localStorage.getItem("terra_previousOrderDetail");
    return stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.warn("Invalid previous order detail cache", err);
    localStorage.removeItem("terra_previousOrderDetail");
    return null;
  }
});
const [showInvoiceModal, setShowInvoiceModal] = useState(false);
const [invoiceOrder, setInvoiceOrder] = useState(null);
const [invoiceLoading, setInvoiceLoading] = useState(false);
const [printingInvoice, setPrintingInvoice] = useState(false);
const [downloadingInvoice, setDownloadingInvoice] = useState(false);

const persistPreviousOrder = useCallback((data) => {
  if (data) {
    setPreviousOrder(data);
    localStorage.setItem("terra_previousOrder", JSON.stringify(data));
  } else {
    setPreviousOrder(null);
    localStorage.removeItem("terra_previousOrder");
  }
}, []);

const persistPreviousOrderDetail = useCallback((order) => {
  if (order) {
    setPreviousOrderDetail(order);
    localStorage.setItem("terra_previousOrderDetail", JSON.stringify(order));
  } else {
    setPreviousOrderDetail(null);
    localStorage.removeItem("terra_previousOrderDetail");
  }
}, []);

const capturePreviousOrder = useCallback(
  (overrides = {}) => {
    const resolvedOrderId = overrides.orderId || activeOrderId;
    if (!resolvedOrderId) return;

    const resolvedStatus = overrides.status || orderStatus || "Confirmed";
    const resolvedUpdatedAt =
      overrides.updatedAt || orderStatusUpdatedAt || new Date().toISOString();

    const tableSource =
      overrides.tableInfo ||
      tableInfo ||
      (() => {
        try {
          const stored = localStorage.getItem(TABLE_SELECTION_KEY);
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }
      })();

    const resolvedTableNumber =
      overrides.tableNumber ??
      tableSource?.number ??
      tableSource?.tableNumber ??
      null;

    const resolvedSlug =
      overrides.tableSlug ??
      tableSource?.qrSlug ??
      localStorage.getItem("terra_scanToken") ??
      null;

    persistPreviousOrder({
      orderId: resolvedOrderId,
      status: resolvedStatus,
      updatedAt: resolvedUpdatedAt,
      tableNumber: resolvedTableNumber,
      tableSlug: resolvedSlug,
    });
  },
  [
    activeOrderId,
    orderStatus,
    orderStatusUpdatedAt,
    tableInfo,
    persistPreviousOrder,
  ]
);

const invoiceId = useMemo(
  () => (invoiceOrder ? buildInvoiceId(invoiceOrder) : null),
  [invoiceOrder]
);

const invoiceItems = useMemo(
  () => aggregateOrderItems(invoiceOrder),
  [invoiceOrder]
);

const invoiceTotals = useMemo(
  () =>
    invoiceOrder
      ? computeOrderTotals(invoiceOrder, invoiceItems)
      : { subtotal: 0, gst: 0, totalAmount: 0, totalItems: 0 },
  [invoiceOrder, invoiceItems]
);

const invoiceServiceLabel = useMemo(() => {
  if (!invoiceOrder) return "";
  return invoiceOrder.serviceType === "TAKEAWAY" ? "Takeaway" : "Dine-In";
}, [invoiceOrder]);

const invoiceTableNumber = invoiceOrder?.table?.number ?? invoiceOrder?.tableNumber ?? null;
const invoiceTableName = invoiceOrder?.table?.name ?? null;
const invoiceTimestamp = useMemo(
  () => resolveOrderTimestamp(invoiceOrder),
  [invoiceOrder]
);

const previousDetailItems = useMemo(
  () => aggregateOrderItems(previousOrderDetail),
  [previousOrderDetail]
);

const previousDetailTotals = useMemo(
  () =>
    previousOrderDetail
      ? computeOrderTotals(previousOrderDetail, previousDetailItems)
      : { subtotal: 0, gst: 0, totalAmount: 0, totalItems: 0 },
  [previousOrderDetail, previousDetailItems]
);

const previousDetailTimestamp = useMemo(
  () => resolveOrderTimestamp(previousOrderDetail),
  [previousOrderDetail]
);

const previousDetailInvoiceId = useMemo(
  () => (previousOrderDetail ? buildInvoiceId(previousOrderDetail) : null),
  [previousOrderDetail]
);

const [menuHeading] = useAITranslation("Menu");
  const [smartServe] = useAITranslation("Smart Serve");
  const [aiOrdered] = useAITranslation("AI Ordered:");
  const [orderSummary] = useAITranslation("Order Summary:");
  const [confirmBtn] = useAITranslation("Confirm");
  const [speakBtn] = useAITranslation("Speak Order");
  const [processingText] = useAITranslation("Processing your voice...");
  const [cartEmptyText] = useAITranslation("Cart is empty");
  const [resetBtn] = useAITranslation("Reset Order");
  const [tapToOrder] = useAITranslation("Tap to Order");
const [tapToStop] = useAITranslation("Tap to Stop");
const [searchPlaceholder] = useAITranslation("Search item...");
const [recordVoiceAria] = useAITranslation("Record voice order");

  useEffect(() => {
    if (orderStatus) {
      localStorage.setItem("terra_orderStatus", orderStatus);
    } else {
      localStorage.removeItem("terra_orderStatus");
    }
    if (orderStatusUpdatedAt) {
      localStorage.setItem("terra_orderStatusUpdatedAt", orderStatusUpdatedAt);
    } else {
      localStorage.removeItem("terra_orderStatusUpdatedAt");
    }
  }, [orderStatus, orderStatusUpdatedAt]);

  useEffect(() => {
    if (orderStatus && activeOrderId && previousOrder) {
      persistPreviousOrder(null);
    }
    if (orderStatus && activeOrderId && previousOrderDetail) {
      persistPreviousOrderDetail(null);
    }
  }, [orderStatus, activeOrderId, previousOrder, previousOrderDetail, persistPreviousOrder, persistPreviousOrderDetail]);

  useEffect(() => {
    if (!previousOrder && !previousOrderDetail) return;
    const currentSlug = localStorage.getItem("terra_scanToken");
    const previousSlug = previousOrder?.tableSlug;
    if (previousSlug && currentSlug && previousSlug !== currentSlug) {
      persistPreviousOrder(null);
      persistPreviousOrderDetail(null);
      return;
    }
    if (
      !previousSlug &&
      previousOrderDetail?.table?.qrSlug &&
      currentSlug &&
      previousOrderDetail.table.qrSlug !== currentSlug
    ) {
      persistPreviousOrder(null);
      persistPreviousOrderDetail(null);
    }
  }, [previousOrder, previousOrderDetail, persistPreviousOrder, persistPreviousOrderDetail]);

  useEffect(() => {
    if (location.state?.serviceType) {
      setServiceType(location.state.serviceType);
      localStorage.setItem(SERVICE_TYPE_KEY, location.state.serviceType);
    }

    if (location.state?.table) {
      setTableInfo(location.state.table);
      localStorage.setItem(
        TABLE_SELECTION_KEY,
        JSON.stringify(location.state.table)
      );
    }
  }, [location.state]);

  useEffect(() => {
    let cancelled = false;

    // CRITICAL: Mark table as OCCUPIED ONLY when user enters menu page for DINE_IN (not on landing/second page)
    const markTableOccupied = async () => {
      try {
        // IMPORTANT: Only mark table as occupied for DINE_IN orders, not TAKEAWAY
        const currentServiceType = localStorage.getItem(SERVICE_TYPE_KEY) || location.state?.serviceType || "DINE_IN";
        if (currentServiceType === "TAKEAWAY") {
          return; // Don't mark table as occupied for takeaway orders
        }

        const selectedTable = localStorage.getItem("terra_selectedTable");
        const sessionToken = localStorage.getItem("terra_sessionToken");
        const scanToken = localStorage.getItem("terra_scanToken");
        
        if (!selectedTable || !scanToken) {
          return; // No table selected, skip
        }

        const tableData = JSON.parse(selectedTable);
        const tableId = tableData.id || tableData._id;
        
        if (!tableId) {
          return;
        }

        // STRONG: Only mark as occupied if table is currently AVAILABLE
        // This ensures first user doesn't get waitlisted and table stays available until menu entry
        if (tableData.status !== "AVAILABLE") {
          // Table already occupied or has other status - don't mark again
          return;
        }

        // Call API to mark table as occupied ONLY when entering menu page
        const res = await fetch(`${nodeApi}/api/tables/${tableId}/occupy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionToken: sessionToken || undefined,
          }),
        });

        if (res.ok) {
          // Update local table data to reflect occupied status
          const updatedTable = await res.json().catch(() => null);
          if (updatedTable?.table) {
            const updatedTableData = {
              ...tableData,
              status: updatedTable.table.status || "OCCUPIED",
              sessionToken: updatedTable.table.sessionToken || sessionToken,
            };
            localStorage.setItem("terra_selectedTable", JSON.stringify(updatedTableData));
          } else {
            // Fallback: update status locally
            tableData.status = "OCCUPIED";
            localStorage.setItem("terra_selectedTable", JSON.stringify(tableData));
          }
        } else {
          console.warn('Failed to mark table as occupied:', await res.text());
        }
      } catch (err) {
        console.warn('Error marking table as occupied:', err);
        // Don't block menu loading if this fails
      }
    };

    const loadMenu = async () => {
      try {
        setMenuLoading(true);
        setMenuError(null);
        
        // Mark table as occupied when menu page loads
        await markTableOccupied();
        
        // Get cartId from the selected table to filter menu
        let cartId = '';
        try {
          const tableData = JSON.parse(localStorage.getItem(TABLE_SELECTION_KEY) || '{}');
          cartId = tableData.cartId || tableData.cafeId || '';
          console.log('[Menu] Loading menu for cartId:', cartId);
        } catch (e) {
          console.warn('[Menu] Could not get cartId from table data');
        }
        
        const menuUrl = cartId 
          ? `${nodeApi}/api/menu/public?cartId=${cartId}`
          : `${nodeApi}/api/menu/public`;
        
        const res = await fetch(menuUrl);
        if (!res.ok) {
          throw new Error(`Menu fetch failed with status ${res.status}`);
        }
        const payload = await res.json();
        if (cancelled) return;
        const categories = (payload || []).map((category) => ({
          ...category,
          name: category.name || "Menu",
          items: (category.items || []).map((item) => ({
            ...item,
            isAvailable: item.isAvailable !== false,
            categoryName: category.name || "Menu",
          })),
        }));
        const catalog = buildCatalogFromCategories(categories);
        setMenuCategories(categories);
        setMenuCatalog(catalog);
        setOpenCategory((prev) => prev || categories[0]?.name || null);
      } catch (err) {
        console.error("Menu fetch error", err);
        if (cancelled) return;
        const fallbackCategories = buildCategoriesFromFlatItems(
          fallbackMenuItems.map((item) => ({ ...item, isAvailable: true }))
        );
        setMenuCategories(fallbackCategories);
        setMenuCatalog(buildCatalogFromCategories(fallbackCategories));
        setOpenCategory((prev) => prev || fallbackCategories[0]?.name || null);
        setMenuError("Showing default menu because the live menu could not be loaded.");
      } finally {
        if (!cancelled) {
          setMenuLoading(false);
        }
      }
    };

    loadMenu();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = (menuItem) => {
    const name = typeof menuItem === "string" ? menuItem : menuItem?.name;
    if (!name) return;
    const meta = menuCatalog[name] || menuItem;
    if (meta && meta.isAvailable === false) {
      alert(`${meta.name} is currently unavailable.`);
      return;
    }
    setCart((prev) => ({ ...prev, [name]: (prev[name] || 0) + 1 }));
  };

  const handleRemove = (name) => {
    setCart((prev) => {
      const newCount = (prev[name] || 0) - 1;
      if (newCount <= 0) {
        const { [name]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: newCount };
    });
  };

// ADD: helper for step delays
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Optional: tweak durations per step (ms)
const DUR = {
  validate: 1000,     // time to show "Validating cart"
  order: 1000,        // "Order processing"
  beforeSend: 1000,   // brief pause before sending to backend
  kitchen: 1000,     // "Routing to kitchen"
  summary: 1000,     // "Loading order summary"
  error: 1000        // how long to keep error visible
};


  // REPLACE the whole handleContinue with this
const handleContinue = async () => {
  if (Object.keys(cart).length === 0) return alert(cartEmptyText);

  const existingId = activeOrderId;

  if (serviceType === "DINE_IN" && !existingId && !tableInfo) {
    alert("We couldn't detect your table. Please scan the table QR again or contact staff before placing an order.");
    return;
  }

  // Proceed with order creation
  await proceedWithOrder();
};

const proceedWithOrder = async () => {
  let existingId = activeOrderId;
  
  // Check if existing order can accept new items
  // If order is in a final status (Paid, Cancelled, Returned, Served, Finalized), create a new order instead
  if (existingId) {
    try {
      const orderRes = await fetch(`${nodeApi}/api/orders/${existingId}`);
      if (orderRes.ok) {
        const existingOrder = await orderRes.json();
        const finalStatuses = ["Paid", "Cancelled", "Returned", "Served", "Finalized"];
        if (finalStatuses.includes(existingOrder.status)) {
          console.log('[Menu] Existing order is in final status, creating new order instead:', existingOrder.status);
          // Clear the active order ID so we create a new order
          existingId = null;
          setActiveOrderId(null);
          localStorage.removeItem("terra_orderId");
          localStorage.removeItem("terra_orderStatus");
          localStorage.removeItem("terra_orderStatusUpdatedAt");
        }
      } else {
        // Order not found or error, create new order
        console.log('[Menu] Could not fetch existing order, creating new order');
        existingId = null;
        setActiveOrderId(null);
        localStorage.removeItem("terra_orderId");
        localStorage.removeItem("terra_orderStatus");
        localStorage.removeItem("terra_orderStatusUpdatedAt");
      }
    } catch (err) {
      console.warn('[Menu] Error checking existing order, creating new order:', err);
      existingId = null;
      setActiveOrderId(null);
      localStorage.removeItem("terra_orderId");
      localStorage.removeItem("terra_orderStatus");
      localStorage.removeItem("terra_orderStatusUpdatedAt");
    }
  }

  // Reset & open overlay
  setProcessSteps(initialProcessSteps.map(s => ({ ...s, state: "pending" })));
  setProcessOpen(true);

  try {
    // Step 0: Validating cart
    setStepState(0, "active");
    await wait(DUR.validate);
    setStepState(0, "done");

    // Step 1: Order processing
    setStepState(1, "active");
    await wait(DUR.order);
    setStepState(1, "done");

    // Step 2: Sending to backend (active before fetch)
    setStepState(2, "active");
    await wait(DUR.beforeSend);

    // Get customer info from localStorage for takeaway orders (in case state wasn't updated)
    const storedCustomerName = serviceType === "TAKEAWAY" ? (localStorage.getItem("terra_takeaway_customerName") || "") : "";
    const storedCustomerMobile = serviceType === "TAKEAWAY" ? (localStorage.getItem("terra_takeaway_customerMobile") || "") : "";
    const storedCustomerEmail = serviceType === "TAKEAWAY" ? (localStorage.getItem("terra_takeaway_customerEmail") || "") : "";

    const orderPayload = buildOrderPayload(cart, {
      serviceType,
      tableId: tableInfo?.id || tableInfo?._id,
      tableNumber: tableInfo?.number ?? tableInfo?.tableNumber,
      menuCatalog,
      sessionToken: localStorage.getItem("terra_sessionToken"),
      // Only include customer info if it's not empty (avoid sending empty strings)
      customerName: serviceType === "TAKEAWAY" && storedCustomerName?.trim() ? storedCustomerName.trim() : undefined,
      customerMobile: serviceType === "TAKEAWAY" && storedCustomerMobile?.trim() ? storedCustomerMobile.trim() : undefined,
      customerEmail: serviceType === "TAKEAWAY" && storedCustomerEmail?.trim() ? storedCustomerEmail.trim() : undefined,
    });
    
    console.log('[Menu] Order payload:', JSON.stringify(orderPayload, null, 2));
    console.log('[Menu] Using existing order ID:', existingId || 'none (creating new order)');
    const url = existingId
      ? `${nodeApi}/api/orders/${existingId}/kot`
      : `${nodeApi}/api/orders`;
    const method = "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });

    const data = await res.json();

    if (!(res.ok && data?._id)) {
      // Backend failed → mark error on step 2
      setStepState(2, "error");
      // Show more detailed error message from backend if available
      const errorMessage = data?.message || data?.error || "Failed to save order.";
      console.error('[Menu] Order save failed:', {
        status: res.status,
        statusText: res.statusText,
        error: data
      });
      alert(`❌ ${errorMessage}`);
      await wait(DUR.error);
      setProcessOpen(false);
      return;
    }

    // Backend OK
    setStepState(2, "done");

    // Step 3: Routing to kitchen
    setStepState(3, "active");
    await wait(DUR.kitchen);
    setStepState(3, "done");

    // Persist & clear cart
    localStorage.setItem("terra_orderId", data._id);
    setActiveOrderId(data._id);
    setOrderStatus(data.status || "Confirmed");
    setOrderStatusUpdatedAt(new Date().toISOString());
    setCart({});
    localStorage.removeItem("terra_cart");
    setIsOrderingMore(false);

    // Step 4: Loading order summary
    setStepState(4, "active");
    await wait(DUR.summary);
    setStepState(4, "done");

    // Navigate when all steps done
    navigate("/order-summary");
  } catch (err) {
    // Network or unexpected error → mark backend step as error
    setStepState(2, "error");
    alert("❌ Server Error");
    console.error(err);
    await wait(DUR.error);
    setProcessOpen(false);
    setIsOrderingMore(false);
  }
};



const handleVoiceOrder = async () => {
    if (recording) {
      // Stop recording
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
      } catch (err) {
        console.warn("Error stopping recognition:", err);
      }
      setRecording(false);
      return;
    }

    // Check if browser supports Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser doesn't support voice input. Please use the menu buttons to order.");
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = false;
      const language = localStorage.getItem("language") || "en";
      recognition.lang = language === 'en' ? 'en-US' : language === 'hi' ? 'hi-IN' : 'en-US';

      recognition.onstart = () => {
        setRecording(true);
        setOrderText("");
        console.log("🎤 Voice recognition started");
      };

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("📝 Transcribed:", transcript);
        setOrderText(transcript);
        setRecording(false);

        // Parse the order using Flask backend
        setIsProcessing(true);
        try {
          const res = await fetch(`${flaskApi}/parse-order-text`, {
              method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcript }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Backend returned ${res.status}`);
          }

            const data = await res.json();
          console.log("📦 Flask response:", data);
          
          if (data.items && data.items.length > 0) {
            // Add items directly to cart
            const updatedCart = { ...cart };
            let addedCount = 0;
            
            data.items.forEach((item) => {
              const itemName = item.name;
              if (itemName) {
                // Use flatMenuItems to find the actual menu item
                // Try exact match first (case-insensitive)
                let matched = flatMenuItems.find(
                  (menuItem) => menuItem.name.toLowerCase() === itemName.toLowerCase()
                );
                
                // If not found, try partial match
                if (!matched) {
                  matched = flatMenuItems.find(
                    (menuItem) => menuItem.name.toLowerCase().includes(itemName.toLowerCase()) ||
                                 itemName.toLowerCase().includes(menuItem.name.toLowerCase())
                  );
                }
                
                // If still not found, try matching with original name from Flask response
                if (!matched && item.original) {
                  matched = flatMenuItems.find(
                    (menuItem) => menuItem.name.toLowerCase() === item.original.toLowerCase() ||
                                 menuItem.name.toLowerCase().includes(item.original.toLowerCase())
                  );
                }
                
                if (matched && matched.isAvailable !== false) {
                  // Item found in menu - add to cart
                  updatedCart[matched.name] = (updatedCart[matched.name] || 0) + (item.quantity || 1);
                  addedCount++;
                  console.log(`✅ Added to cart: ${item.quantity || 1}x ${matched.name} (matched from: ${itemName})`);
                } else {
                  console.warn(`⚠️ Item not found in menu: ${itemName}`, { 
                    availableItems: flatMenuItems.map(i => i.name).slice(0, 5) 
                  });
                }
              }
            });
            
            if (addedCount > 0) {
              setCart(updatedCart);
              
              // Format order text for display
              const formattedOrder = data.items
                .filter(item => {
                  // Only show items that were successfully added
                  const matched = flatMenuItems.find(m => m.name.toLowerCase() === item.name.toLowerCase());
                  return matched;
                })
                .map(item => `${item.quantity || 1}x ${item.name}`)
                .join(", ");
              setOrderText(formattedOrder);
              
              console.log(`✅ Successfully added ${addedCount} item(s) to cart`);
              // Show success message
              if (addedCount === data.items.length) {
                // All items added successfully
                console.log("✅ All items added to cart successfully");
              } else {
                // Some items couldn't be added
                const failedCount = data.items.length - addedCount;
                alert(`✅ Added ${addedCount} item(s) to cart.\n⚠️ ${failedCount} item(s) could not be found in menu.`);
              }
            } else {
              console.warn("⚠️ No items could be added to cart - items not found in menu");
              console.warn("Flask returned items:", data.items);
              console.warn("Available menu items:", flatMenuItems.map(i => i.name).slice(0, 10));
              alert(`⚠️ Could not find these items in the menu:\n${data.items.map(i => i.name).join(", ")}\n\nPlease check the item names or use the menu buttons to add items.`);
              setOrderText(transcript);
            }
            
            // Show unmatched items if any
            if (data.unmatched && data.unmatched.length > 0) {
              console.warn("⚠️ Unmatched items:", data.unmatched);
              const unmatchedNames = data.unmatched.map(u => u.name).join(", ");
              alert(`⚠️ Could not match these items: ${unmatchedNames}`);
            }
          } else {
            console.warn("⚠️ No items returned from Flask backend");
            // Fallback: try to parse manually
            processVoiceOrder(transcript);
            setOrderText(transcript);
          }
        } catch (err) {
          console.error("Order parsing failed:", err);
          console.error("Flask API URL used:", flaskApi);
          
          // Fallback: try manual parsing
          processVoiceOrder(transcript);
          setOrderText(transcript);
          
          // Show error only if it's a connection issue
          if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('ERR_CONNECTION_REFUSED')) {
            const errorMsg = `⚠️ Cannot connect to Flask backend server.\n\n` +
              `Current Flask URL: ${flaskApi}\n` +
              `Expected: http://localhost:5050\n\n` +
              `Please check:\n` +
              `1. Flask server is running on port 5050\n` +
              `2. Update frontend/.env file: VITE_FLASK_API_URL=http://localhost:5050\n` +
              `3. Restart frontend dev server after updating .env\n\n` +
              `Using basic parsing as fallback.`;
            alert(errorMsg);
          } else if (err.name === 'AbortError' || err.message.includes('timeout')) {
            alert("⏱️ Request timed out. Using basic parsing.");
          } else {
            console.error("Unexpected error:", err);
            alert(`Error processing order: ${err.message}\n\nUsing basic parsing as fallback.`);
          }
        } finally {
          setIsProcessing(false);
        }
      };

      recognition.onerror = (event) => {
        console.error("Voice recognition error:", event.error);
        setRecording(false);
        setIsProcessing(false);
        
        if (event.error === 'no-speech') {
          alert("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          alert("Microphone permission denied. Please allow microphone access.");
        } else {
          alert("Voice recognition error. Please try again or use menu buttons.");
        }
      };

      recognition.onend = () => {
        setRecording(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (err) {
      console.error("Error starting voice recognition:", err);
      alert("Failed to start voice input. Please try again or use menu buttons.");
      setRecording(false);
    }
  };

const handleResetCart = () => {
  setCart({});
  localStorage.removeItem("terra_cart");
};

const handleOrderAgain = async () => {
  if (!orderStatus || reordering) return;
  setIsOrderingMore(true);
  setReordering(true);
  try {
    const storedTable = localStorage.getItem("terra_selectedTable");
    const storedSession = sessionToken || localStorage.getItem("terra_sessionToken");
    if (!storedTable || !storedSession) {
      alert("We couldn't detect your table. Please scan the table QR again or contact staff.");
      return;
    }

    let previousDetailForDisplay = null;
    if (activeOrderId) {
      try {
        const prevRes = await fetch(`${nodeApi}/api/orders/${activeOrderId}`);
        if (prevRes.ok) {
          previousDetailForDisplay = await prevRes.json();
        }
      } catch (err) {
        console.warn("Failed to load previous order detail", err);
      }
    }

    const table = JSON.parse(storedTable);
    const slug = table.qrSlug || localStorage.getItem("terra_scanToken");
    const params = new URLSearchParams();
    params.set("sessionToken", storedSession);
    const url = `${nodeApi}/api/tables/lookup/${slug}?${params.toString()}`;
    let res = await fetch(url);
    let payload = await res.json().catch(() => ({}));

    if (res.status === 423) {
      const lockedMessage =
        payload?.message || "Table is currently assigned to another guest.";

      if (storedSession) {
        // Session might be stale (table released). Try once without the old token.
        console.warn("Stale session detected, retrying table lookup without session token.");
        localStorage.removeItem("terra_sessionToken");
        setSessionToken(null);

        const retryParams = new URLSearchParams();
        const retryQuery = retryParams.toString();
        const retryUrl = `${nodeApi}/api/tables/lookup/${slug}${retryQuery ? `?${retryQuery}` : ""}`;
        const retryRes = await fetch(retryUrl);
        const retryPayload = await retryRes.json().catch(() => ({}));

        if (!retryRes.ok) {
          throw new Error(
            retryPayload?.message ||
              lockedMessage ||
              "Unable to refresh table session. Please ask staff for help."
          );
        }

        res = retryRes;
        payload = retryPayload;
      } else {
        throw new Error(lockedMessage);
      }
    } else if (!res.ok) {
      throw new Error(payload?.message || "Failed to refresh table session. Please ask staff for help.");
    }

    if (payload.sessionToken) {
      localStorage.setItem("terra_sessionToken", payload.sessionToken);
      setSessionToken(payload.sessionToken);
    }
    if (payload.table) {
      localStorage.setItem("terra_selectedTable", JSON.stringify(payload.table));
      setTableInfo(payload.table);
    }
    // CRITICAL: Only store waitlist token if table is NOT available
    const tableStatus = payload.table?.status || "AVAILABLE";
    if (tableStatus === "AVAILABLE") {
      // Table is available - clear waitlist token (no waitlist logic)
      localStorage.removeItem("terra_waitToken");
    } else if (payload.waitlist?.token) {
      // Table is NOT available - store waitlist token
      localStorage.setItem("terra_waitToken", payload.waitlist.token);
    } else {
      localStorage.removeItem("terra_waitToken");
    }

    const resolvedTable = payload.table || table;

    if (payload.order) {
      setActiveOrderId(payload.order._id);
      localStorage.setItem("terra_orderId", payload.order._id);
      setOrderStatus(payload.order.status || orderStatus || "Confirmed");
      if (payload.order.updatedAt) {
        setOrderStatusUpdatedAt(payload.order.updatedAt);
        localStorage.setItem("terra_orderStatusUpdatedAt", payload.order.updatedAt);
      }
      persistPreviousOrder(null);
    } else {
      // If no order returned but we have an activeOrderId, keep the existing order status
      // Don't clear it - the user might be ordering more items to the same order
      if (activeOrderId) {
        // Keep existing order status - user is adding more items to existing order
        console.log("No order returned from table lookup, keeping existing order status");
      } else {
        // Only clear if we don't have an active order
        capturePreviousOrder({
          status: orderStatus || "Completed",
          updatedAt: orderStatusUpdatedAt || new Date().toISOString(),
          tableNumber:
            resolvedTable?.number ??
            resolvedTable?.tableNumber ??
            null,
          tableSlug: resolvedTable?.qrSlug ?? slug ?? null,
          tableInfo: resolvedTable,
        });
        setOrderStatus(null);
        setOrderStatusUpdatedAt(null);
        setActiveOrderId(null);
        localStorage.removeItem("terra_orderId");
        localStorage.removeItem("terra_orderStatus");
        localStorage.removeItem("terra_orderStatusUpdatedAt");
      }
    }

    if (previousDetailForDisplay) {
      persistPreviousOrderDetail(previousDetailForDisplay);
    }

    alert("You can continue adding items to your order.");
  } catch (err) {
    console.error("handleOrderAgain error", err);
    alert(err.message || "Unable to resume ordering. Please contact staff.");
  } finally {
    setReordering(false);
    setIsOrderingMore(false);
  }
};

const handleCancelOrder = async () => {
  if (!activeOrderId) {
    alert("No active order found.");
    return;
  }
  if (!window.confirm("Are you sure you want to cancel this order?")) {
    return;
  }

  setCancelling(true);
  try {
    const sessionToken = localStorage.getItem("terra_sessionToken");
    const res = await fetch(`${nodeApi}/api/orders/${activeOrderId}/customer-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        status: "Cancelled",
        sessionToken: serviceType === "DINE_IN" ? (sessionToken || undefined) : undefined
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Failed to cancel order");
    }

    const updatedOrder = data?._id ? data : null;
    const updatedAt = updatedOrder?.updatedAt || new Date().toISOString();

    capturePreviousOrder({
      orderId: updatedOrder?._id,
      status: "Cancelled",
      updatedAt,
      tableNumber:
        updatedOrder?.tableNumber ??
        tableInfo?.number ??
        tableInfo?.tableNumber ??
        null,
      tableSlug:
        updatedOrder?.table?.qrSlug ??
        tableInfo?.qrSlug ??
        localStorage.getItem("terra_scanToken") ??
        null,
      tableInfo: updatedOrder?.table || tableInfo,
    });

    if (updatedOrder) {
      persistPreviousOrderDetail(updatedOrder);
    }

    setOrderStatus(null);
    setOrderStatusUpdatedAt(null);
    setActiveOrderId(null);
    localStorage.removeItem("terra_orderId");
    localStorage.removeItem("terra_orderStatus");
    localStorage.removeItem("terra_orderStatusUpdatedAt");
    localStorage.removeItem("terra_cart");
    setCart({});
    setIsOrderingMore(false);
    alert("Your order has been cancelled.");
  } catch (err) {
    console.error("handleCancelOrder error", err);
    alert(err.message || "Unable to cancel order. Please contact staff.");
  } finally {
    setCancelling(false);
  }
};

const handleReturnOrder = async () => {
  if (!activeOrderId) {
    alert("No active order found.");
    return;
  }
  if (!window.confirm("Are you sure you want to return this order?")) {
    return;
  }

  setReturning(true);
  try {
    const sessionToken = localStorage.getItem("terra_sessionToken");
    const res = await fetch(`${nodeApi}/api/orders/${activeOrderId}/customer-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        status: "Returned",
        sessionToken: serviceType === "DINE_IN" ? (sessionToken || undefined) : undefined
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Failed to return order");
    }

    const updatedOrder = data?._id ? data : null;
    const updatedAt = updatedOrder?.updatedAt || new Date().toISOString();

    capturePreviousOrder({
      orderId: updatedOrder?._id,
      status: "Returned",
      updatedAt,
      tableNumber:
        updatedOrder?.tableNumber ??
        tableInfo?.number ??
        tableInfo?.tableNumber ??
        null,
      tableSlug:
        updatedOrder?.table?.qrSlug ??
        tableInfo?.qrSlug ??
        localStorage.getItem("terra_scanToken") ??
        null,
      tableInfo: updatedOrder?.table || tableInfo,
    });

    if (updatedOrder) {
      persistPreviousOrderDetail(updatedOrder);
    }

    setOrderStatus("Returned");
    setOrderStatusUpdatedAt(updatedAt);
    setActiveOrderId(null);
    localStorage.removeItem("terra_orderId");
    localStorage.removeItem("terra_cart");
    setCart({});
    setIsOrderingMore(false);
    alert("Your order has been marked as returned.");
  } catch (err) {
    console.error("handleReturnOrder error", err);
    alert(err.message || "Unable to return order. Please contact staff.");
  } finally {
    setReturning(false);
  }
};

const handleViewInvoice = useCallback(async () => {
  if (!activeOrderId) {
    alert("We couldn't locate your order. Please contact staff.");
    return;
  }
  try {
    setInvoiceLoading(true);
    const res = await fetch(`${nodeApi}/api/orders/${activeOrderId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Failed to load invoice details.");
    }
    
    // Debug logging
    console.log("📄 Invoice order data:", {
      orderId: data._id,
      franchiseId: data.franchiseId,
      cafeId: data.cafeId,
      franchise: data.franchise,
      cafe: data.cafe,
    });
    
    setInvoiceOrder(data);
    setShowInvoiceModal(true);
  } catch (err) {
    console.error("Invoice fetch failed", err);
    alert(err.message || "Unable to load invoice. Please contact staff.");
  } finally {
    setInvoiceLoading(false);
  }
}, [activeOrderId]);

const closeInvoiceModal = useCallback(() => {
  setShowInvoiceModal(false);
  setInvoiceOrder(null);
  setPrintingInvoice(false);
  setDownloadingInvoice(false);
  setInvoiceLoading(false);
}, []);

const handlePrintInvoice = useCallback(() => {
  if (!invoiceRef.current || !invoiceOrder || printingInvoice) return;
  setPrintingInvoice(true);
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
    setPrintingInvoice(false);
    document.body.removeChild(iframe);
    alert("Print preview failed to open.");
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${invoiceId || "Invoice"}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 32px;
            background: #ffffff;
            color: #1f2933;
          }
          h1, h2, h3, h4 { margin: 0; }
          table { border-collapse: collapse; width: 100%; }
          th, td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
          th { text-align: left; color: #475569; font-weight: 600; }
          .invoice-shell {
            max-width: 720px;
            margin: 0 auto;
            padding: 24px;
            border: 1px solid #d2d6dc;
            border-radius: 12px;
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
      setPrintingInvoice(false);
    }, 100);
  };
}, [invoiceId, invoiceOrder, printingInvoice]);

const handleDownloadInvoice = useCallback(async () => {
  if (!invoiceRef.current || !invoiceOrder || downloadingInvoice) return;
  setDownloadingInvoice(true);
  try {
    const canvas = await html2canvas(invoiceRef.current, {
      scale: window.devicePixelRatio || 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const imageData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
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

    pdf.save(`${invoiceId || "invoice"}.pdf`);
  } catch (err) {
    console.error("Invoice download failed", err);
    alert("Failed to generate invoice PDF. Please try again.");
  } finally {
    setDownloadingInvoice(false);
  }
}, [invoiceId, invoiceOrder, downloadingInvoice]);

const handleBillingClick = useCallback(async () => {
  // Show invoice for Preparing, Ready, Served, Finalized, and Paid orders
  // Confirmed orders should allow payment, so they navigate to billing
  const invoiceableStatuses = ["Preparing", "Ready", "Served", "Finalized", "Paid"];
  
  if (invoiceableStatuses.includes(orderStatus)) {
    await handleViewInvoice();
    return;
  }

  if (orderStatus === "Returned" || orderStatus === "Cancelled") {
    alert(
      orderStatus === "Returned"
        ? "This order has already been returned."
        : "This order has been cancelled."
    );
    return;
  }

  // For Confirmed and other statuses, navigate to billing page
  navigate("/billing");
}, [orderStatus, handleViewInvoice, navigate]);

const handleViewPreviousInvoice = useCallback(() => {
  if (!previousOrderDetail) return;
  setInvoiceLoading(false);
  setInvoiceOrder(previousOrderDetail);
  setShowInvoiceModal(true);
}, [previousOrderDetail]);

  const processVoiceOrder = (text) => {
    if (!text) return;
    const updatedCart = { ...cart };
    const catalogItems = Object.values(menuCatalog);
    const fallbackItems = !catalogItems.length
      ? fallbackMenuItems.map((item) => ({
          ...item,
          isAvailable: true,
        }))
      : catalogItems;

    text
      .split(",")
      .map((entry) => entry.trim())
      .forEach((entry) => {
        const match = entry.match(/(\d+)\s+(.*)/);
        if (!match) return;
        const qty = parseInt(match[1], 10);
        const itemName = match[2];
        if (!qty || !itemName) return;
        const matchedItem =
          fallbackItems.find(
            (item) => item.name.toLowerCase() === itemName.toLowerCase()
          ) ||
          fallbackItems.find((item) =>
            item.name.toLowerCase().includes(itemName.toLowerCase())
          );
        if (matchedItem && matchedItem.isAvailable !== false) {
          updatedCart[matchedItem.name] =
            (updatedCart[matchedItem.name] || 0) + qty;
        }
      });
    setCart(updatedCart);
  };

  const speakOrderSummary = () => {
    if (Object.keys(cart).length === 0) return alert(cartEmptyText);
    const synth = window.speechSynthesis;
    let speechText = "You have ordered: ";
    Object.entries(cart).forEach(([item, quantity]) => {
      speechText += `${quantity} ${item}, `;
    });
    const utter = new SpeechSynthesisUtterance(speechText);
    utter.rate = 0.9;
    utter.pitch = 1;
    synth.speak(utter);
  };

  useEffect(() => {
    if (!activeOrderId) {
      setOrderStatus(null);
      setOrderStatusUpdatedAt(null);
      return;
    }

    if (isOrderingMore) {
      return;
    }

    let socket;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${nodeApi}/api/orders/${activeOrderId}`);
        if (!res.ok) {
          // If fetch fails, keep the existing orderStatus from localStorage
          // Don't overwrite it with null/undefined
          console.warn("Failed to fetch order status, keeping existing status");
          return;
        }
        const data = await res.json();
        if (data?.status) {
          setOrderStatus(data.status);
          setOrderStatusUpdatedAt(new Date().toISOString());
        }
      } catch (err) {
        // If fetch fails, keep the existing orderStatus from localStorage
        // Don't overwrite it with null/undefined
        console.warn("Error fetching order status, keeping existing status:", err);
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 20000);

    socket = io(nodeApi);
    socket.on("orderUpdated", (payload) => {
      if (payload?._id === activeOrderId && payload?.status) {
        setOrderStatus(payload.status);
        setOrderStatusUpdatedAt(new Date().toISOString());
      }
    });
    socket.on("orderDeleted", (payload) => {
      if (payload?.id === activeOrderId) {
        setOrderStatus(null);
        setActiveOrderId(null);
        localStorage.removeItem("terra_orderId");
        localStorage.removeItem("terra_orderStatus");
        localStorage.removeItem("terra_orderStatusUpdatedAt");
      }
    });

    return () => {
      clearInterval(timer);
      if (socket) socket.disconnect();
    };
  }, [activeOrderId, isOrderingMore]);

  return (
    <div className={`menu-root ${accessibilityMode ? "accessibility-mode" : ""}`}>
      {/* Background image + overlay */}
      <div
        className="background-image"
        style={{ backgroundImage: `url(${restaurantBg})` }}
      ></div>

      <div className="overlay"></div>

      <div className="content-wrapper">
        <Header accessibilityMode={accessibilityMode} />

        <div className="main-container">
          <div className="panels-container">
          
            {/* Left Panel - Smart Serve */}
            <div className="left-panel">
              <h3 className="smart-serve-title">{smartServe}</h3>

              <div className="service-context">
                <span className="service-badge">
                  {serviceType === "DINE_IN"
                    ? tableInfo?.number
                      ? `Dine-In · Table ${tableInfo.number}`
                      : "Dine-In"
                    : "Takeaway"}
                </span>
              </div>

              <button
  onClick={handleVoiceOrder}
  className={`voice-button ${recording ? "recording" : ""}`}
  aria-pressed={recording}
  aria-label={recordVoiceAria}
>
  {recording ? <FiMicOff /> : <FiMic />}
</button>


              <p className="instruction-text">
  {isProcessing ? processingText : recording ? tapToStop : tapToOrder}
</p>


              {orderText && (
                <p className="ai-ordered-text">
                  {aiOrdered} <span className="order-text-italic">{orderText}</span>
                </p>
              )}

              {Object.keys(cart).length > 0 && (
                <div className="order-summary-section">
                  <h4 className="order-summary-title">{orderSummary}</h4>
                  <ul className="summary-list">
                    {Object.entries(cart).map(([item, qty], idx) => (
                      <TranslatedSummaryItem key={idx} item={item} qty={qty} />
                    ))}
                  </ul>

                  <div className="button-group">
                    <button onClick={handleContinue} className="confirm-button">
                      {confirmBtn}
                    </button>

                    <button onClick={speakOrderSummary} className="speak-button">
                      <HiSpeakerWave className="speaker-icon" /> {speakBtn}
                    </button>

                    <button onClick={handleResetCart} className="reset-button">
                      {resetBtn}
                    </button>
                  </div>
                </div>
              )}

              {orderStatus && (
                <div className="order-status-card">
                  <h4 className="order-summary-title">Order Status</h4>
                  <div className="order-status-section">
                    <OrderStatus status={orderStatus} updatedAt={orderStatusUpdatedAt} />
                  </div>
                  <div className="button-group status-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Row 1, Col 1: Complete Payment Button */}
                    {orderStatus !== "Returned" && orderStatus !== "Cancelled" && (
                      <button
                        className="billing-button"
                        onClick={() => {
                          if (["Preparing", "Ready", "Served", "Finalized", "Paid"].includes(orderStatus)) {
                            // For these statuses, Complete Payment shows invoice
                            handleViewInvoice();
                          } else {
                            // For Confirmed and other statuses, navigate to billing
                            navigate("/billing");
                          }
                        }}
                        disabled={
                          (["Preparing", "Ready", "Served", "Finalized", "Paid"].includes(orderStatus) && invoiceLoading)
                        }
                      >
                        {invoiceLoading && ["Preparing", "Ready", "Served", "Finalized", "Paid"].includes(orderStatus)
                          ? "Opening..."
                          : "Complete Payment"}
                      </button>
                    )}
                    
                    {/* Row 1, Col 2: View Invoice Button - Show for Confirmed, Preparing, Ready, Served, Finalized, Paid */}
                    {["Confirmed", "Preparing", "Ready", "Served", "Finalized", "Paid"].includes(orderStatus) ? (
                      <button
                        className="billing-button"
                        onClick={handleViewInvoice}
                        disabled={invoiceLoading}
                      >
                        {invoiceLoading ? "Opening..." : "View Invoice"}
                      </button>
                    ) : orderStatus === "Returned" || orderStatus === "Cancelled" ? (
                      <button
                        className="billing-button billing-button-disabled"
                        disabled
                      >
                        {orderStatus === "Returned" ? "Order Returned" : "Order Cancelled"}
                      </button>
                    ) : null}
                    
                    {/* Row 2, Col 1: Order More Button */}
                    <button
                      className="confirm-button"
                      onClick={handleOrderAgain}
                      disabled={
                        reordering ||
                        (orderStatus && !REORDER_ALLOWED_STATUSES.includes(orderStatus))
                      }
                    >
                      {reordering ? "Please wait..." : "Order More"}
                    </button>
                    
                    {/* Row 2, Col 2: Cancel Order / Return Order / Share Feedback */}
                    {orderStatus && CANCEL_ALLOWED_STATUSES.includes(orderStatus) ? (
                      <button
                        className="reset-button cancel-button"
                        onClick={handleCancelOrder}
                        disabled={cancelling}
                      >
                        {cancelling ? "Cancelling..." : "Cancel Order"}
                      </button>
                    ) : orderStatus && RETURN_ALLOWED_STATUSES.includes(orderStatus) ? (
                      <button
                        className="reset-button return-button"
                        onClick={handleReturnOrder}
                        disabled={returning}
                      >
                        {returning ? "Processing..." : "Return Order"}
                      </button>
                    ) : (orderStatus === "Paid" || orderStatus === "Completed") ? (
                      <button
                        className="feedback-button"
                        onClick={() => {
                          const orderId = activeOrderId || localStorage.getItem("terra_orderId") || localStorage.getItem("terra_lastPaidOrderId");
                          navigate("/feedback", { state: { orderId } });
                        }}
                        style={{
                          backgroundColor: '#10b981',
                          color: '#ffffff',
                          border: '1px solid #059669',
                          fontWeight: '600'
                        }}
                      >
                        <span style={{ color: '#ffffff' }}>Share Feedback</span>
                      </button>
                    ) : null}
                  </div>
                  <p className="status-hint">
                    Status updates automatically. Please wait while the staff prepares your order.
                  </p>
                </div>
              )}

              {previousOrderDetail && (
                <div className="order-status-card previous-order-detail-card" style={{ padding: '12px', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 className="order-summary-title" style={{ margin: 0, fontSize: '1rem' }}>Last Order</h4>
                    {previousOrderDetail.status && (
                      <span className="meta-chip status-chip" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                        {previousOrderDetail.status}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    {previousDetailInvoiceId && (
                      <span className="meta-chip" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                        {previousDetailInvoiceId}
                      </span>
                    )}
                    {previousDetailTimestamp && (
                      <span className="meta-chip" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                        {previousDetailTimestamp.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div style={{ marginBottom: '8px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                      <span>Total: ₹{formatMoney(previousDetailTotals.totalAmount)}</span>
                      <span>{previousDetailTotals.totalItems} items</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="invoice-action-btn download"
                      onClick={handleViewPreviousInvoice}
                      style={{ flex: 1, padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      View Invoice
                    </button>
                    {(previousOrderDetail.status === "Paid" || previousOrderDetail.status === "Completed") && (
                      <button
                        className="feedback-button"
                        onClick={() => {
                          const orderId = previousOrderDetail._id;
                          navigate("/feedback", { state: { orderId } });
                        }}
                        style={{
                          flex: 1,
                          backgroundColor: '#10b981',
                          color: '#ffffff',
                          border: '1px solid #059669',
                          fontWeight: '600',
                          padding: '6px 12px',
                          fontSize: '0.85rem'
                        }}
                      >
                        Feedback
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          

            {/* Right Panel - Manual / Menu */}
            <div className="right-panel">
              <h3 className="manual-entry-title">{menuHeading}</h3>

              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />

              {menuError && !menuLoading && (
                <div className="menu-warning">{menuError}</div>
              )}

              {menuLoading ? (
                <div className="menu-loading-message">Loading menu, please wait...</div>
              ) : searchQuery.trim() ? (
                filteredItems.length > 0 ? (
                  <div className="search-results">
                    {filteredItems.map((item) => (
                      <TranslatedItem
                        key={item._id || item.name}
                        item={item}
                        onAdd={handleAdd}
                        onRemove={handleRemove}
                        count={cart[item.name] || 0}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="search-no-results">
                    No matching items found. Try another keyword.
                  </div>
                )
              ) : (
                <div className="category-container">
                  {menuCategories.length === 0 ? (
                    <div className="search-no-results">
                      Menu is not configured yet. Please contact the administrator.
                    </div>
                  ) : (
                    menuCategories.map((category) => (
                      <CategoryBlock
                        key={category._id || category.name}
                        category={category.name}
                        items={category.items || []}
                        openCategory={openCategory}
                        setOpenCategory={setOpenCategory}
                        cart={cart}
                        onAdd={handleAdd}
                        onRemove={handleRemove}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {showInvoiceModal && (
        <div className="invoice-modal-overlay" onClick={closeInvoiceModal}>
          <div
            className="invoice-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invoice-modal-header">
              <div>
                <h3>Invoice</h3>
                {invoiceOrder && (
                  <div className="invoice-meta">
                    <span>{`Order #${invoiceOrder._id || "—"}`}</span>
                    {invoiceTimestamp && (
                      <span>{invoiceTimestamp.toLocaleString()}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="invoice-modal-actions">
                <button
                  onClick={handlePrintInvoice}
                  disabled={!invoiceOrder || printingInvoice}
                  className="invoice-action-btn"
                >
                  {printingInvoice ? "Preparing…" : "Print"}
                </button>
                <button
                  onClick={handleDownloadInvoice}
                  disabled={!invoiceOrder || downloadingInvoice}
                  className="invoice-action-btn download"
                >
                  {downloadingInvoice ? "Preparing…" : "Download"}
                </button>
                <button
                  onClick={closeInvoiceModal}
                  className="invoice-close-btn"
                  aria-label="Close invoice modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div ref={invoiceRef} className="invoice-preview">
              <div className="invoice-top">
                <div>
                  <div className="brand-name">{invoiceOrder?.cafe?.cafeName || invoiceOrder?.cafe?.name || "Sarva Cafe"}</div>
                  <div className="brand-address">
                    {invoiceOrder?.cafe?.address || invoiceOrder?.franchise?.address || "123 Main Street, City"}
                  </div>
                  {invoiceOrder?.franchise?.gstNumber ? (
                    <div className="brand-address">GSTIN: {invoiceOrder.franchise.gstNumber}</div>
                  ) : invoiceOrder?.franchiseId ? (
                    <div className="brand-address" style={{ color: '#999', fontSize: '0.9em' }}>
                      GSTIN: Not configured
                    </div>
                  ) : null}
                </div>
                <div className="invoice-meta-block">
                  <div className="meta-line">
                    <span>Invoice No:</span>
                    <span>{invoiceId || "—"}</span>
                  </div>
                  {invoiceTimestamp && (
                    <>
                      <div className="meta-line">
                        <span>Date:</span>
                        <span>{invoiceTimestamp.toLocaleDateString()}</span>
                      </div>
                      <div className="meta-line">
                        <span>Time:</span>
                        <span>{invoiceTimestamp.toLocaleTimeString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="invoice-billed">
                <div className="meta-line">
                  <span>Service:</span>
                  <span>{invoiceServiceLabel}</span>
                </div>
                <div className="meta-line">
                  <span>Table:</span>
                  <span>
                    {invoiceOrder?.serviceType === "TAKEAWAY"
                      ? "Takeaway Counter"
                      : invoiceTableNumber || "—"}
                    {invoiceTableName ? ` · ${invoiceTableName}` : ""}
                  </span>
                </div>
                {/* Customer information for takeaway orders */}
                {invoiceOrder?.serviceType === "TAKEAWAY" && (invoiceOrder.customerName || invoiceOrder.customerMobile) && (
                  <>
                    {invoiceOrder.customerName && (
                      <div className="meta-line">
                        <span>Customer Name:</span>
                        <span>{invoiceOrder.customerName}</span>
                      </div>
                    )}
                    {invoiceOrder.customerMobile && (
                      <div className="meta-line">
                        <span>Mobile Number:</span>
                        <span>{invoiceOrder.customerMobile}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price (₹)</th>
                    <th className="align-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceItems.length > 0 ? (
                    invoiceItems.map((item) => (
                      <tr key={item.name}>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span>{item.name}</span>
                            {item.returned && (
                              <span className="invoice-returned-note">
                                Returned {item.returnedQuantity}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{item.quantity > 0 ? item.quantity : "—"}</td>
                        <td>₹{formatMoney(item.unitPrice)}</td>
                        <td className="align-right">
                          {item.quantity > 0
                            ? `₹${formatMoney(item.amount)}`
                            : "Returned"}
                        </td>
                      </tr>
                    ))
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
                  <span>Total Items</span>
                  <span>{invoiceTotals.totalItems}</span>
                </div>
                <div className="meta-line">
                  <span>Subtotal</span>
                  <span>₹{formatMoney(invoiceTotals.subtotal)}</span>
                </div>
                <div className="meta-line">
                  <span>GST</span>
                  <span>₹{formatMoney(invoiceTotals.gst)}</span>
                </div>
                <div className="meta-line total">
                  <span>Total</span>
                  <span>₹{formatMoney(invoiceTotals.totalAmount)}</span>
                </div>
              </div>

              <div className="invoice-footer">
                Thank you for dining with Sarva Cafe. We hope to see you again!
              </div>
            </div>
          </div>
        </div>
      )}

      <ProcessOverlay
        open={processOpen}
        steps={processSteps}
        title="Processing your order"
      />
    </div>
  );
}
