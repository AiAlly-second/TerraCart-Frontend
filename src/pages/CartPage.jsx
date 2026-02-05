import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { FiArrowLeft, FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";
import fallbackMenuItems from "../data/menuData";
import { addOnList as staticAddOnList } from "../data/addons";
import "./CartPage.css";

const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");

async function getCartId(searchParams) {
  try {
    // Priority 1: Check localStorage for selected cart
    const selectedCartId = localStorage.getItem("terra_selectedCartId");
    if (selectedCartId) {
      console.log("[CartPage] getCartId - from terra_selectedCartId:", selectedCartId);
      return selectedCartId;
    }
    
    // Priority 2: Check localStorage for takeaway cart
    const qrCartId = localStorage.getItem("terra_takeaway_cartId");
    if (qrCartId) {
      console.log("[CartPage] getCartId - from terra_takeaway_cartId:", qrCartId);
      return qrCartId;
    }
    
    // Priority 3: Check localStorage table data
    const tableData = JSON.parse(localStorage.getItem("terra_selectedTable") || localStorage.getItem("terra_table_selection") || "{}");
    let id = tableData.cartId || tableData.cafeId || "";
    // Normalize: cartId may be string or object (e.g. { _id: "..." } or { id: "..." }) from API
    let finalId = "";
    if (id != null && id !== "") {
      if (typeof id === "string") {
        finalId = id;
      } else if (typeof id === "object") {
        const raw = id._id ?? id.id ?? id;
        finalId = typeof raw === "string" ? raw : (raw?.toString?.() || "");
      }
    }
    
    if (finalId) {
      console.log("[CartPage] getCartId - from table data:", finalId, "raw:", id);
      return finalId;
    }
    
    // Priority 4: If table ID in URL but no cartId, fetch cartId from backend (public endpoint)
    const tableId = searchParams?.get("table");
    if (tableId) {
      console.log("[CartPage] getCartId - table ID in URL, fetching cartId from API:", tableId);
      try {
        const res = await fetch(`${nodeApi}/api/tables/public-cart-id/${encodeURIComponent(tableId)}`);
        if (res.ok) {
          const data = await res.json();
          const fetchedCartId = data.cartId || "";
          if (fetchedCartId) {
            console.log("[CartPage] getCartId - got cartId from table API:", fetchedCartId);
            return fetchedCartId;
          }
        }
      } catch (err) {
        console.error("[CartPage] getCartId - failed to fetch cartId by table ID:", err);
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
     fallbackMenuItems.map(i => ({...i, price: i.price * 100})) || []
  );
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [addonList, setAddonList] = useState([]); // Start empty, will be set by fetchAddons
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [specialInstructions, setSpecialInstructions] = useState("");

  useEffect(() => {
    // Load Cart
    try {
      const savedCart = JSON.parse(localStorage.getItem("terra_cart") || "{}");
      setCart(savedCart);
      const savedAddOns = JSON.parse(localStorage.getItem("terra_cart_addons") || "[]");
      setSelectedAddOns(savedAddOns);
      setSpecialInstructions(localStorage.getItem("terra_specialInstructions") || "");
    } catch (e) {
      console.error("Error loading cart", e);
    }

    // Get cartId (async function)
    getCartId(searchParams).then((cartId) => {
      console.log("[CartPage] Using cartId:", cartId);

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
              data.forEach(cat => {
                if (cat.items) items.push(...cat.items);
              });
            }
            setMenuCatalog([...items, ...fallbackMenuItems]);
          }
        } catch (err) {
          console.error("Failed to fetch menu", err);
        }
      };

    const fetchAddons = async (cartId) => {
      setAddonsLoading(true);
      if (!cartId) {
        console.log("[CartPage] No cartId found, using static add-ons as fallback");
        setAddonList(staticAddOnList);
        setAddonsLoading(false);
        return;
      }
      try {
        const url = `${nodeApi}/api/addons/public?cartId=${encodeURIComponent(cartId)}`;
        console.log("[CartPage] Fetching add-ons from:", url, "for cartId:", cartId);
        const res = await fetch(url);
        console.log("[CartPage] Add-ons response status:", res.status);
        if (res.ok) {
          const json = await res.json();
          console.log("[CartPage] Add-ons response:", json);
          
          // Check if response has success flag and data
          if (json.success === false) {
            console.warn("[CartPage] API returned success: false, message:", json.message);
            // Use empty array - admin hasn't configured add-ons or error occurred
            setAddonList([]);
            localStorage.removeItem("terra_global_addons");
            setAddonsLoading(false);
            return;
          }
          
          const list = (json.data || json || []).map((a) => ({
            id: (a._id || a.id || "").toString(),
            name: a.name || "",
            price: Number(a.price) || 0,
            icon: a.icon || "➕",
          }));
          console.log("[CartPage] Parsed add-ons list:", list);
          
          // Always use API result (even if empty) - don't fallback to static
          setAddonList(list);
          if (list.length > 0) {
            localStorage.setItem("terra_global_addons", JSON.stringify(list));
            console.log("[CartPage] ✅ Set", list.length, "add-ons from API:", list.map(a => a.name));
          } else {
            localStorage.removeItem("terra_global_addons");
            console.warn("[CartPage] ⚠️ No add-ons found for cartId:", cartId, "- Admin should create add-ons in Global Add-ons page");
          }
        } else {
          // API error (400, 404, 500, etc.) - try to parse error message
          let errorMsg = `HTTP ${res.status}`;
          try {
            const errorJson = await res.json();
            errorMsg = errorJson.message || errorMsg;
            console.error("[CartPage] Add-ons API error response:", errorJson);
          } catch (e) {
            console.error("[CartPage] Add-ons fetch failed with status:", res.status, "Could not parse error");
          }
          
          // For 400 (bad request - cartId required), use empty instead of static
          if (res.status === 400) {
            console.warn("[CartPage] Bad request (400) - cartId might be invalid. Using empty add-ons list.");
            setAddonList([]);
            localStorage.removeItem("terra_global_addons");
          } else {
            // Other errors - use static as fallback but log warning
            console.warn("[CartPage] API failed:", errorMsg, "- Using static add-ons as fallback");
            setAddonList(staticAddOnList);
            localStorage.removeItem("terra_global_addons");
          }
        }
      } catch (err) {
        // Network error or other exception
        console.error("[CartPage] Failed to fetch add-ons (network error):", err);
        console.warn("[CartPage] Using static add-ons as fallback due to network error");
        setAddonList(staticAddOnList);
        localStorage.removeItem("terra_global_addons");
      } finally {
        setAddonsLoading(false);
      }
    };

      fetchMenu(cartId);
      fetchAddons(cartId);
    });
  }, [searchParams]);

  const updateCart = (newCart) => {
    setCart(newCart);
    localStorage.setItem("terra_cart", JSON.stringify(newCart));
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
      localStorage.removeItem("terra_cart_addons");
    }
  };

  const handleConfirm = () => {
    if (Object.keys(cart).length === 0) return alert("Cart is empty");
    // Save addons before navigating
    localStorage.setItem("terra_cart_addons", JSON.stringify(selectedAddOns));
    // Navigate to Menu with confirm action
    navigate("/menu?action=confirm");
  };

  const toggleAddOn = (id) => {
    const newSelected = selectedAddOns.includes(id)
      ? selectedAddOns.filter(item => item !== id)
      : [...selectedAddOns, id];
    setSelectedAddOns(newSelected);
    localStorage.setItem("terra_cart_addons", JSON.stringify(newSelected));
  };

  // Calculate items with details
  const cartItemsParams = Object.entries(cart)
    .map(([name, qty]) => {
     // Robust matching: case insensitive
     const meta = menuCatalog.find(m => m.name.toLowerCase() === name.toLowerCase());
     return {
       name,
       qty,
       price: meta ? meta.price : 0, // Price in Rupees
       image: meta ? meta.image : null
     };
  })
  .filter(item => item.qty > 0);

  const totalAmount = cartItemsParams.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const addOnsTotal = selectedAddOns.reduce((sum, id) => {
    const addon = addonList.find(a => a.id === id);
    return sum + (addon ? addon.price : 0);
  }, 0);
  const finalTotal = totalAmount + addOnsTotal;

  return (
    <div className={`cart-page ${accessibilityMode ? "accessibility-mode" : ""}`}>
      <Header 
        accessibilityMode={accessibilityMode}
        onClickCart={() => {}} // Already on cart page
        cartCount={Object.values(cart).reduce((a,b)=>a+b, 0)}
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
             <div className="empty-msg">Your cart is empty. <br/><span onClick={()=>navigate('/menu')} style={{color:'#fc8019', cursor:'pointer'}}>Go to Menu</span></div>
           ) : (
             cartItemsParams.map(item => (
               <div key={item.name} className="cart-item-card">
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    <div className="item-price">₹{item.price}</div>
                  </div>
                  <div className="qty-controls">
                     <button onClick={() => handleUpdateQty(item.name, -1)} className="ctrl-btn">
                       {item.qty === 1 ? <FiTrash2 size={16}/> : <FiMinus size={18}/>}
                     </button>
                     <span className="qty-val">{item.qty}</span>
                     <button onClick={() => handleUpdateQty(item.name, 1)} className="ctrl-btn">
                       <FiPlus size={18}/>
                     </button>
                  </div>
               </div>
             ))
           )}
        </div>

        {cartItemsParams.length > 0 && (
          <>
           <div className="cart-footer">
             <div className="cart-footer-content">
               <div className="total-row">
                  <span>Subtotal</span>
                  <span>₹{totalAmount.toFixed(2)}</span>
               </div>
               {addOnsTotal > 0 && (
                 <div className="total-row addon-total-row">
                    <span>Add-ons</span>
                    <span>₹{addOnsTotal.toFixed(2)}</span>
                 </div>
               )}
               <div className="total-row final-total-row">
                  <span>Total</span>
                  <span>₹{finalTotal.toFixed(2)}</span>
               </div>
              <div className="action-buttons">
                 <button onClick={handleReset} className="reset-btn">Reset</button>
                 <button onClick={handleConfirm} className="confirm-btn">Confirm Order</button>
              </div>
             </div>
           </div>

          <div className="addons-section">
            <h3>Customizations & Extras</h3>
            {addonsLoading ? (
              <div style={{padding: '20px', textAlign: 'center', color: '#666'}}>
                Loading add-ons...
              </div>
            ) : addonList.length === 0 ? (
              <div style={{padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px'}}>
                No add-ons available
              </div>
            ) : (
              <div className="addons-grid">
                {addonList.map(addon => (
                  <label key={addon.id} className={`addon-card ${selectedAddOns.includes(addon.id) ? 'active' : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={selectedAddOns.includes(addon.id)}
                      onChange={() => toggleAddOn(addon.id)}
                    />
                    <div className="addon-info">

                      <div className="addon-text">
                          <span className="addon-name">{addon.name}</span>
                          {addon.price > 0 && <span className="addon-price">+₹{addon.price}</span>}
                      </div>
                    </div>
                    <div className="addon-check">
                      {selectedAddOns.includes(addon.id) ? "✓" : "+"}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="instructions-section" style={{ marginTop: '20px', padding: '0 16px 20px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#333' }}>Special Instructions / Extra Items</h3>
            <textarea
              placeholder="Type any extra requirements or items here..."
              value={specialInstructions}
              onChange={(e) => {
                setSpecialInstructions(e.target.value);
                localStorage.setItem("terra_specialInstructions", e.target.value);
              }}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid #ddd',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>
          </>
        )}
      </div>
    </div>
  );
}
