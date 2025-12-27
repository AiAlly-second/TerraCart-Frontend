export function buildOrderPayload(cart, options = {}) {
  const {
    serviceType = "DINE_IN",
    orderType, // PICKUP or DELIVERY
    tableId,
    tableNumber,
    menuCatalog = {},
    sessionToken,
    customerName,
    customerMobile,
    customerEmail,
    cartId,
    customerLocation, // { latitude, longitude, address }
    specialInstructions, // Special notes from customer
  } = options;
  const items = Object.entries(cart)
    .filter(([name, quantity]) => {
      // Filter out items with invalid quantity
      const qty = Number(quantity);
      return name && name.trim() !== "" && Number.isFinite(qty) && qty > 0;
    })
    .map(([name, quantity]) => {
      const meta = menuCatalog[name];
      const price = meta?.price ?? 0;
      const qty = Number(quantity);

      // Validate item data
      if (!name || typeof name !== "string" || name.trim() === "") {
        console.warn(`[orderUtils] Invalid item name: ${name}`);
        return null;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        console.warn(`[orderUtils] Invalid quantity for ${name}: ${quantity}`);
        return null;
      }
      if (!Number.isFinite(price) || price < 0) {
        console.warn(`[orderUtils] Invalid price for ${name}: ${price}`);
        return null;
      }

      const itemPayload = {
        name: name.trim(),
        quantity: qty,
        price: Number(price),
      };
      if (meta?._id) {
        itemPayload.itemId = meta._id;
      }
      return itemPayload;
    })
    .filter((item) => item !== null); // Remove any null items from validation failures

  // CRITICAL: Ensure we have at least one valid item
  if (items.length === 0) {
    console.error("[orderUtils] No valid items in cart after validation");
    throw new Error("Cart is empty or contains only invalid items");
  }

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const gst = +(subtotal * 0.05).toFixed(2);
  const totalAmount = +(subtotal + gst).toFixed(2);
  const payload = {
    serviceType,
    items,
    subtotal,
    gst,
    totalAmount,
  };

  // For TAKEAWAY/PICKUP/DELIVERY orders, don't include tableId, tableNumber
  if (serviceType === "DINE_IN") {
    if (tableId) payload.tableId = tableId;
    if (tableNumber !== undefined && tableNumber !== null) {
      payload.tableNumber = String(tableNumber);
    }
    // CRITICAL: Validate sessionToken before including it
    // Ensure it's a valid non-empty string
    if (sessionToken && typeof sessionToken === "string" && sessionToken.trim().length > 0) {
      payload.sessionToken = sessionToken.trim();
    } else if (serviceType === "DINE_IN") {
      // Log warning if sessionToken is missing or invalid for DINE_IN
      console.warn("[orderUtils] DINE_IN order missing or invalid sessionToken:", {
        sessionToken,
        sessionTokenType: typeof sessionToken,
        sessionTokenLength: sessionToken ? sessionToken.length : 0,
      });
    }
    // CRITICAL: Never include customer info for DINE_IN orders
    // This prevents "customer name required" errors for dine-in orders
    // Customer info is only needed for PICKUP/DELIVERY orders
    if (payload.customerName) delete payload.customerName;
    if (payload.customerMobile) delete payload.customerMobile;
    if (payload.customerEmail) delete payload.customerEmail;
    if (payload.customerLocation) delete payload.customerLocation;
    if (payload.cartId) delete payload.cartId; // DINE_IN orders get cartId from table, not from request
  } else if (
    serviceType === "TAKEAWAY" ||
    serviceType === "PICKUP" ||
    serviceType === "DELIVERY"
  ) {
    // PICKUP/DELIVERY orders don't need table information
    // Set serviceType and orderType
    // CRITICAL: Only process orderType if serviceType is TAKEAWAY/PICKUP/DELIVERY, not DINE_IN
    if (orderType === "PICKUP" || orderType === "DELIVERY") {
      payload.serviceType = orderType === "PICKUP" ? "PICKUP" : "DELIVERY";
      payload.orderType = orderType;
    } else {
      payload.serviceType = "TAKEAWAY"; // Legacy support
    }

    // Include customer information (required for PICKUP/DELIVERY)
    if (customerName) payload.customerName = customerName;
    if (customerMobile) payload.customerMobile = customerMobile;
    if (customerEmail) payload.customerEmail = customerEmail;

    // Include customer location for PICKUP/DELIVERY
    if (customerLocation) {
      payload.customerLocation = {
        latitude: customerLocation.latitude,
        longitude: customerLocation.longitude,
        address: customerLocation.address || customerLocation.fullAddress || "",
      };
    }

    // Include special instructions
    if (specialInstructions && specialInstructions.trim()) {
      payload.specialInstructions = specialInstructions.trim();
    }

    // Include sessionToken to isolate each customer session
    if (sessionToken) payload.sessionToken = sessionToken;

    // Include cartId (required for PICKUP/DELIVERY)
    if (cartId) payload.cartId = cartId;
  } else {
    payload.tableNumber = String(tableNumber || "TAKEAWAY");
  }

  return payload;
}
