import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { FiArrowLeft, FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";
import fallbackMenuItems from "../data/menuData";
import "./CartPage.css";
import { buildOrderPayload } from "../utils/orderUtils";
import { postWithRetry } from "../utils/fetchWithTimeout";
import ProcessOverlay from "../components/ProcessOverlay";
import restaurantBg from "../assets/images/restaurant-img.jpg"; // reuse if needed or use transparent
import { io } from "socket.io-client"; // Actually, we probably don't need socket here if we just POST
// But let's keep imports minimal

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");
const sanitizeAddonName = (value) => {
  const normalized = String(value || "")
    .replace(/^\(\s*\+\s*\)\s*/u, "")
    .trim();
  return normalized || "Add-on";
};

function getImageUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://"))
    return imagePath;
  if (imagePath.startsWith("/")) return `${nodeApi}${imagePath}`;
  return `${nodeApi}/uploads/${imagePath}`;
}

async function getCartId(searchParams) {
  try {
    // Priority 1: URL parameter "cart" or "cartId" (Explicit override)
    const urlCartId = searchParams?.get("cart") || searchParams?.get("cartId");
    if (urlCartId) {
      console.log("[CartPage] getCartId - from URL params:", urlCartId);
      return urlCartId;
    }

    // Priority 2: Check localStorage for selected cart
    const selectedCartId = localStorage.getItem("terra_selectedCartId");
    if (selectedCartId) {
      console.log(
        "[CartPage] getCartId - from terra_selectedCartId:",
        selectedCartId,
      );
      return selectedCartId;
    }

    // Priority 2: Check localStorage for takeaway cart
    const qrCartId = localStorage.getItem("terra_takeaway_cartId");
    if (qrCartId) {
      console.log(
        "[CartPage] getCartId - from terra_takeaway_cartId:",
        qrCartId,
      );
      return qrCartId;
    }

    // Priority 3: Check localStorage table data
    const tableData = JSON.parse(
      localStorage.getItem("terra_selectedTable") ||
        localStorage.getItem("terra_table_selection") ||
        "{}",
    );
    let id = tableData.cartId || tableData.cafeId || "";
    // Normalize: cartId may be string or object (e.g. { _id: "..." } or { id: "..." }) from API
    let finalId = "";
    if (id != null && id !== "") {
      if (typeof id === "string") {
        finalId = id;
      } else if (typeof id === "object") {
        const raw = id._id ?? id.id ?? id;
        finalId = typeof raw === "string" ? raw : raw?.toString?.() || "";
      }
    }

    if (finalId) {
      console.log(
        "[CartPage] getCartId - from table data:",
        finalId,
        "raw:",
        id,
      );
      return finalId;
    }

    // Priority 4: If table ID in URL but no cartId, fetch cartId from backend (public endpoint)
    const tableId = searchParams?.get("table");
    if (tableId) {
      console.log(
        "[CartPage] getCartId - table ID in URL, fetching cartId from API:",
        tableId,
      );
      try {
        const res = await fetch(
          `${nodeApi}/api/tables/public-cart-id/${encodeURIComponent(tableId)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const fetchedCartId = data.cartId || "";
          if (fetchedCartId) {
            console.log(
              "[CartPage] getCartId - got cartId from table API:",
              fetchedCartId,
            );
            return fetchedCartId;
          }
        }
      } catch (err) {
        console.error(
          "[CartPage] getCartId - failed to fetch cartId by table ID:",
          err,
        );
      }
    }

    console.warn("[CartPage] getCartId - no cartId found anywhere");
    return "";
  } catch (e) {
    console.error("[CartPage] getCartId error:", e);
  }
  return "";
}

export default function CartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cart, setCart] = useState({});
  const [menuCatalog, setMenuCatalog] = useState(
    fallbackMenuItems.map((i) => ({ ...i, price: i.price * 100 })) || [],
  );
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true",
  );
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [addonList, setAddonList] = useState([]); // Start empty, will be set by fetchAddons
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [cartId, setCartId] = useState(""); // Current cart id – add-ons are scoped per cart

  // Process Overlay State
  const initialProcessSteps = [
    { label: "Checking your order", state: "pending" },
    { label: "Confirming items & price", state: "pending" },
    { label: "Placing your order", state: "pending" },
    { label: "Sending to kitchen", state: "pending" },
    { label: "Preparing order details", state: "pending" },
  ];
  const [processOpen, setProcessOpen] = useState(false);
  const [processSteps, setProcessSteps] = useState(initialProcessSteps);

  const setStepState = (index, state) =>
    setProcessSteps((steps) =>
      steps.map((s, i) => (i === index ? { ...s, state } : s)),
    );

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const DUR = {
    validate: 1500,
    order: 1500,
    beforeSend: 1000,
    kitchen: 1500,
    error: 2000,
  };

  useEffect(() => {
    // Load Cart (add-ons are loaded below, scoped by cartId)
    try {
      const savedCart = JSON.parse(localStorage.getItem("terra_cart") || "{}");
      setCart(savedCart);
    } catch (e) {
      console.error("Error loading cart", e);
    }

    // Get cartId (async) then load add-ons scoped by this cart
    getCartId(searchParams).then((resolvedCartId) => {
      setCartId(resolvedCartId);
      console.log("[CartPage] Using cartId:", resolvedCartId);

      // Do not restore add-ons from localStorage: when user comes for the first time,
      // no add-on should be pre-selected; they must select explicitly.
      // selectedAddOns stays as initial [] until user toggles add-ons.

      const fetchMenu = async (cartId) => {
        try {
          const endpoint = cartId
            ? `${nodeApi}/api/menu/public?cartId=${cartId}`
            : `${nodeApi}/api/menu/public`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            const items = [];
            if (Array.isArray(data)) {
              data.forEach((cat) => {
                if (cat.items) items.push(...cat.items);
              });
            }
            setMenuCatalog([...items, ...fallbackMenuItems]);
          }
        } catch (err) {
          console.error("Failed to fetch menu", err);
        }
      };

      const fetchAddons = async (cartIdForAddons, tableIdFromUrl) => {
        setAddonsLoading(true);
        const tableId = tableIdFromUrl || searchParams?.get("table") || "";
        if (!cartIdForAddons && !tableId) {
          console.log("[CartPage] No cartId or tableId found for add-ons");
          setAddonList([]);
          localStorage.removeItem("terra_global_addons");
          setAddonsLoading(false);
          return;
        }
        try {
          const params = new URLSearchParams();
          if (cartIdForAddons) params.set("cartId", cartIdForAddons);
          if (tableId) params.set("tableId", tableId);
          const url = `${nodeApi}/api/addons/public?${params.toString()}`;
          console.log(
            "[CartPage] Fetching add-ons from:",
            url,
            "cartId:",
            cartIdForAddons,
            "tableId:",
            tableId,
          );
          const res = await fetch(url);
          console.log("[CartPage] Add-ons response status:", res.status);
          if (res.ok) {
            const json = await res.json();
            console.log("[CartPage] Add-ons response:", json);

            // Check if response has success flag and data
            if (json.success === false) {
              console.warn(
                "[CartPage] API returned success: false, message:",
                json.message,
              );
              // Use empty array - admin hasn't configured add-ons or error occurred
              setAddonList([]);
              localStorage.removeItem("terra_global_addons");
              setAddonsLoading(false);
              return;
            }

            const list = (json.data || json || []).map((a) => ({
              id: (a._id || a.id || "").toString(),
              name: sanitizeAddonName(a.name),
              price: Number(a.price) || 0,
              icon: a.icon || "",
            }));
            console.log("[CartPage] Parsed add-ons list:", list);

            // Always use API result (even if empty) - don't fallback to static
            setAddonList(list);
            if (list.length > 0) {
              localStorage.setItem("terra_global_addons", JSON.stringify(list));
              console.log(
                "[CartPage] ✅ Set",
                list.length,
                "add-ons from API:",
                list.map((a) => a.name),
              );
            } else {
              localStorage.removeItem("terra_global_addons");
              console.warn(
                "[CartPage] ⚠️ No add-ons found for cartId/tableId:",
                cartIdForAddons || tableId,
                "- Admin should create add-ons in Global Add-ons page",
              );
            }
          } else {
            // API error (400, 404, 500, etc.) - try to parse error message
            let errorMsg = `HTTP ${res.status}`;
            try {
              const errorJson = await res.json();
              errorMsg = errorJson.message || errorMsg;
              console.error(
                "[CartPage] Add-ons API error response:",
                errorJson,
              );
            } catch (e) {
              console.error(
                "[CartPage] Add-ons fetch failed with status:",
                res.status,
                "Could not parse error",
              );
            }

            // For 400 (bad request - cartId required), use empty instead of static
            if (res.status === 400) {
              console.warn(
                "[CartPage] Bad request (400) - cartId might be invalid. Using empty add-ons list.",
              );
              setAddonList([]);
              localStorage.removeItem("terra_global_addons");
            } else {
              console.warn("[CartPage] API failed:", errorMsg);
              setAddonList([]);
              localStorage.removeItem("terra_global_addons");
            }
          }
        } catch (err) {
          // Network error or other exception
          console.error(
            "[CartPage] Failed to fetch add-ons (network error):",
            err,
          );
          console.warn(
            "[CartPage] Using empty add-ons due to network error",
          );
          setAddonList([]);
          localStorage.removeItem("terra_global_addons");
        } finally {
          setAddonsLoading(false);
        }
      };

      fetchMenu(resolvedCartId);
      fetchAddons(resolvedCartId, searchParams.get("table") || "");
    });
  }, [searchParams]);

  const updateCart = (newCart) => {
    setCart(newCart);
    localStorage.setItem("terra_cart", JSON.stringify(newCart));
  };

  const saveAddonsForCart = (addonIds) => {
    const raw = localStorage.getItem("terra_cart_addons") || "{}";
    let obj = {};
    try {
      const p = JSON.parse(raw);
      obj = Array.isArray(p) ? {} : p;
    } catch (_) {}
    if (cartId) {
      obj[cartId] = addonIds;
    } else {
      localStorage.setItem("terra_cart_addons", JSON.stringify(addonIds));
      return;
    }
    localStorage.setItem("terra_cart_addons", JSON.stringify(obj));
  };

  const clearAddonsForCart = () => {
    if (!cartId) {
      localStorage.removeItem("terra_cart_addons");
      return;
    }
    const raw = localStorage.getItem("terra_cart_addons") || "{}";
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) return;
      delete obj[cartId];
      localStorage.setItem("terra_cart_addons", JSON.stringify(obj));
    } catch (_) {}
  };

  const handleUpdateQty = (itemName, delta) => {
    const newCart = { ...cart };
    const currentQty = newCart[itemName] || 0;
    const newQty = currentQty + delta;

    if (newQty <= 0) {
      delete newCart[itemName];
    } else {
      newCart[itemName] = newQty;
    }
    updateCart(newCart);
  };

  const handleReset = () => {
    if (window.confirm("Clear cart?")) {
      updateCart({});
      setSelectedAddOns([]);
      clearAddonsForCart();
    }
  };

  const handleConfirm = async () => {
    if (Object.keys(cart).length === 0) return alert("Cart is empty");

    saveAddonsForCart(selectedAddOns);

    // Reset Steps
    setProcessSteps(
      initialProcessSteps.map((s) => ({ ...s, state: "pending" })),
    );
    setProcessOpen(true);

    try {
      // Step 0: Validating
      setStepState(0, "active");
      await wait(DUR.validate);
      setStepState(0, "done");

      // Step 1: Processing
      setStepState(1, "active");
      await wait(DUR.order);
      setStepState(1, "done");

      // Step 2: Sending
      setStepState(2, "active");
      await wait(DUR.beforeSend);

      // --- AGGREGATE ORDER CONTEXT ---
      const serviceType =
        localStorage.getItem("terra_serviceType") || "DINE_IN";
      const tableInfo = JSON.parse(
        localStorage.getItem("terra_selectedTable") || "{}",
      );
      const activeOrderId =
        serviceType === "TAKEAWAY"
          ? localStorage.getItem("terra_orderId_TAKEAWAY")
          : localStorage.getItem("terra_orderId_DINE_IN") ||
            localStorage.getItem("terra_orderId");

      let sessionToken = "";
      if (serviceType === "TAKEAWAY") {
        sessionToken = localStorage.getItem("terra_takeaway_sessionToken");
        if (!sessionToken) {
          sessionToken = `TAKEAWAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem("terra_takeaway_sessionToken", sessionToken);
        }
      } else {
        sessionToken = localStorage.getItem("terra_sessionToken");
        if (!sessionToken) {
          // Try to recover from table info
          if (tableInfo && tableInfo.sessionToken) {
            sessionToken = tableInfo.sessionToken;
            localStorage.setItem("terra_sessionToken", sessionToken);
          } else {
            sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem("terra_sessionToken", sessionToken);
          }
        }
      }

      // Prepare Add-ons
      const globalAddons = JSON.parse(
        localStorage.getItem("terra_global_addons") || "[]",
      );
      const addonLookupList = Array.isArray(globalAddons) ? globalAddons : [];
      const resolvedAddons = selectedAddOns
        .map((id) => {
          const meta = addonLookupList.find((a) => a.id === id);
          return meta
            ? { addonId: id, name: sanitizeAddonName(meta.name), price: meta.price }
            : null;
        })
        .filter(Boolean);

      // CartId
      const cartId = await getCartId(searchParams);

      const orderPayload = buildOrderPayload(cart, {
        serviceType: serviceType,
        tableId: tableInfo.id || tableInfo._id,
        tableNumber: tableInfo.number || tableInfo.tableNumber,
        menuCatalog,
        sessionToken: sessionToken,
        // Optional fields for Takeaway/Pickup (limited support on CartPage simple flow)
        customerName:
          localStorage.getItem("terra_takeaway_customerName") ||
          localStorage.getItem("terra_customerName"),
        customerMobile:
          localStorage.getItem("terra_takeaway_customerMobile") ||
          localStorage.getItem("terra_customerMobile"),
        cartId: cartId,
        specialInstructions: specialInstructions,
        selectedAddons: resolvedAddons,
      });

      // Simple Validation
      if (!orderPayload.items || orderPayload.items.length === 0) {
        throw new Error("Cart is empty or invalid items.");
      }

      // Check if existing order is finalized/paid - if so, start new order
      const activeOrderStatus =
        serviceType === "TAKEAWAY"
          ? localStorage.getItem("terra_orderStatus_TAKEAWAY")
          : localStorage.getItem("terra_orderStatus_DINE_IN") ||
            localStorage.getItem("terra_orderStatus");

      const blockedStatuses = [
        "Paid",
        "Cancelled",
        "Returned",
        "Completed",
        "Finalized",
      ];
      let finalActiveOrderId = activeOrderId;

      if (activeOrderId && blockedStatuses.includes(activeOrderStatus)) {
        console.log(
          "[CartPage] Previous order status is",
          activeOrderStatus,
          "- starting new order",
        );
        finalActiveOrderId = null;
      }

      // API Call
      const url = finalActiveOrderId
        ? `${nodeApi}/api/orders/${finalActiveOrderId}/kot`
        : `${nodeApi}/api/orders`;

      const res = await postWithRetry(
        url,
        orderPayload,
        { headers: { "Content-Type": "application/json" } },
        { maxRetries: 2, timeout: 30000 },
      );

      let data;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = {};
      }

      if (!res.ok) {
        const msg = data.message || data.error || "Failed to create order";
        throw new Error(msg);
      }

      // Success!
      setStepState(2, "done");

      // Step 3: Kitchen
      setStepState(3, "active");
      await wait(DUR.kitchen);
      setStepState(3, "done");

      // Update LocalStorage to reflect new order state for Menu.jsx
      if (data._id) {
        if (serviceType === "TAKEAWAY") {
          localStorage.setItem("terra_orderId_TAKEAWAY", data._id);
          localStorage.setItem(
            "terra_orderStatus_TAKEAWAY",
            data.status || "Confirmed",
          );
          localStorage.setItem(
            "terra_orderStatusUpdatedAt_TAKEAWAY",
            new Date().toISOString(),
          );
        } else {
          localStorage.setItem("terra_orderId", data._id);
          localStorage.setItem("terra_orderId_DINE_IN", data._id);
          localStorage.setItem("terra_orderStatus", data.status || "Confirmed");
          localStorage.setItem(
            "terra_orderStatus_DINE_IN",
            data.status || "Confirmed",
          );
          localStorage.setItem(
            "terra_orderStatusUpdatedAt",
            new Date().toISOString(),
          );
          localStorage.setItem(
            "terra_orderStatusUpdatedAt_DINE_IN",
            new Date().toISOString(),
          );
        }
        localStorage.removeItem("terra_cart");
        setCart({});
      }

      // DONE - Navigate
      // Navigate to Menu directly (no confirm action)
      navigate("/menu");
    } catch (err) {
      console.error("Order processing failed:", err);
      setStepState(2, "error");
      await wait(DUR.error);
      alert(`❌ ${err.message}`);
      setProcessOpen(false);
    }
  };

  const getAddonQuantity = (id) =>
    selectedAddOns.filter((item) => item === id).length;

  const addAddOn = (id) => {
    const next = [...selectedAddOns, id];
    setSelectedAddOns(next);
    saveAddonsForCart(next);
  };

  const removeAddOn = (id) => {
    const idx = selectedAddOns.indexOf(id);
    if (idx === -1) return;
    const next = selectedAddOns.filter((_, i) => i !== idx);
    setSelectedAddOns(next);
    saveAddonsForCart(next);
  };

  // Calculate items with details
  const cartItemsParams = Object.entries(cart)
    .map(([name, qty]) => {
      // Robust matching: case insensitive
      const meta = menuCatalog.find(
        (m) => m.name.toLowerCase() === name.toLowerCase(),
      );
      return {
        name,
        qty,
        price: meta ? meta.price : 0, // Price in Rupees
        image: meta ? meta.image || meta.imageUrl : null,
      };
    })
    .filter((item) => item.qty > 0);

  const totalAmount = cartItemsParams.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const addOnsTotal = selectedAddOns.reduce((sum, id) => {
    const addon = addonList.find((a) => a.id === id);
    return sum + (addon ? addon.price : 0);
  }, 0);
  const finalTotal = totalAmount + addOnsTotal;

  return (
    <div
      className={`cart-page ${accessibilityMode ? "accessibility-mode" : ""}`}
    >
      <Header
        accessibilityMode={accessibilityMode}
        onClickCart={() => {}} // Already on cart page
        cartCount={Object.values(cart).reduce((a, b) => a + b, 0)}
      />

      <div className="cart-content">
        <div className="cart-header-row">
          <button onClick={() => navigate("/menu")} className="back-btn">
            <FiArrowLeft size={24} />
          </button>
          <h2>Your Cart</h2>
        </div>

        <div className="cart-list">
          {cartItemsParams.length === 0 ? (
            <div className="empty-msg">
              Your cart is empty. <br />
              <span
                onClick={() => navigate("/menu")}
                style={{ color: "#fc8019", cursor: "pointer" }}
              >
                Go to Menu
              </span>
              {selectedAddOns.length > 0 && (
                <div style={{ marginTop: "10px", color: "#888", fontSize: 12 }}>
                  Add-ons are extras and can only be ordered with at least one
                  menu item. Please add an item from the menu to place the
                  order.
                </div>
              )}
            </div>
          ) : (
            cartItemsParams.map((item) => (
              <div key={item.name} className="cart-item-card">
                {item.image && (
                  <div className="cart-item-image-wrap">
                    <img
                      src={getImageUrl(item.image)}
                      alt={item.name}
                      className="cart-item-image"
                    />
                  </div>
                )}
                <div className="item-details">
                  <h3>{item.name}</h3>
                  <div className="item-price">₹{item.price}</div>
                </div>
                <div className="qty-controls">
                  <button
                    onClick={() => handleUpdateQty(item.name, -1)}
                    className="ctrl-btn"
                  >
                    {item.qty === 1 ? (
                      <FiTrash2 size={16} />
                    ) : (
                      <FiMinus size={18} />
                    )}
                  </button>
                  <span className="qty-val">{item.qty}</span>
                  <button
                    onClick={() => handleUpdateQty(item.name, 1)}
                    className="ctrl-btn"
                  >
                    <FiPlus size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {cartItemsParams.length > 0 && (
          <div className="cart-footer">
            <div className="cart-footer-content">
              <div className="total-row final-total-row">
                <span>Total</span>
                <span>₹{finalTotal.toFixed(2)}</span>
              </div>
              <div className="action-buttons">
                <button onClick={handleReset} className="reset-btn">
                  Reset
                </button>
                <button onClick={handleConfirm} className="confirm-btn">
                  Confirm Order
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Keep add-ons visible even if cart is empty (user may want to add/remove add-ons first). */}
        <div className="addons-section">
          <h3>Customizations & Extras</h3>
          {addonsLoading ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#666",
              }}
            >
              Loading add-ons...
            </div>
          ) : addonList.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#999",
                fontSize: "14px",
              }}
            >
              No add-ons available
            </div>
          ) : (
            <div className="addons-grid">
              {addonList.map((addon) => {
                const qty = getAddonQuantity(addon.id);
                return (
                  <div
                    key={addon.id}
                    className={`addon-card ${qty > 0 ? "active" : ""}`}
                  >
                    <div className="addon-info">
                      <div className="addon-text">
                        <span className="addon-name">{sanitizeAddonName(addon.name)}</span>
                        {addon.price > 0 && (
                          <span className="addon-price">₹{addon.price}</span>
                        )}
                      </div>
                    </div>
                    <div className="addon-qty-controls">
                      <button
                        type="button"
                        className="addon-ctrl-btn"
                        onClick={() => removeAddOn(addon.id)}
                        disabled={qty === 0}
                        aria-label={`Remove one ${sanitizeAddonName(addon.name)}`}
                      >
                        {qty === 1 ? (
                          <FiTrash2 size={16} />
                        ) : (
                          <FiMinus size={18} />
                        )}
                      </button>
                      <span className="addon-qty-val">{qty}</span>
                      <button
                        type="button"
                        className="addon-ctrl-btn"
                        onClick={() => addAddOn(addon.id)}
                        aria-label={`Add one ${sanitizeAddonName(addon.name)}`}
                      >
                        <FiPlus size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="instructions-section"
          style={{ marginTop: "20px", padding: "0 16px 20px" }}
        >
          <h3
            style={{
              fontSize: "18px",
              marginBottom: "10px",
              color: "#333",
            }}
          >
            Special Instructions / Extra Items
          </h3>
          <textarea
            placeholder="Type any extra requirements or items here..."
            value={specialInstructions}
            onChange={(e) => {
              setSpecialInstructions(e.target.value);
              // localStorage.setItem("terra_specialInstructions", e.target.value); // Removed persistence
            }}
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #ddd",
              fontSize: "14px",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>
      <ProcessOverlay
        open={processOpen}
        steps={processSteps}
        title="Processing your order"
      />
    </div>
  );
}
