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
  const items = Object.entries(cart).map(([name, quantity]) => {
    const meta = menuCatalog[name];
    const price = meta?.price ?? 0;
    const itemPayload = {
      name,
      quantity,
      price,
    };
    if (meta?._id) {
      itemPayload.itemId = meta._id;
    }
    return itemPayload;
  });
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
    // Include customer information for takeaway orders (all optional)
    if (customerName) payload.customerName = customerName;
    if (customerMobile) payload.customerMobile = customerMobile;
    if (customerEmail) payload.customerEmail = customerEmail;
    // Include cartId for takeaway orders so they're assigned to the correct cart
    if (cartId) payload.cartId = cartId;
  } else {
    payload.tableNumber = String(tableNumber || "TAKEAWAY");
  }

  return payload;
}
