/**
 * Shared TanStack Query keys for deduplication across Menu, Cart, and hooks.
 */
export const queryKeys = {
  menu: {
    public: (cartId) => ["menu", "public", cartId ? String(cartId) : "none"],
  },
  addons: {
    public: (cartId, tableId) => [
      "addons",
      "public",
      cartId ? String(cartId) : "none",
      tableId || "none",
    ],
  },
  cart: {
    summary: (cartId) => ["cart", String(cartId || "")],
  },
  orders: {
    customer: (orderId) => ["orders", "customer", String(orderId || "")],
  },
  translations: {
    menuPage: (lang, fingerprint) => [
      "translations",
      "menuPage",
      lang,
      fingerprint,
    ],
  },
};
