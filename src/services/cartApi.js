// Backend must be running (e.g. cd backend && npm run dev). ERR_CONNECTION_REFUSED = server not running.
const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");

/**
 * Get nearby carts based on customer location or pin code
 * @param {Number} latitude - Customer latitude (optional if pinCode provided)
 * @param {Number} longitude - Customer longitude (optional if pinCode provided)
 * @param {String} orderType - PICKUP or DELIVERY
 * @param {String} pinCode - Customer pin code (optional, for delivery)
 * @returns {Promise<Array>} Array of nearby carts
 */
export const getNearbyCarts = async (latitude, longitude, orderType, pinCode = null) => {
  try {
    let url = `${nodeApi}/api/carts/nearby?orderType=${orderType}`;
    
    // For delivery with pin code, use pin code instead of coordinates
    if (orderType === "DELIVERY" && pinCode) {
      url += `&pinCode=${encodeURIComponent(pinCode)}`;
    } else if (latitude && longitude) {
      url += `&latitude=${latitude}&longitude=${longitude}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error("Failed to fetch nearby carts");
    }
    
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    // net::ERR_CONNECTION_REFUSED = backend not running at VITE_NODE_API_URL (default localhost:5001)
    const isConnectionRefused = error?.message === "Failed to fetch" || error?.name === "TypeError";
    if (isConnectionRefused) {
      console.warn("[CartAPI] Cannot reach backend at", nodeApi, "- is the server running?");
    } else {
      console.error("[CartAPI] Error fetching nearby carts:", error);
    }
    return [];
  }
};

/**
 * Get all available carts (without location requirement)
 * @param {String} orderType - PICKUP or DELIVERY (optional)
 * @returns {Promise<Array>} Array of available carts
 */
export const getAvailableCarts = async (orderType = null) => {
  try {
    let url = `${nodeApi}/api/carts/available`;
    if (orderType) {
      url += `?orderType=${orderType}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error("Failed to fetch available carts");
    }
    
    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error("[CartAPI] Error fetching available carts:", error);
    return [];
  }
};

/**
 * Get cart by ID with delivery/pickup info
 * @param {String} cartId - Cart ID
 * @param {Number} latitude - Customer latitude (optional)
 * @param {Number} longitude - Customer longitude (optional)
 * @param {String} orderType - PICKUP or DELIVERY (optional)
 * @returns {Promise<Object>} Cart details
 */
export const getCartById = async (cartId, latitude = null, longitude = null, orderType = null) => {
  try {
    let url = `${nodeApi}/api/carts/${cartId}`;
    const params = new URLSearchParams();
    if (latitude) params.append("latitude", latitude);
    if (longitude) params.append("longitude", longitude);
    if (orderType) params.append("orderType", orderType);
    if (params.toString()) url += `?${params.toString()}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error("Failed to fetch cart");
    }
    
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error("[CartAPI] Error fetching cart:", error);
    return null;
  }
};

