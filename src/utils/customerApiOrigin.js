const normalizeApiOrigin = (value) => {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
};

export function getCustomerApiOrigin() {
  const useViteProxy =
    import.meta.env.DEV &&
    String(import.meta.env.VITE_USE_VITE_PROXY || "").toLowerCase() === "true";

  if (useViteProxy && typeof window !== "undefined") {
    return window.location.origin;
  }

  return normalizeApiOrigin(
    import.meta.env.VITE_PRIMARY_API_URL ||
      import.meta.env.VITE_NODE_API_URL ||
      "http://127.0.0.1:5001",
  );
}
