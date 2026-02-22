const SERVICE_TYPE_KEY = "terra_serviceType";
const LEGACY_CART_KEY = "terra_cart";
const DINE_IN_CART_KEY = "terra_cart_DINE_IN";
const TAKEAWAY_CART_KEY = "terra_cart_TAKEAWAY";
const TAKEAWAY_LIKE_SERVICE_TYPES = new Set(["TAKEAWAY", "PICKUP", "DELIVERY"]);

const normalizeServiceType = (value = "DINE_IN") =>
  String(value || "DINE_IN")
    .trim()
    .toUpperCase();

const parseCart = (rawValue) => {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

export const isTakeawayCartFlow = (serviceTypeInput) => {
  const serviceType = normalizeServiceType(
    serviceTypeInput || localStorage.getItem(SERVICE_TYPE_KEY) || "DINE_IN",
  );
  const orderType = normalizeServiceType(localStorage.getItem("terra_orderType") || "");
  return (
    TAKEAWAY_LIKE_SERVICE_TYPES.has(serviceType) ||
    orderType === "PICKUP" ||
    orderType === "DELIVERY"
  );
};

export const getCartStorageKey = (serviceTypeInput) =>
  isTakeawayCartFlow(serviceTypeInput) ? TAKEAWAY_CART_KEY : DINE_IN_CART_KEY;

export const readScopedCart = (serviceTypeInput) => {
  const scopedKey = getCartStorageKey(serviceTypeInput);
  const scopedCart = parseCart(localStorage.getItem(scopedKey));
  if (Object.keys(scopedCart).length > 0) {
    return scopedCart;
  }

  // If scoped storage has already been initialized for any flow,
  // do not fallback to legacy key (prevents cross-flow cart leakage).
  const hasScopedInitialization =
    localStorage.getItem(DINE_IN_CART_KEY) !== null ||
    localStorage.getItem(TAKEAWAY_CART_KEY) !== null;
  if (hasScopedInitialization) {
    return {};
  }

  // Backward compatibility for existing users on generic terra_cart.
  const legacyCart = parseCart(localStorage.getItem(LEGACY_CART_KEY));
  if (Object.keys(legacyCart).length > 0) {
    localStorage.setItem(scopedKey, JSON.stringify(legacyCart));
    return legacyCart;
  }
  return {};
};

export const writeScopedCart = (cart, serviceTypeInput) => {
  const scopedKey = getCartStorageKey(serviceTypeInput);
  const safeCart =
    cart && typeof cart === "object" && !Array.isArray(cart) ? cart : {};
  const payload = JSON.stringify(safeCart);
  localStorage.setItem(scopedKey, payload);
  // Keep legacy key updated for old reads still present in some flows.
  localStorage.setItem(LEGACY_CART_KEY, payload);
  return scopedKey;
};

export const clearScopedCart = (serviceTypeInput, options = {}) => {
  const { clearLegacy = true } = options;
  const scopedKey = getCartStorageKey(serviceTypeInput);
  localStorage.removeItem(scopedKey);
  if (clearLegacy) {
    localStorage.removeItem(LEGACY_CART_KEY);
  }
  return scopedKey;
};

export const clearAllScopedCarts = (options = {}) => {
  const { clearLegacy = true } = options;
  localStorage.removeItem(DINE_IN_CART_KEY);
  localStorage.removeItem(TAKEAWAY_CART_KEY);
  if (clearLegacy) {
    localStorage.removeItem(LEGACY_CART_KEY);
  }
};
