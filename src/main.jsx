import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import {
  buildIdentityHeaders,
  ensureAnonymousSessionId,
} from "./utils/anonymousSession";
import { initializeCustomerPush } from "./services/customerPushService";

const nodeApiBase = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

const shouldAttachIdentityHeaders = (url) => {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return false;
  if (normalizedUrl.startsWith("/api/")) return true;
  return normalizedUrl.startsWith(nodeApiBase);
};

ensureAnonymousSessionId();
initializeCustomerPush().catch((error) => {
  if (import.meta.env.DEV) {
    console.warn("[Push] Customer push init skipped:", error);
  }
});

if (typeof window !== "undefined" && !window.__terraIdentityFetchPatched) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input?.url || "";

    if (!shouldAttachIdentityHeaders(requestUrl)) {
      return originalFetch(input, init);
    }

    const baseHeaders =
      init?.headers || (input instanceof Request ? input.headers : undefined);
    const headers = buildIdentityHeaders(baseHeaders);
    return originalFetch(input, {
      ...init,
      headers,
    });
  };
  window.__terraIdentityFetchPatched = true;
}

// Suppress MetaMask extension errors (not used in this app)
window.addEventListener("error", (event) => {
  if (
    event.message?.includes("MetaMask") ||
    event.message?.includes("Failed to connect to MetaMask") ||
    event.message?.includes("MetaMask extension not found") ||
    event.filename?.includes("inpage.js")
  ) {
    event.preventDefault();
    return true;
  }
});

// Suppress MetaMask promise rejections
window.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason?.message?.includes("MetaMask") ||
    event.reason?.message?.includes("Failed to connect to MetaMask") ||
    event.reason?.message?.includes("MetaMask extension not found") ||
    (typeof event.reason === "string" && event.reason.includes("MetaMask"))
  ) {
    event.preventDefault();
    return true;
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
