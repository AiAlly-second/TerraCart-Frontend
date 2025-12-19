export function buildOrderPayload(cart, options = {}) {
  const {
    serviceType = "DINE_IN",
    tableId,
    tableNumber,
    menuCatalog = {},
    sessionToken,
    customerName,
    customerMobile,
    customerEmail,
    cartId,
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

  // For TAKEAWAY orders, don't include tableId, tableNumber, or sessionToken
  if (serviceType === "DINE_IN") {
    if (tableId) payload.tableId = tableId;
    if (tableNumber !== undefined && tableNumber !== null) {
      payload.tableNumber = String(tableNumber);
    }
    if (sessionToken) {
      payload.sessionToken = sessionToken;
    }
  } else if (serviceType === "TAKEAWAY") {
    // TAKEAWAY orders don't need table information
    // Backend will set tableNumber to "TAKEAWAY" automatically
    // Include customer information for takeaway orders (name and mobile are required)
    if (customerName) payload.customerName = customerName;
    if (customerMobile) payload.customerMobile = customerMobile;
    if (customerEmail) payload.customerEmail = customerEmail;
    // Include sessionToken for takeaway orders to isolate each customer session
    if (sessionToken) payload.sessionToken = sessionToken;
    // Include cartId for takeaway orders so they're assigned to the correct cart
    if (cartId) payload.cartId = cartId;
  } else {
    payload.tableNumber = String(tableNumber || "TAKEAWAY");
  }

  return payload;
}
