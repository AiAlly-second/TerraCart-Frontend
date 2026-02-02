import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { FiArrowLeft, FiMinus, FiPlus, FiTrash2 } from "react-icons/fi";
import fallbackMenuItems from "../data/menuData";
import { addOnList } from "../data/addons";
import "./CartPage.css";

const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");

export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState({});
  // Initialize with fallback items (converted to Paise if needed, but menuData seems to be Rupees)
  // We'll normalize prices in logic below or here.
  // Let's assume fallbackMenuItems are Rupees.
  const [menuCatalog, setMenuCatalog] = useState(
     fallbackMenuItems.map(i => ({...i, price: i.price * 100})) || []
  );
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const [selectedAddOns, setSelectedAddOns] = useState([]);

  useEffect(() => {
    // Load Cart
    try {
      const savedCart = JSON.parse(localStorage.getItem("terra_cart") || "{}");
      setCart(savedCart);
      const savedAddOns = JSON.parse(localStorage.getItem("terra_cart_addons") || "[]");
      setSelectedAddOns(savedAddOns);
    } catch (e) {
      console.error("Error loading cart", e);
    }

    // Load Menu for prices
    const fetchMenu = async () => {
      try {
        // Determine cartId for specific franchise menu
        let cartId = "";
        try {
           const tableData = JSON.parse(localStorage.getItem("terra_selectedTable") || 
                                      localStorage.getItem("terra_table_selection") || "{}");
           cartId = tableData.cartId || tableData.cafeId || "";
        } catch(e) {}

        const endpoint = cartId 
          ? `${nodeApi}/api/menu/public?cartId=${cartId}`
          : `${nodeApi}/api/menu/public`;

        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          // Flatten categories to get all items
          const items = [];
          if (Array.isArray(data)) {
            data.forEach(cat => {
                if (cat.items) items.push(...cat.items);
            });
          }
          // Merge with fallback (already in Rupees)
          setMenuCatalog([...items, ...fallbackMenuItems]);
        }
      } catch (err) {
        console.error("Failed to fetch menu", err);
      }
    };
    fetchMenu();
  }, []);

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
    const addon = addOnList.find(a => a.id === id);
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
            <div className="addons-grid">
              {addOnList.map(addon => (
                <label key={addon.id} className={`addon-card ${selectedAddOns.includes(addon.id) ? 'active' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={selectedAddOns.includes(addon.id)}
                    onChange={() => toggleAddOn(addon.id)}
                  />
                  <div className="addon-info">
                    <span className="addon-icon">{addon.icon}</span>
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
          </div>
          </>
        )}
      </div>
    </div>
  );
}
