import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";

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
