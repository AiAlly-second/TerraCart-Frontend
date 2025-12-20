import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import io from "socket.io-client";

import Header from "../components/Header";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import blindEyeIcon from "../assets/images/blind-eye-sign.png";
import translations from "../data/translations/secondpage.json";
import useVoiceAssistant from "../utils/useVoiceAssistant";
import "./SecondPage.css";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

// Helper function to clear old DINE_IN order data when session changes
// CRITICAL: Preserves takeaway order data - only clears DINE_IN data
function clearOldOrderData() {
  console.log(
    "[SecondPage] Clearing old DINE_IN order data due to session change (preserving takeaway data)"
  );
  // Clear generic keys (used by DINE_IN)
  localStorage.removeItem("terra_orderId");
  localStorage.removeItem("terra_cart");
  localStorage.removeItem("terra_orderStatus");
  localStorage.removeItem("terra_orderStatusUpdatedAt");
  localStorage.removeItem("terra_previousOrder");
  localStorage.removeItem("terra_previousOrderDetail");
  localStorage.removeItem("terra_lastPaidOrderId");
  // Clear only DINE_IN-specific keys - preserve TAKEAWAY data
  localStorage.removeItem("terra_cart_DINE_IN");
  localStorage.removeItem("terra_orderId_DINE_IN");
  localStorage.removeItem("terra_orderStatus_DINE_IN");
  localStorage.removeItem("terra_orderStatusUpdatedAt_DINE_IN");
  // Note: TAKEAWAY data is preserved to allow page refresh without losing order
}

// Helper function to check if sessionToken changed and clear old data if needed
function updateSessionTokenWithCleanup(newToken, oldToken) {
  if (newToken && newToken !== oldToken) {
    clearOldOrderData();
  }
  if (newToken) {
    localStorage.setItem("terra_sessionToken", newToken);
  }
}

const checkVoiceSupport = (language) => {
  const voices = window.speechSynthesis.getVoices();
  const langPrefix =
    language === "mr"
      ? "mr"
      : language === "gu"
      ? "gu"
      : language === "hi"
      ? "hi"
      : "en";
  const hasNativeSupport = voices.some((voice) =>
    voice.lang.toLowerCase().startsWith(langPrefix)
  );

  if (!hasNativeSupport && (language === "mr" || language === "gu")) {
    console.warn(
      `Limited voice support for ${language}. Using fallback pronunciation.`
    );
  }

  return hasNativeSupport;
};

export default function SecondPage() {
  const navigate = useNavigate();

  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const [language] = useState(localStorage.getItem("language") || "en");
  const [sessionToken, setSessionToken] = useState(() =>
    localStorage.getItem("terra_sessionToken")
  );
  const [tableInfo, setTableInfo] = useState(() => {
    try {
      const stored = localStorage.getItem("terra_selectedTable");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Simplified waitlist state - only when table is occupied
  const [waitlistToken, setWaitlistToken] = useState(
    localStorage.getItem("terra_waitToken")
  );
  const [waitlistInfo, setWaitlistInfo] = useState(null);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [isTableOccupied, setIsTableOccupied] = useState(false);

  // Customer info for takeaway orders (optional)
  // CRITICAL: Check if this is a new session/table - clear customer data for new users
  const [customerName, setCustomerName] = useState(() => {
    // Check if there's a table info - if not, this might be a new user
    const hasTableInfo = localStorage.getItem("terra_selectedTable");
    const hasScanToken = localStorage.getItem("terra_scanToken");

    // If no table info and no scan token, this is likely a new user - return blank
    if (!hasTableInfo && !hasScanToken) {
      return "";
    }

    // Otherwise, load from localStorage (for returning users)
    return localStorage.getItem("terra_takeaway_customerName") || "";
  });
  const [customerMobile, setCustomerMobile] = useState(() => {
    const hasTableInfo = localStorage.getItem("terra_selectedTable");
    const hasScanToken = localStorage.getItem("terra_scanToken");

    if (!hasTableInfo && !hasScanToken) {
      return "";
    }

    return localStorage.getItem("terra_takeaway_customerMobile") || "";
  });
  const [customerEmail, setCustomerEmail] = useState(() => {
    const hasTableInfo = localStorage.getItem("terra_selectedTable");
    const hasScanToken = localStorage.getItem("terra_scanToken");

    if (!hasTableInfo && !hasScanToken) {
      return "";
    }

    return localStorage.getItem("terra_takeaway_customerEmail") || "";
  });
  const [showCustomerInfoModal, setShowCustomerInfoModal] = useState(false);
  const [showWaitlistInfoModal, setShowWaitlistInfoModal] = useState(false);
  const [waitlistGuestName, setWaitlistGuestName] = useState("");
  const [waitlistPartySize, setWaitlistPartySize] = useState("1");
  const [takeawayOnly, setTakeawayOnly] = useState(
    () => localStorage.getItem("terra_takeaway_only") === "true"
  );

  // Keep takeaway-only flag in sync with localStorage (set on Landing via QR params)
  useEffect(() => {
    const flag = localStorage.getItem("terra_takeaway_only") === "true";
    setTakeawayOnly(flag);
    // #region agent log (disabled - analytics service not available)
    // Debug analytics call - only enable if analytics service is running
    // fetch("http://127.0.0.1:7242/ingest/660a5fbf-4359-420f-956f-3831103456fb", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     sessionId: "debug-session",
    //     runId: "takeaway-qr-flow",
    //     hypothesisId: "TAKEAWAY-ONLY-1",
    //     location: "SecondPage.jsx:useEffect-takeawayOnly",
    //     message: "SecondPage loaded with takeawayOnly flag",
    //     data: {
    //       takeawayOnly: flag,
    //       raw: localStorage.getItem("terra_takeaway_only"),
    //     },
    //     timestamp: Date.now(),
    //   }),
    // }).catch(() => {});
    // #endregion agent log
  }, []);

  // Clear customer data when component mounts if this is a new QR scan
  useEffect(() => {
    const currentScanToken = localStorage.getItem("terra_scanToken");
    const previousScanToken = sessionStorage.getItem("terra_previousScanToken");

    // If scan token changed or doesn't exist, this is a new user - clear customer data
    if (!currentScanToken) {
      // No scan token - new user, clear customer data
      setCustomerName("");
      setCustomerMobile("");
      setCustomerEmail("");
      localStorage.removeItem("terra_takeaway_customerName");
      localStorage.removeItem("terra_takeaway_customerMobile");
      localStorage.removeItem("terra_takeaway_customerEmail");
    } else if (currentScanToken !== previousScanToken) {
      // Scan token changed - new user, clear customer data
      setCustomerName("");
      setCustomerMobile("");
      setCustomerEmail("");
      localStorage.removeItem("terra_takeaway_customerName");
      localStorage.removeItem("terra_takeaway_customerMobile");
      localStorage.removeItem("terra_takeaway_customerEmail");

      // Store current scan token for next check
      sessionStorage.setItem("terra_previousScanToken", currentScanToken);
    } else if (!previousScanToken && currentScanToken) {
      // First time visit with scan token - store it but don't clear (might be returning user)
      sessionStorage.setItem("terra_previousScanToken", currentScanToken);
    }
  }, []);

  const t = (key) => translations[language]?.[key] || key;
  const { readAloud, startListening } = useVoiceAssistant();

  // STRONG LOGIC: Check if table is occupied based on actual table.status field
  useEffect(() => {
    // CRITICAL: Check serviceType - TAKEAWAY orders never need waitlist
    const currentServiceType =
      localStorage.getItem("terra_serviceType") || "DINE_IN";
    if (currentServiceType === "TAKEAWAY") {
      // Clear all waitlist state for takeaway orders
      setIsTableOccupied(false);
      setShowWaitlistModal(false);
      if (waitlistToken) {
        localStorage.removeItem("terra_waitToken");
        setWaitlistToken(null);
        setWaitlistInfo(null);
      }
      return;
    }

    // For takeaway-only QR flow, completely skip waitlist + table occupancy logic
    if (takeawayOnly) {
      setIsTableOccupied(false);
      setShowWaitlistModal(false);
      return;
    }

    // CRITICAL: If tableInfo is not set yet, try to load it from localStorage
    // This handles the case where useEffect runs before tableInfo is loaded
    let tableToCheck = tableInfo;
    if (!tableToCheck) {
      const storedTable = localStorage.getItem("terra_selectedTable");
      if (storedTable) {
        try {
          tableToCheck = JSON.parse(storedTable);
        } catch (e) {
          console.warn("[SecondPage] Failed to parse stored table:", e);
          return;
        }
      } else {
        // No table info at all - don't show modal
        setIsTableOccupied(false);
        return;
      }
    }

    // CRITICAL: Check if user has active order first - if they do, never show waitlist
    const existingOrderId =
      localStorage.getItem("terra_orderId") ||
      localStorage.getItem("terra_orderId_DINE_IN");
    const existingOrderStatus =
      localStorage.getItem("terra_orderStatus") ||
      localStorage.getItem("terra_orderStatus_DINE_IN");

    const hasActiveOrder =
      existingOrderId &&
      existingOrderStatus &&
      !["Paid", "Cancelled", "Returned", "Completed"].includes(
        existingOrderStatus
      );

    // If user has active order, never show waitlist or occupied state
    if (hasActiveOrder) {
      setIsTableOccupied(false);
      setShowWaitlistModal(false);
      return;
    }

    // CRITICAL: Check actual table.status field, not HTTP status
    const tableStatus = tableToCheck.status || "AVAILABLE";
    const isOccupied = tableStatus !== "AVAILABLE";
    setIsTableOccupied(isOccupied);

    // STRONG: If table status is AVAILABLE, clear waitlist and allow direct access
    if (tableStatus === "AVAILABLE") {
      // Table is available - clear waitlist state and hide modal
      setShowWaitlistModal(false);
      // Clear waitlist token when table is available (first user doesn't need waitlist)
      if (waitlistToken) {
        localStorage.removeItem("terra_waitToken");
        setWaitlistToken(null);
        setWaitlistInfo(null);
      }
      // CRITICAL: Clear all previous customer order data when table is available
      // This ensures new customers don't see previous customer's orders
      clearOldOrderData();
      console.log(
        "[SecondPage] Table is AVAILABLE - cleared all order data for new customer"
      );
      return;
    }

    // Table is occupied (status !== "AVAILABLE") - only show waitlist modal if user is not already in waitlist
    // CRITICAL: Always show waitlist modal when table is occupied and user is not in waitlist
    // This ensures new users who scan QR for occupied table see the waitlist option
    // Check waitlistToken from localStorage directly to avoid state timing issues
    const currentWaitlistToken = localStorage.getItem("terra_waitToken");
    if (isOccupied && !currentWaitlistToken) {
      // Always show modal when table is occupied and user is not in waitlist
      setShowWaitlistModal(true);
    } else if (tableStatus === "AVAILABLE") {
      // Table is available - always hide modal
      setShowWaitlistModal(false);
    } else if (currentWaitlistToken) {
      // User is in waitlist - hide the join modal (they'll see waitlist status card instead)
      setShowWaitlistModal(false);
    }
  }, [tableInfo, waitlistToken, takeawayOnly]);

  // Poll waitlist status ONLY if user is in waitlist AND table is NOT available
  useEffect(() => {
    // For takeaway-only QR flow, completely skip waitlist polling
    if (takeawayOnly) {
      setWaitlistInfo(null);
      return;
    }

    // CRITICAL: No waitlist logic if table is available
    if (!tableInfo || tableInfo.status === "AVAILABLE") {
      if (waitlistToken) {
        // Clear waitlist if table becomes available
        localStorage.removeItem("terra_waitToken");
        setWaitlistToken(null);
        setWaitlistInfo(null);
      }
      return;
    }

    if (!waitlistToken) {
      setWaitlistInfo(null);
      return;
    }

    const checkWaitlistStatus = async () => {
      // Double check: table must not be available
      if (tableInfo?.status === "AVAILABLE") {
        localStorage.removeItem("terra_waitToken");
        setWaitlistToken(null);
        setWaitlistInfo(null);
        return;
      }

      try {
        const res = await fetch(
          `${nodeApi}/api/waitlist/status?token=${waitlistToken}`
        );
        if (res.status === 404) {
          // Token no longer valid
          localStorage.removeItem("terra_waitToken");
          setWaitlistToken(null);
          setWaitlistInfo(null);
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch waitlist status");
        }
        const data = await res.json();
        // CRITICAL: Always update position from backend response
        // This ensures positions are recalculated when new entries are added
        setWaitlistInfo({
          ...data,
          position:
            data.position || data.position === 0
              ? data.position
              : waitlistInfo?.position || 1,
        });

        // If seated, update session token and clear waitlist
        if (data.status === "SEATED" && data.sessionToken) {
          localStorage.setItem("terra_sessionToken", data.sessionToken);
          setSessionToken(data.sessionToken);
          localStorage.removeItem("terra_waitToken");
          setWaitlistToken(null);
          setWaitlistInfo(null);
        }
      } catch (err) {
        console.error("Waitlist status error", err);
      }
    };

    // Listen for real-time waitlist updates via socket
    const handleWaitlistUpdated = async (update) => {
      // Only refresh if this update is for the same table
      // Check both id and _id since tableInfo might have either
      const tableId = tableInfo?.id || tableInfo?._id;
      if (
        waitlistToken &&
        update.tableId &&
        tableId &&
        update.tableId.toString() === tableId.toString()
      ) {
        console.log(
          "[SecondPage] Waitlist updated via socket, refreshing position"
        );

        // CRITICAL: If waitlist status changed to NOTIFIED or SEATED, clear order data
        // This ensures new waitlist customers don't see previous customer's orders
        if (update.status === "NOTIFIED" || update.status === "SEATED") {
          clearOldOrderData();
          console.log(
            `[SecondPage] Waitlist status changed to ${update.status} - cleared all order data for new customer`
          );
        }

        // Refresh waitlist status to get updated position
        await checkWaitlistStatus();
      }
    };

    // Create socket connection only when needed (inside useEffect)
    let socket = null;
    try {
      socket = io(nodeApi, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000,
        autoConnect: true,
        // Suppress connection errors in console
        forceNew: false,
      });

      socket.on("connect", () => {
        console.log("[SecondPage] Waitlist socket connected");
      });

      socket.on("connect_error", (error) => {
        // Silently handle connection errors - socket will retry automatically
        // Don't log to avoid console spam
        if (error.message && !error.message.includes("xhr poll error")) {
          console.warn(
            "[SecondPage] Waitlist socket connection error:",
            error.message
          );
        }
      });

      socket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          console.log("[SecondPage] Waitlist socket disconnected:", reason);
        }
      });

      socket.on("waitlistUpdated", handleWaitlistUpdated);
    } catch (err) {
      console.warn(
        "[SecondPage] Failed to create waitlist socket connection:",
        err
      );
    }

    checkWaitlistStatus();
    const interval = setInterval(checkWaitlistStatus, 15000); // Poll every 15 seconds

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off("waitlistUpdated", handleWaitlistUpdated);
        socket.disconnect();
      }
    };
  }, [waitlistToken, tableInfo, takeawayOnly]);

  // Load table info on mount and refresh status from backend
  useEffect(() => {
    const storedTable = localStorage.getItem("terra_selectedTable");
    if (storedTable) {
      try {
        const table = JSON.parse(storedTable);
        setTableInfo(table);
        const storedSession = localStorage.getItem("terra_sessionToken");
        if (storedSession) {
          setSessionToken(storedSession);
        }

        // CRITICAL: Check serviceType FIRST - TAKEAWAY orders never need waitlist
        const currentServiceType =
          localStorage.getItem("terra_serviceType") || "DINE_IN";
        const isTakeaway = currentServiceType === "TAKEAWAY";

        // CRITICAL: Check table status immediately and show waitlist modal if needed
        // This ensures new users who scan QR for occupied table see the waitlist option
        // BUT ONLY if it's not a TAKEAWAY order
        const tableStatus = table.status || "AVAILABLE";
        const currentWaitlistToken = localStorage.getItem("terra_waitToken");
        if (
          !isTakeaway &&
          tableStatus !== "AVAILABLE" &&
          !currentWaitlistToken
        ) {
          // Table is occupied and user is not in waitlist - show modal (only for DINE_IN)
          console.log(
            "[SecondPage] Table is occupied on mount - showing waitlist modal"
          );
          setIsTableOccupied(true);
          setShowWaitlistModal(true);
        } else if (isTakeaway) {
          // TAKEAWAY orders should never show waitlist modal
          setIsTableOccupied(false);
          setShowWaitlistModal(false);
        }

        // Refresh table status from backend to ensure it's up-to-date
        const refreshTableStatus = async () => {
          // CRITICAL: If user has active order, don't refresh table status
          // This prevents showing waitlist when user navigates back
          const existingOrderId =
            localStorage.getItem("terra_orderId") ||
            localStorage.getItem("terra_orderId_DINE_IN");
          const existingOrderStatus =
            localStorage.getItem("terra_orderStatus") ||
            localStorage.getItem("terra_orderStatus_DINE_IN");

          const hasActiveOrder =
            existingOrderId &&
            existingOrderStatus &&
            !["Paid", "Cancelled", "Returned", "Completed"].includes(
              existingOrderStatus
            );

          if (hasActiveOrder) {
            console.log(
              "[SecondPage] User has active order - skipping table status refresh"
            );
            return;
          }

          const slug = table.qrSlug || localStorage.getItem("terra_scanToken");
          if (!slug) return;

          try {
            const params = new URLSearchParams();
            if (storedSession) {
              params.set("sessionToken", storedSession);
            }
            const url = `${nodeApi}/api/tables/lookup/${slug}${
              params.toString() ? `?${params.toString()}` : ""
            }`;
            const res = await fetch(url);

            // Handle 404 specifically - table not found
            if (res.status === 404) {
              // Clear invalid table data from localStorage
              localStorage.removeItem("terra_selectedTable");
              localStorage.removeItem("terra_scanToken");
              localStorage.removeItem("terra_sessionToken");
              setTableInfo(null);
              setSessionToken(null);
              console.warn(
                "[SecondPage] Table not found (404) - cleared invalid table data"
              );
              // Don't show alert on mount - user might not be actively using the feature
              return;
            }

            if (res.ok) {
              const payload = await res.json().catch(() => ({}));
              if (payload?.table) {
                console.log(
                  "[SecondPage] Refreshed table status:",
                  payload.table.status
                );
                const refreshedTable = {
                  ...table,
                  ...payload.table,
                  // Preserve qrSlug if it exists
                  qrSlug: table.qrSlug || payload.table.qrSlug,
                };
                setTableInfo(refreshedTable);
                localStorage.setItem(
                  "terra_selectedTable",
                  JSON.stringify(refreshedTable)
                );

                // CRITICAL: After refreshing, check actual table status
                // If AVAILABLE, hide waitlist modal. If occupied, show it (only for DINE_IN)
                const currentServiceType =
                  localStorage.getItem("terra_serviceType") || "DINE_IN";
                const isTakeaway = currentServiceType === "TAKEAWAY";
                const refreshedStatus = refreshedTable.status || "AVAILABLE";

                if (refreshedStatus === "AVAILABLE") {
                  // Table is available - hide waitlist modal
                  setIsTableOccupied(false);
                  setShowWaitlistModal(false);
                  // Clear waitlist token when table is available
                  localStorage.removeItem("terra_waitToken");
                  setWaitlistToken(null);
                  setWaitlistInfo(null);
                  // CRITICAL: Clear all previous customer order data when table becomes available
                  // This ensures new customers don't see previous customer's orders
                  clearOldOrderData();
                  console.log(
                    "[SecondPage] Table is AVAILABLE - cleared all order data for new customer"
                  );
                } else if (
                  !isTakeaway &&
                  refreshedStatus !== "AVAILABLE" &&
                  !waitlistToken
                ) {
                  // Table is occupied and user is not in waitlist - show modal
                  setIsTableOccupied(true);
                  setShowWaitlistModal(true);
                } else if (isTakeaway) {
                  // TAKEAWAY orders should never show waitlist
                  setIsTableOccupied(false);
                  setShowWaitlistModal(false);
                }
              }
            } else if (res.status === 423) {
              // Table is locked (423) - this is EXPECTED behavior when table is occupied
              // Browser may log "Failed to load resource: 423" but this is normal and handled
              // Show waitlist modal BUT ONLY if it's not a TAKEAWAY order
              const currentServiceType =
                localStorage.getItem("terra_serviceType") || "DINE_IN";
              const isTakeaway = currentServiceType === "TAKEAWAY";
              let lockedPayload = {};
              try {
                lockedPayload = await res.json();
              } catch (parseErr) {
                // 423 response should have JSON, but handle gracefully if parsing fails
                console.warn(
                  "[SecondPage] Failed to parse 423 response (expected for occupied tables):",
                  parseErr
                );
              }
              const lockedTable = lockedPayload?.table || table;
              setTableInfo(lockedTable);
              localStorage.setItem(
                "terra_selectedTable",
                JSON.stringify(lockedTable)
              );
              setIsTableOccupied(true);
              // CRITICAL: Always show waitlist modal for 423 responses if user is not in waitlist
              // BUT ONLY for DINE_IN orders
              const currentWaitlistToken =
                localStorage.getItem("terra_waitToken");
              if (!isTakeaway && !currentWaitlistToken) {
                console.log(
                  "[SecondPage] Table is locked (423) - showing waitlist modal (this is expected behavior)"
                );
                setShowWaitlistModal(true);
              } else if (isTakeaway) {
                setIsTableOccupied(false);
                setShowWaitlistModal(false);
              }
            } else if (res.status === 404) {
              // Handle 404 if it wasn't caught above (shouldn't happen, but safety check)
              localStorage.removeItem("terra_selectedTable");
              localStorage.removeItem("terra_scanToken");
              localStorage.removeItem("terra_sessionToken");
              setTableInfo(null);
              setSessionToken(null);
              console.warn(
                "[SecondPage] Table not found (404) during refresh - cleared invalid table data"
              );
            }
          } catch (err) {
            console.warn("[SecondPage] Failed to refresh table status:", err);
            // Don't fail silently - keep existing table info
            // But still check if we should show waitlist modal based on stored table status
            // BUT ONLY if it's not a TAKEAWAY order
            const currentServiceType =
              localStorage.getItem("terra_serviceType") || "DINE_IN";
            const isTakeaway = currentServiceType === "TAKEAWAY";
            const tableStatus = table.status || "AVAILABLE";
            if (!isTakeaway && tableStatus !== "AVAILABLE" && !waitlistToken) {
              setIsTableOccupied(true);
              setShowWaitlistModal(true);
            } else if (isTakeaway) {
              setIsTableOccupied(false);
              setShowWaitlistModal(false);
            }
          }
        };

        // Refresh table status after a short delay to avoid blocking initial render
        const timeoutId = setTimeout(refreshTableStatus, 500);
        return () => clearTimeout(timeoutId);
      } catch {
        setTableInfo(null);
      }
    }
  }, []);

  // Listen for real-time table status updates from admin
  useEffect(() => {
    if (!tableInfo || (!tableInfo.id && !tableInfo._id)) {
      return;
    }

    const handleTableStatusUpdated = (updatedTable) => {
      // Only update if this is the same table
      // Check both id and _id, and compare as strings to handle ObjectId vs string
      const updatedTableId = updatedTable.id || updatedTable._id;
      const currentTableId = tableInfo?.id || tableInfo?._id;

      if (!updatedTableId || !currentTableId) {
        return; // Missing IDs, can't match
      }

      // Compare as strings to handle ObjectId vs string mismatches
      if (String(updatedTableId) !== String(currentTableId)) {
        // Also check by table number as fallback
        if (updatedTable.number && tableInfo?.number) {
          if (String(updatedTable.number) !== String(tableInfo.number)) {
            return; // Different table
          }
        } else {
          return; // Different table
        }
      }

      // CRITICAL: If user has active order, don't update table status
      // This prevents showing waitlist when admin changes status
      const existingOrderId =
        localStorage.getItem("terra_orderId") ||
        localStorage.getItem("terra_orderId_DINE_IN");
      const existingOrderStatus =
        localStorage.getItem("terra_orderStatus") ||
        localStorage.getItem("terra_orderStatus_DINE_IN");

      const hasActiveOrder =
        existingOrderId &&
        existingOrderStatus &&
        !["Paid", "Cancelled", "Returned", "Completed"].includes(
          existingOrderStatus
        );

      if (hasActiveOrder) {
        console.log(
          "[SecondPage] User has active order - ignoring table status update"
        );
        return;
      }

      console.log(
        "[SecondPage] Table status updated via socket:",
        updatedTable.status,
        "Previous status:",
        tableInfo.status
      );

      // Update table info with new status
      const updatedTableInfo = {
        ...tableInfo,
        status: updatedTable.status,
        currentOrder: updatedTable.currentOrder || null,
        sessionToken: updatedTable.sessionToken || tableInfo.sessionToken,
      };
      setTableInfo(updatedTableInfo);
      // Update localStorage to persist the change
      localStorage.setItem(
        "terra_selectedTable",
        JSON.stringify(updatedTableInfo)
      );

      // CRITICAL: If table becomes AVAILABLE, clear waitlist state and hide modal
      // Also clear all previous customer order data to prevent showing old orders
      if (updatedTable.status === "AVAILABLE") {
        console.log(
          "[SecondPage] Table became AVAILABLE via socket - clearing waitlist state and order data"
        );
        setIsTableOccupied(false);
        setShowWaitlistModal(false);
        // Clear waitlist token and info
        localStorage.removeItem("terra_waitToken");
        setWaitlistToken(null);
        setWaitlistInfo(null);
        // CRITICAL: Clear all previous customer order data when table becomes available
        // This ensures new customers don't see previous customer's orders
        clearOldOrderData();
        console.log("[SecondPage] Cleared all order data for new customer");

        // Show notification to user that table is now available
        // This helps users know they can proceed
        if (tableInfo.status !== "AVAILABLE") {
          // Only show if status actually changed (wasn't already available)
          console.log(
            "[SecondPage] Table status changed to AVAILABLE - user can proceed"
          );
        }
      } else if (updatedTable.status !== "AVAILABLE") {
        // Table is occupied - ensure waitlist modal is shown if user is not in waitlist
        // BUT only if user doesn't have an active order
        const currentWaitlistToken = localStorage.getItem("terra_waitToken");
        if (!currentWaitlistToken) {
          setIsTableOccupied(true);
          setShowWaitlistModal(true);
        }
      }
    };

    // Create socket connection for table status updates (only when needed)
    let tableStatusSocket = null;
    try {
      tableStatusSocket = io(nodeApi, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 60000, // Match backend pingTimeout (60s)
        connectTimeout: 60000, // Match backend pingTimeout (60s)
        autoConnect: true,
        // Suppress connection errors in console
        forceNew: false,
      });

      tableStatusSocket.on("connect", () => {
        console.log("[SecondPage] Table status socket connected");
      });

      tableStatusSocket.on("connect_error", (error) => {
        // Silently handle connection errors - socket will retry automatically
        // Don't log to avoid console spam
        if (error.message && !error.message.includes("xhr poll error")) {
          console.warn(
            "[SecondPage] Table status socket connection error:",
            error.message
          );
        }
      });

      tableStatusSocket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          console.log("[SecondPage] Table status socket disconnected:", reason);
        }
      });

      tableStatusSocket.on("table:status:updated", handleTableStatusUpdated);
    } catch (err) {
      console.warn("[SecondPage] Failed to create table status socket:", err);
    }

    // Cleanup on unmount
    return () => {
      if (tableStatusSocket) {
        tableStatusSocket.off("table:status:updated", handleTableStatusUpdated);
        tableStatusSocket.disconnect();
      }
    };
  }, [tableInfo]);

  const startServiceFlow = useCallback(
    async (serviceType = "DINE_IN") => {
      const isTakeaway = serviceType === "TAKEAWAY";

      // For TAKEAWAY orders (both regular and takeaway-only QR):
      // CRITICAL: Completely bypass waitlist logic - takeaway never needs waitlist
      if (isTakeaway) {
        // Clear any waitlist state for takeaway orders
        localStorage.removeItem("terra_waitToken");
        setWaitlistToken(null);
        setWaitlistInfo(null);
        setShowWaitlistModal(false);
        setIsTableOccupied(false);

        const existingTakeawayOrderId =
          localStorage.getItem("terra_orderId_TAKEAWAY") ||
          localStorage.getItem("terra_orderId");
        const existingTakeawayStatus =
          localStorage.getItem("terra_orderStatus_TAKEAWAY") ||
          localStorage.getItem("terra_orderStatus");
        const existingTakeawaySession = localStorage.getItem(
          "terra_takeaway_sessionToken"
        );

        const isActiveStatus =
          existingTakeawayStatus &&
          !["Cancelled", "Returned", "Paid", "Completed"].includes(
            existingTakeawayStatus
          );

        // If we have an order + session token + active status, just go back to menu with the same takeaway order
        if (
          existingTakeawayOrderId &&
          existingTakeawaySession &&
          isActiveStatus
        ) {
          // Ensure serviceType is set to TAKEAWAY
          localStorage.setItem("terra_serviceType", "TAKEAWAY");
          navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
          return;
        }

        // Otherwise, this is a fresh takeaway flow → show customer info modal and start a new session
        // This applies to both regular takeaway and takeaway-only QR flows
        // CRITICAL: Ensure takeaway sessionToken is generated even if customer skips info
        // This ensures both table QR and takeaway-only QR flows work identically
        if (!existingTakeawaySession) {
          const newTakeawaySessionToken = `TAKEAWAY-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          localStorage.setItem(
            "terra_takeaway_sessionToken",
            newTakeawaySessionToken
          );
          console.log(
            "[SecondPage] Generated takeaway sessionToken for fresh flow (unified):",
            newTakeawaySessionToken
          );
        }
        setShowCustomerInfoModal(true);
        return;
      }

      // For DINE_IN orders, check if user has active order first
      // If they have an active unpaid order, grant immediate access without lookup
      const existingOrderId =
        localStorage.getItem("terra_orderId") ||
        localStorage.getItem("terra_orderId_DINE_IN");
      const existingOrderStatus =
        localStorage.getItem("terra_orderStatus") ||
        localStorage.getItem("terra_orderStatus_DINE_IN");

      // Check if user has an active unpaid order
      const hasActiveOrder =
        existingOrderId &&
        existingOrderStatus &&
        !["Paid", "Cancelled", "Returned", "Completed"].includes(
          existingOrderStatus
        );

      // If user has active order, grant immediate access to menu
      if (hasActiveOrder) {
        console.log(
          "[SecondPage] User has active order - granting immediate access:",
          existingOrderId
        );
        const storedTable = localStorage.getItem("terra_selectedTable");
        if (storedTable) {
          try {
            const table = JSON.parse(storedTable);
            localStorage.setItem("terra_serviceType", serviceType);
            navigate("/menu", { state: { serviceType, table } });
            return;
          } catch {
            // If table parsing fails, continue with lookup
          }
        }
      }

      // For DINE_IN orders, ALWAYS verify table status via QR lookup first
      const storedTable = localStorage.getItem("terra_selectedTable");
      if (!storedTable) {
        alert(
          "We couldn't detect your table. Please scan the table QR again or contact staff."
        );
        return;
      }

      const table = JSON.parse(storedTable);
      const slug = table.qrSlug || localStorage.getItem("terra_scanToken");
      if (!slug) {
        alert("Missing table reference. Please rescan your QR code.");
        return;
      }

      try {
        // ALWAYS check table status via QR lookup - STRONG VERIFICATION
        const params = new URLSearchParams();
        const storedSession =
          sessionToken || localStorage.getItem("terra_sessionToken");
        if (storedSession) {
          params.set("sessionToken", storedSession);
        }
        // CRITICAL: Only pass waitToken if table is NOT available
        // If table is available, no waitlist logic should apply
        if (waitlistToken && table?.status !== "AVAILABLE") {
          params.set("waitToken", waitlistToken);
        }

        const url = `${nodeApi}/api/tables/lookup/${slug}${
          params.toString() ? `?${params.toString()}` : ""
        }`;
        const res = await fetch(url);

        // Handle 404 specifically - table not found
        if (res.status === 404) {
          // Clear invalid table data from localStorage
          localStorage.removeItem("terra_selectedTable");
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_sessionToken");
          setTableInfo(null);
          setSessionToken(null);

          const errorPayload = await res.json().catch(() => ({}));
          const errorMessage = errorPayload?.message || "Table not found";
          alert(
            `${errorMessage}. The QR code may be invalid or the table may have been removed. Please scan the table QR code again or contact staff for assistance.`
          );
          return;
        }

        const payload = await res.json().catch(() => ({}));

        // Table is occupied (423 status) - STRICT: Must join waitlist
        if (res.status === 423) {
          const lockedTable = payload.table || table;
          localStorage.setItem(
            "terra_selectedTable",
            JSON.stringify(lockedTable)
          );
          setTableInfo(lockedTable);
          setIsTableOccupied(true);

          // CRITICAL: Check if user has active order - multiple ways to verify
          // This handles cases where order ID format might differ (ObjectId vs string)
          const existingOrderId =
            localStorage.getItem("terra_orderId") ||
            localStorage.getItem("terra_orderId_DINE_IN");
          const customerSessionToken =
            localStorage.getItem("terra_sessionToken");
          const tableSessionToken = lockedTable?.sessionToken;

          // Check 1: Order ID matches (convert both to strings for comparison)
          const hasActiveOrderById =
            existingOrderId &&
            lockedTable?.currentOrder &&
            String(existingOrderId) === String(lockedTable.currentOrder);

          // Check 2: Session token matches (customer owns the table session)
          const hasActiveSession =
            customerSessionToken &&
            tableSessionToken &&
            customerSessionToken === tableSessionToken;

          // Check 3: Backend returned an order in the payload (customer has active order)
          const hasOrderInPayload = payload.order && payload.order._id;

          // If any check passes, customer should have access
          if (hasActiveOrderById || hasActiveSession || hasOrderInPayload) {
            console.log(
              "[SecondPage] Customer has active order/session - allowing access despite 423"
            );
            // Update session token if provided
            if (payload.sessionToken) {
              localStorage.setItem("terra_sessionToken", payload.sessionToken);
              setSessionToken(payload.sessionToken);
            }
            // Update order if provided
            if (payload.order) {
              localStorage.setItem("terra_orderId", payload.order._id);
              localStorage.setItem("terra_orderId_DINE_IN", payload.order._id);
            }
            localStorage.setItem("terra_serviceType", serviceType);
            navigate("/menu", { state: { serviceType, table: lockedTable } });
            return;
          }

          // STRICT: Table is occupied and user has no active order
          // CRITICAL: Only check waitlist if table is NOT available
          const lockedTableStatus = lockedTable?.status || "OCCUPIED";
          if (lockedTableStatus === "AVAILABLE") {
            // Table is actually available - proceed directly
            localStorage.setItem("terra_serviceType", serviceType);
            navigate("/menu", { state: { serviceType, table: lockedTable } });
            return;
          }

          // Check if user is in waitlist (only if table is NOT available)
          if (waitlistToken) {
            // User is in waitlist - check status
            try {
              const statusRes = await fetch(
                `${nodeApi}/api/waitlist/status?token=${waitlistToken}`
              );
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                // Only allow if status is NOTIFIED or SEATED
                if (
                  statusData.status === "NOTIFIED" ||
                  statusData.status === "SEATED"
                ) {
                  // CRITICAL: Clear all previous customer order data when waitlist user gets access
                  // This ensures new waitlist customers don't see previous customer's orders
                  clearOldOrderData();
                  console.log(
                    `[SecondPage] Waitlist user ${statusData.status} (in startDineInFlow) - cleared all order data for new customer`
                  );

                  // User is notified or seated, allow to proceed
                  if (
                    statusData.status === "SEATED" &&
                    statusData.sessionToken
                  ) {
                    localStorage.setItem(
                      "terra_sessionToken",
                      statusData.sessionToken
                    );
                    setSessionToken(statusData.sessionToken);
                    localStorage.removeItem("terra_waitToken");
                    setWaitlistToken(null);
                    setWaitlistInfo(null);
                  }
                  localStorage.setItem("terra_serviceType", serviceType);
                  navigate("/menu", {
                    state: { serviceType, table: lockedTable },
                  });
                  return;
                } else {
                  // User is still waiting - show waitlist modal
                  // BUT ONLY if it's not a TAKEAWAY order
                  if (serviceType === "TAKEAWAY") {
                    // TAKEAWAY orders should never show waitlist modal
                    setIsTableOccupied(false);
                    setShowWaitlistModal(false);
                    return;
                  }
                  // CRITICAL: Ensure all state is set before showing modal
                  setIsTableOccupied(true);
                  setTableInfo(lockedTable);
                  localStorage.setItem(
                    "terra_selectedTable",
                    JSON.stringify(lockedTable)
                  );
                  setShowWaitlistModal(true);
                  return;
                }
              }
            } catch (err) {
              console.error("Failed to check waitlist status", err);
            }
          }

          // User is NOT in waitlist - show waitlist modal
          // CRITICAL: Ensure all state is set before showing modal
          setIsTableOccupied(true);
          setTableInfo(lockedTable);
          localStorage.setItem(
            "terra_selectedTable",
            JSON.stringify(lockedTable)
          );
          setShowWaitlistModal(true);
          return;
        }

        // Table lookup failed
        if (!res.ok || !payload?.table) {
          // If it's a 404, we already handled it above, but check again for safety
          if (res.status === 404) {
            // Clear invalid table data from localStorage
            localStorage.removeItem("terra_selectedTable");
            localStorage.removeItem("terra_scanToken");
            localStorage.removeItem("terra_sessionToken");
            setTableInfo(null);
            setSessionToken(null);
            alert(
              "Table not found. The QR code may be invalid or the table may have been removed. Please scan the table QR code again or contact staff for assistance."
            );
            return;
          }
          throw new Error(payload?.message || "Failed to check table status.");
        }

        // STRONG LOGIC: Verify table status from response
        const tableData = payload.table;
        const tableStatus = tableData.status || "AVAILABLE";

        // CRITICAL: If table status is AVAILABLE, allow direct access (no waitlist)
        if (tableStatus === "AVAILABLE") {
          localStorage.setItem(
            "terra_selectedTable",
            JSON.stringify(tableData)
          );
          setTableInfo(tableData);
          setIsTableOccupied(false);
          setShowWaitlistModal(false);

          // Clear any existing waitlist token (first user doesn't need waitlist)
          if (waitlistToken) {
            localStorage.removeItem("terra_waitToken");
            setWaitlistToken(null);
            setWaitlistInfo(null);
          }

          // Update session token if provided.
          // IMPORTANT: Do NOT clear existing dine-in order data here; that would
          // cause active orders to disappear when customer revisits this page.
          if (payload.sessionToken || tableData.sessionToken) {
            const nextToken = payload.sessionToken || tableData.sessionToken;
            if (nextToken) {
              localStorage.setItem("terra_sessionToken", nextToken);
              setSessionToken(nextToken);
            }
          }

          // Proceed directly to menu - no waitlist needed
          localStorage.setItem("terra_serviceType", serviceType);
          navigate("/menu", { state: { serviceType, table: tableData } });
          return;
        }

        // Table is NOT available - apply waitlist logic (only if status is NOT "AVAILABLE")
        localStorage.setItem("terra_selectedTable", JSON.stringify(tableData));
        setTableInfo(tableData);

        // CRITICAL: If backend returned an order, user has active order - grant access immediately
        if (payload.order && payload.order._id) {
          console.log(
            "[SecondPage] Backend returned active order - granting access"
          );
          // Update session token if provided
          if (payload.sessionToken || tableData.sessionToken) {
            const nextToken = payload.sessionToken || tableData.sessionToken;
            if (nextToken) {
              localStorage.setItem("terra_sessionToken", nextToken);
              setSessionToken(nextToken);
            }
          }
          // Restore order state
          localStorage.setItem("terra_orderId", payload.order._id);
          localStorage.setItem("terra_orderId_DINE_IN", payload.order._id);
          if (payload.order.status) {
            localStorage.setItem("terra_orderStatus", payload.order.status);
            localStorage.setItem(
              "terra_orderStatus_DINE_IN",
              payload.order.status
            );
          }
          setIsTableOccupied(false);
          setShowWaitlistModal(false);
          localStorage.setItem("terra_serviceType", serviceType);
          navigate("/menu", { state: { serviceType, table: tableData } });
          return;
        }

        setIsTableOccupied(true);

        // Update session token if provided, without clearing existing dine-in order data.
        if (payload.sessionToken || tableData.sessionToken) {
          const nextToken = payload.sessionToken || tableData.sessionToken;
          if (nextToken) {
            localStorage.setItem("terra_sessionToken", nextToken);
            setSessionToken(nextToken);
          }
        }

        // If user was in waitlist and now seated, clear waitlist
        // CRITICAL: Also clear all previous customer order data when waitlist user is seated
        if (waitlistToken && payload.waitlist?.status === "SEATED") {
          // Clear all previous customer order data for new waitlist customer
          clearOldOrderData();
          console.log(
            "[SecondPage] Waitlist user SEATED (from table lookup) - cleared all order data for new customer"
          );

          if (payload.waitlist.sessionToken) {
            const nextToken = payload.waitlist.sessionToken;
            if (nextToken) {
              localStorage.setItem("terra_sessionToken", nextToken);
              setSessionToken(nextToken);
            }
          }
          localStorage.removeItem("terra_waitToken");
          setWaitlistToken(null);
          setWaitlistInfo(null);
          // Table is now available after being seated
          setIsTableOccupied(false);
          setShowWaitlistModal(false);
          localStorage.setItem("terra_serviceType", serviceType);
          navigate("/menu", { state: { serviceType, table: tableData } });
          return;
        }

        // Table is occupied and user is not seated - require waitlist
        // BUT ONLY if it's not a TAKEAWAY order
        if (serviceType === "TAKEAWAY") {
          // TAKEAWAY orders should never show waitlist modal
          setIsTableOccupied(false);
          setShowWaitlistModal(false);
          return;
        }
        // CRITICAL: Set table as occupied and show waitlist modal
        setIsTableOccupied(true);
        setTableInfo(tableData);
        localStorage.setItem("terra_selectedTable", JSON.stringify(tableData));
        // Show waitlist modal - don't show alert, let modal handle the message
        setShowWaitlistModal(true);
      } catch (err) {
        console.error("startServiceFlow error", err);

        // Check if error message indicates table not found
        if (err.message && err.message.includes("Table not found")) {
          // Clear invalid table data from localStorage
          localStorage.removeItem("terra_selectedTable");
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_sessionToken");
          setTableInfo(null);
          setSessionToken(null);
          alert(
            "Table not found. The QR code may be invalid or the table may have been removed. Please scan the table QR code again or contact staff for assistance."
          );
        } else {
          alert(
            `Unable to check table availability: ${
              err.message || "Unknown error"
            }. Please try again or contact staff for help.`
          );
        }
      }
    },
    [navigate, waitlistToken, sessionToken]
  );

  const startDineInFlow = useCallback(
    () => startServiceFlow("DINE_IN"),
    [startServiceFlow]
  );
  const startTakeawayFlow = useCallback(() => {
    // CRITICAL: For takeaway, clear all waitlist state immediately
    // Takeaway orders never need waitlist - they have full access
    localStorage.removeItem("terra_waitToken");
    setWaitlistToken(null);
    setWaitlistInfo(null);
    setShowWaitlistModal(false);
    setIsTableOccupied(false);
    // Set service type to TAKEAWAY
    localStorage.setItem("terra_serviceType", "TAKEAWAY");
    // Start takeaway flow
    startServiceFlow("TAKEAWAY");
  }, [startServiceFlow]);

  // Handle customer info modal submit for takeaway orders (fields OPTIONAL)
  // Works for both regular takeaway and takeaway-only QR flows
  const handleCustomerInfoSubmit = useCallback(() => {
    // Generate unique session token for this takeaway order
    const takeawaySessionToken = `TAKEAWAY-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Clear previous takeaway order data when starting new session
    console.log(
      "[SecondPage] Starting new takeaway session - clearing old order data",
      {
        takeawayOnly: localStorage.getItem("terra_takeaway_only"),
        cartId: localStorage.getItem("terra_takeaway_cartId"),
      }
    );
    localStorage.removeItem("terra_orderId_TAKEAWAY");
    localStorage.removeItem("terra_cart_TAKEAWAY");
    localStorage.removeItem("terra_orderStatus_TAKEAWAY");
    localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
    localStorage.removeItem("terra_previousOrder");
    localStorage.removeItem("terra_previousOrderDetail");

    // CRITICAL: Clear previous customer data when starting new takeaway session
    // This ensures each new customer starts with a clean slate
    localStorage.removeItem("terra_takeaway_customerName");
    localStorage.removeItem("terra_takeaway_customerMobile");
    localStorage.removeItem("terra_takeaway_customerEmail");
    console.log(
      "[SecondPage] Cleared previous customer data for new takeaway session"
    );

    // Save customer info to localStorage (OPTIONAL)
    const cleanName = customerName && customerName.trim();
    const cleanMobile = customerMobile && customerMobile.trim();
    if (cleanName) {
      localStorage.setItem("terra_takeaway_customerName", cleanName);
    } else {
      localStorage.removeItem("terra_takeaway_customerName");
    }
    if (cleanMobile) {
      localStorage.setItem("terra_takeaway_customerMobile", cleanMobile);
    } else {
      localStorage.removeItem("terra_takeaway_customerMobile");
    }
    if (customerEmail && customerEmail.trim()) {
      localStorage.setItem(
        "terra_takeaway_customerEmail",
        customerEmail.trim()
      );
    } else {
      localStorage.removeItem("terra_takeaway_customerEmail");
    }

    // Save takeaway session token
    localStorage.setItem("terra_takeaway_sessionToken", takeawaySessionToken);

    // Ensure serviceType is set to TAKEAWAY (for both regular and takeaway-only QR flows)
    localStorage.setItem("terra_serviceType", "TAKEAWAY");

    // CRITICAL: Clear waitlist state for takeaway orders
    localStorage.removeItem("terra_waitToken");
    setWaitlistToken(null);
    setWaitlistInfo(null);
    setShowWaitlistModal(false);
    setIsTableOccupied(false);

    // Close modal and navigate to menu
    setShowCustomerInfoModal(false);
    navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
  }, [customerName, customerMobile, customerEmail, navigate]);

  // Handle skip customer info (all fields optional)
  // Works for both regular takeaway and takeaway-only QR flows
  const handleSkipCustomerInfo = useCallback(() => {
    // Generate unique session token for this takeaway order
    const takeawaySessionToken = `TAKEAWAY-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Clear previous takeaway order data when starting new session
    console.log(
      "[SecondPage] Starting new takeaway session (skip info) - clearing old order data",
      {
        takeawayOnly: localStorage.getItem("terra_takeaway_only"),
        cartId: localStorage.getItem("terra_takeaway_cartId"),
      }
    );
    localStorage.removeItem("terra_orderId_TAKEAWAY");
    localStorage.removeItem("terra_cart_TAKEAWAY");
    localStorage.removeItem("terra_orderStatus_TAKEAWAY");
    localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
    localStorage.removeItem("terra_previousOrder");
    localStorage.removeItem("terra_previousOrderDetail");

    // Clear any existing customer info
    setCustomerName("");
    setCustomerMobile("");
    setCustomerEmail("");
    localStorage.removeItem("terra_takeaway_customerName");
    localStorage.removeItem("terra_takeaway_customerMobile");
    localStorage.removeItem("terra_takeaway_customerEmail");

    // Save takeaway session token
    localStorage.setItem("terra_takeaway_sessionToken", takeawaySessionToken);

    // Ensure serviceType is set to TAKEAWAY
    localStorage.setItem("terra_serviceType", "TAKEAWAY");

    // CRITICAL: Clear waitlist state for takeaway orders
    localStorage.removeItem("terra_waitToken");
    setWaitlistToken(null);
    setWaitlistInfo(null);
    setShowWaitlistModal(false);
    setIsTableOccupied(false);

    // Close modal and navigate to menu
    setShowCustomerInfoModal(false);
    navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
  }, [navigate]);

  // Open waitlist info modal when user clicks "Join Waitlist"
  const handleOpenWaitlistInfo = useCallback(() => {
    setShowWaitlistInfoModal(true);
  }, []);

  // Handle waitlist info modal submit
  const handleWaitlistInfoSubmit = useCallback(async () => {
    // CRITICAL: No waitlist if table is available
    if (!tableInfo) {
      alert("We couldn't detect your table. Please ask staff for help.");
      setShowWaitlistInfoModal(false);
      return;
    }

    const tableStatus = tableInfo.status || "AVAILABLE";
    if (tableStatus === "AVAILABLE") {
      alert("Table is available. You can proceed directly without waitlist.");
      setShowWaitlistInfoModal(false);
      return;
    }

    if (!isTableOccupied) {
      alert("Table is not occupied. You can proceed directly.");
      setShowWaitlistInfoModal(false);
      return;
    }

    const tableId = tableInfo?.id || tableInfo?._id;
    if (!tableId) {
      alert("We couldn't detect your table. Please ask staff for help.");
      setShowWaitlistInfoModal(false);
      return;
    }

    // Validate name is provided
    if (!waitlistGuestName || !waitlistGuestName.trim()) {
      alert("Please enter your name to join the waitlist.");
      setJoiningWaitlist(false);
      return;
    }

    // Parse and validate party size
    let partySize = parseInt(waitlistPartySize, 10);
    if (!Number.isFinite(partySize) || partySize <= 0) {
      alert("Please enter a valid number of members (at least 1).");
      setJoiningWaitlist(false);
      return;
    }

    // Validate against table capacity
    const tableCapacity =
      tableInfo?.capacity || tableInfo?.originalCapacity || null;
    if (tableCapacity && partySize > tableCapacity) {
      alert(
        `This table can accommodate a maximum of ${tableCapacity} members. Please enter ${tableCapacity} or fewer members.`
      );
      setJoiningWaitlist(false);
      return;
    }

    try {
      setJoiningWaitlist(true);
      // CRITICAL: Only send sessionToken if we have an existing waitlistToken
      // This prevents the backend from finding an existing entry by sessionToken
      // when the user is trying to join for the first time with name/members
      // If waitlistToken exists, it means user already joined before, so include sessionToken
      // Otherwise, don't send sessionToken to allow fresh join
      const shouldIncludeSessionToken = !!waitlistToken;
      const res = await fetch(`${nodeApi}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: tableId,
          token: waitlistToken || undefined,
          // Only include sessionToken if user already has a waitlistToken (rejoining)
          // This prevents "Already in waitlist" error when user is joining for first time
          sessionToken: shouldIncludeSessionToken
            ? sessionToken ||
              localStorage.getItem("terra_sessionToken") ||
              undefined
            : undefined,
          name: waitlistGuestName.trim(),
          partySize,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to join waitlist.");
      }

      // Save waitlist token
      localStorage.setItem("terra_waitToken", data.token);
      setWaitlistToken(data.token);
      setWaitlistInfo({
        token: data.token,
        status: "WAITING",
        position: data.position || 1,
        name: data.name || waitlistGuestName.trim() || null,
        partySize: data.partySize || partySize || 1,
      });
      setShowWaitlistModal(false);
      setShowWaitlistInfoModal(false);
      // Reset form
      setWaitlistGuestName("");
      setWaitlistPartySize("1");

      const position = data.position || 1;
      if (data.message === "Already in waitlist") {
        alert(`You're already in the waitlist. Your position is #${position}.`);
      } else {
        alert(`Added to waitlist. Your position is #${position}.`);
      }
    } catch (err) {
      alert(err.message || "Failed to join waitlist.");
    } finally {
      setJoiningWaitlist(false);
    }
  }, [
    tableInfo,
    isTableOccupied,
    waitlistToken,
    waitlistGuestName,
    waitlistPartySize,
    sessionToken,
  ]);

  // Handle skip waitlist info (close modal without joining)
  const handleSkipWaitlistInfo = useCallback(() => {
    setShowWaitlistInfoModal(false);
    setWaitlistGuestName("");
    setWaitlistPartySize("1");
  }, []);

  // Leave waitlist
  const handleLeaveWaitlist = useCallback(async () => {
    if (!waitlistToken) return;

    const confirmLeave = await window.confirm(
      t("waitlistLeaveConfirm") || "Leave the waitlist?"
    );
    if (!confirmLeave) return;

    try {
      await fetch(`${nodeApi}/api/waitlist/${waitlistToken}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to cancel waitlist", err);
    } finally {
      localStorage.removeItem("terra_waitToken");
      setWaitlistToken(null);
      setWaitlistInfo(null);
    }
  }, [waitlistToken, t]);

  // Refresh waitlist status
  const handleRefreshWaitlist = useCallback(async () => {
    if (!waitlistToken) return;

    try {
      const res = await fetch(
        `${nodeApi}/api/waitlist/status?token=${waitlistToken}`
      );
      if (res.ok) {
        const data = await res.json();
        setWaitlistInfo(data);
      }
    } catch (err) {
      console.error("Failed to refresh waitlist", err);
    }
  }, [waitlistToken]);

  const handleVoiceAssistant = () => {
    // Modal removed - button kept for visual consistency
  };

  const handleVoiceAssistantOld = () => {
    const dineInText = t("dineIn");
    const takeAwayText = t("takeAway");

    checkVoiceSupport(language);

    const instructionTexts = {
      en: [
        "Please choose an option:",
        `Say "${dineInText}" for dining in`,
        `Say "${takeAwayText}" for takeaway`,
      ],
      hi: [
        "कृपया एक विकल्प चुनें:",
        `"${dineInText}" बोलें रेस्टोरेंट में खाने के लिए`,
        `"${takeAwayText}" बोलें पैकेट में लेने के लिए`,
      ],
      mr: [
        "कृपया एक पर्याय निवडा:",
        `"${dineInText}" म्हणा रेस्टॉरंटमध्ये जेवण्यासाठी`,
        `"${takeAwayText}" म्हणा पॅकेटमध्ये घेण्यासाठी`,
      ],
      gu: [
        "કૃપા કરીને એક વિકલ્પ પસંદ કરો:",
        `"${dineInText}" કહો રેસ્ટોરન્ટમાં જમવા માટે`,
        `"${takeAwayText}" કહો પેકેટમાં લેવા માટે`,
      ],
    };

    const speechText = instructionTexts[language] || instructionTexts.en;

    readAloud(
      speechText,
      () => {
        const commands = {
          [dineInText.toLowerCase()]: () => startDineInFlow(),
          [takeAwayText.toLowerCase()]: () => startTakeawayFlow(),
        };

        if (language === "hi") {
          Object.assign(commands, {
            "रेस्टोरेंट में": startDineInFlow,
            रेस्टोरेंट: startDineInFlow,
            खाना: startDineInFlow,
            पैकेट: startTakeawayFlow,
            टेकअवे: startTakeawayFlow,
          });
        }

        if (language === "mr") {
          Object.assign(commands, {
            रेस्टॉरंट: startDineInFlow,
            रेस्टो: startDineInFlow,
            जेवण: startDineInFlow,
            खाणे: startDineInFlow,
            पॅकेट: startTakeawayFlow,
            पार्सल: startTakeawayFlow,
            घर: startTakeawayFlow,
          });
        }

        if (language === "gu") {
          Object.assign(commands, {
            રેસ્ટોરન્ટ: startDineInFlow,
            રેસ્ટો: startDineInFlow,
            જમવું: startDineInFlow,
            ખાવું: startDineInFlow,
            પેકેટ: startTakeawayFlow,
            પાર્સલ: startTakeawayFlow,
            ઘર: startTakeawayFlow,
          });
        }

        Object.assign(commands, {
          "dine in": startDineInFlow,
          dining: startDineInFlow,
          restaurant: startDineInFlow,
          "take away": startTakeawayFlow,
          takeaway: startTakeawayFlow,
          parcel: startTakeawayFlow,
        });

        startListening(commands, language);
      },
      language
    );
  };

  const waitlistStatusText = (status) => {
    switch ((status || "").toUpperCase()) {
      case "WAITING":
        return t("waitlistStatusWaiting");
      case "NOTIFIED":
        return t("waitlistStatusNotified");
      case "SEATED":
        return t("waitlistStatusSeated");
      case "CANCELLED":
        return t("waitlistStatusCancelled");
      default:
        return status || "";
    }
  };

  return (
    <>
      <div
        className={`main-container ${
          accessibilityMode ? "accessibility-mode" : "normal-mode"
        }`}
      >
        <Header showNavigationTabs={false} />

        <div
          className={`background-wrapper ${
            accessibilityMode ? "accessibility-background" : ""
          }`}
          style={{ backgroundImage: `url(${restaurantBg})` }}
        >
          <div className="overlay" />
        </div>

        <div className="content-wrapper">
          <div className="buttons-container">
            {!takeawayOnly && (
              <button
                onClick={() => {
                  // CRITICAL: Check if user has active order first - grant immediate access
                  const existingOrderId =
                    localStorage.getItem("terra_orderId") ||
                    localStorage.getItem("terra_orderId_DINE_IN");
                  const existingOrderStatus =
                    localStorage.getItem("terra_orderStatus") ||
                    localStorage.getItem("terra_orderStatus_DINE_IN");

                  const hasActiveOrder =
                    existingOrderId &&
                    existingOrderStatus &&
                    !["Paid", "Cancelled", "Returned", "Completed"].includes(
                      existingOrderStatus
                    );

                  // If user has active order, grant immediate access
                  if (hasActiveOrder) {
                    console.log(
                      "[SecondPage] User has active order - granting immediate access via button"
                    );
                    startDineInFlow();
                    return;
                  }

                  // STRONG LOGIC: Check actual table status before allowing Dine In
                  if (!tableInfo) {
                    alert(
                      "We couldn't detect your table. Please scan the table QR again."
                    );
                    return;
                  }

                  const tableStatus = tableInfo.status || "AVAILABLE";

                  // CRITICAL: If table status is AVAILABLE, allow direct access (no waitlist)
                  if (tableStatus === "AVAILABLE") {
                    // Table is available - proceed directly without waitlist
                    startDineInFlow();
                    return;
                  }

                  // Table is occupied - check if user is in waitlist
                  if (tableStatus !== "AVAILABLE" && !waitlistToken) {
                    // CRITICAL: Set table as occupied and show waitlist modal
                    // BUT ONLY if it's not a TAKEAWAY order
                    const currentServiceType =
                      localStorage.getItem("terra_serviceType") || "DINE_IN";
                    if (currentServiceType === "TAKEAWAY") {
                      // TAKEAWAY orders should never show waitlist modal
                      setIsTableOccupied(false);
                      setShowWaitlistModal(false);
                      return;
                    }
                    // Use tableInfo which is already available in this scope
                    setIsTableOccupied(true);
                    // tableInfo is already set, just ensure it's in localStorage
                    localStorage.setItem(
                      "terra_selectedTable",
                      JSON.stringify(tableInfo)
                    );
                    // Show waitlist modal - don't show alert, let modal handle the message
                    setShowWaitlistModal(true);
                    return;
                  }

                  // Table is occupied but user is in waitlist - proceed to check status
                  startDineInFlow();
                }}
                className={`nav-btn ${
                  accessibilityMode ? "nav-btn-accessibility" : "nav-btn-normal"
                }`}
              >
                {t("dineIn")}
              </button>
            )}

            <button
              onClick={startTakeawayFlow}
              className={`nav-btn ${
                accessibilityMode ? "nav-btn-accessibility" : "nav-btn-normal"
              }`}
            >
              {t("takeAway")}
            </button>
          </div>

          {/* Waitlist Status Card - only for dine-in (not for takeaway-only QR or TAKEAWAY service) */}
          {!takeawayOnly &&
            localStorage.getItem("terra_serviceType") !== "TAKEAWAY" &&
            waitlistToken &&
            waitlistInfo &&
            tableInfo?.status !== "AVAILABLE" && (
              <div className="waitlist-status-card">
                <h3 className="waitlist-status-title">
                  {t("waitlistActiveTitle")}
                </h3>
                <p className="waitlist-text">
                  {t("waitlistStatusLabel")}:{" "}
                  <strong>{waitlistStatusText(waitlistInfo.status)}</strong>
                </p>
                {waitlistInfo.position > 0 && (
                  <p className="waitlist-text">
                    {t("waitlistPosition", { position: waitlistInfo.position })}
                  </p>
                )}
                <p className="waitlist-text">{t("waitlistInstructions")}</p>
                <div className="waitlist-actions">
                  <button
                    className="waitlist-primary"
                    onClick={() => {
                      if (waitlistInfo.status === "WAITING") {
                        alert(
                          "Table is currently occupied. Please wait for your turn in the waitlist."
                        );
                        return;
                      }
                      startDineInFlow();
                    }}
                    disabled={
                      waitlistInfo.status !== "NOTIFIED" &&
                      waitlistInfo.status !== "SEATED"
                    }
                  >
                    {t("waitlistReadyButton")}
                  </button>
                  <button
                    className="waitlist-secondary"
                    onClick={handleLeaveWaitlist}
                  >
                    {t("waitlistCancel")}
                  </button>
                  <button
                    className="waitlist-secondary"
                    onClick={handleRefreshWaitlist}
                  >
                    {t("waitlistRefresh")}
                  </button>
                </div>
              </div>
            )}

          <div className="spacer" />
        </div>

        {/* Waitlist Modal - Show when table is occupied and user needs to join waitlist */}
        {/* CRITICAL: Show modal if showWaitlistModal is true and not in takeaway mode */}
        {!takeawayOnly &&
          localStorage.getItem("terra_serviceType") !== "TAKEAWAY" &&
          showWaitlistModal && (
            <div className="waitlist-modal">
              <div className="waitlist-panel">
                <h3 className="waitlist-title">{t("waitlistTitle")}</h3>
                <p className="waitlist-text">{t("waitlistDescription")}</p>
                <p className="waitlist-text">
                  {t("waitlistDescription") ||
                    "This table is currently occupied. Would you like to join the waitlist?"}
                </p>
                <div className="waitlist-actions">
                  <button
                    className="waitlist-primary"
                    onClick={handleOpenWaitlistInfo}
                    disabled={joiningWaitlist}
                  >
                    {t("waitlistJoin") || "Join Waitlist"}
                  </button>
                  <button
                    className="waitlist-secondary"
                    onClick={() => {
                      // STRICT: If user clicks "Not Now", they cannot access Dine In
                      setShowWaitlistModal(false);
                      alert(
                        "Table is currently occupied. You must join the waitlist to access Dine In. Please join the waitlist when you're ready."
                      );
                    }}
                  >
                    {t("waitlistNotNow") || "Not Now"}
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Waitlist Info Modal - Collect name and party size */}
        {showWaitlistInfoModal && (
          <div
            className="customer-info-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleSkipWaitlistInfo();
              }
            }}
          >
            <div
              className="customer-info-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="customer-info-modal-header">
                <h3>Join Waitlist</h3>
                <button
                  className="customer-info-close-btn"
                  onClick={handleSkipWaitlistInfo}
                >
                  ✕
                </button>
              </div>
              <div className="customer-info-modal-body">
                <p
                  style={{
                    marginBottom: "16px",
                    color: "#666",
                    fontSize: "0.9rem",
                  }}
                >
                  Please provide your details to join the waitlist:
                </p>
                <div className="customer-info-form">
                  <div className="customer-info-field">
                    <label htmlFor="waitlistGuestName">Your Name *</label>
                    <input
                      type="text"
                      id="waitlistGuestName"
                      value={waitlistGuestName}
                      onChange={(e) => setWaitlistGuestName(e.target.value)}
                      placeholder="Enter your name"
                      className="customer-info-input"
                      required
                    />
                  </div>
                  <div className="customer-info-field">
                    <label htmlFor="waitlistPartySize">
                      Number of Members *
                      {tableInfo?.capacity && (
                        <span
                          style={{
                            fontSize: "0.85rem",
                            fontWeight: "normal",
                            color: "#666",
                            marginLeft: "8px",
                          }}
                        >
                          (Max: {tableInfo.capacity})
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      id="waitlistPartySize"
                      value={waitlistPartySize}
                      onChange={(e) => {
                        const value = e.target.value;
                        setWaitlistPartySize(value);
                      }}
                      placeholder="Enter number of members"
                      className="customer-info-input"
                      min="1"
                      max={tableInfo?.capacity || undefined}
                      required
                    />
                    {tableInfo?.capacity && (
                      <p
                        style={{
                          marginTop: "4px",
                          fontSize: "0.75rem",
                          color: "#666",
                        }}
                      >
                        Available Seats: <strong>{tableInfo.capacity}</strong>
                        {waitlistPartySize &&
                          parseInt(waitlistPartySize, 10) >
                            tableInfo.capacity && (
                            <span
                              style={{
                                display: "block",
                                marginTop: "4px",
                                color: "#ef4444",
                                fontWeight: "500",
                              }}
                            >
                              ⚠️ Maximum capacity is {tableInfo.capacity}{" "}
                              members. Please reduce the number of members.
                            </span>
                          )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="customer-info-modal-footer">
                <button
                  className="customer-info-skip-btn"
                  onClick={handleSkipWaitlistInfo}
                >
                  Cancel
                </button>
                <button
                  className="customer-info-submit-btn"
                  onClick={handleWaitlistInfoSubmit}
                  disabled={
                    joiningWaitlist ||
                    !waitlistGuestName ||
                    !waitlistGuestName.trim() ||
                    !waitlistPartySize ||
                    parseInt(waitlistPartySize, 10) <= 0 ||
                    (tableInfo?.capacity &&
                      parseInt(waitlistPartySize, 10) > tableInfo.capacity)
                  }
                  style={{
                    opacity:
                      joiningWaitlist ||
                      !waitlistGuestName ||
                      !waitlistGuestName.trim() ||
                      !waitlistPartySize ||
                      parseInt(waitlistPartySize, 10) <= 0 ||
                      (tableInfo?.capacity &&
                        parseInt(waitlistPartySize, 10) > tableInfo.capacity)
                        ? 0.6
                        : 1,
                    cursor:
                      joiningWaitlist ||
                      !waitlistGuestName ||
                      !waitlistGuestName.trim() ||
                      !waitlistPartySize ||
                      parseInt(waitlistPartySize, 10) <= 0 ||
                      (tableInfo?.capacity &&
                        parseInt(waitlistPartySize, 10) > tableInfo.capacity)
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {joiningWaitlist ? "Joining..." : "Join Waitlist"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Customer Info Modal for Takeaway Orders (OPTIONAL fields) */}
        {showCustomerInfoModal && (
          <div
            className="customer-info-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleSkipCustomerInfo();
              }
            }}
          >
            <div
              className="customer-info-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="customer-info-modal-header">
                <h3>Customer Information (Optional)</h3>
                <button
                  className="customer-info-close-btn"
                  onClick={handleSkipCustomerInfo}
                >
                  ✕
                </button>
              </div>
              <div className="customer-info-modal-body">
                <p
                  style={{
                    marginBottom: "16px",
                    color: "#666",
                    fontSize: "0.9rem",
                  }}
                >
                  You can provide your details for the takeaway order
                  (optional).
                </p>
                <div className="customer-info-form">
                  <div className="customer-info-field">
                    <label htmlFor="customerName">Name (optional)</label>
                    <input
                      type="text"
                      id="customerName"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Enter your name"
                      className="customer-info-input"
                    />
                  </div>
                  <div className="customer-info-field">
                    <label htmlFor="customerMobile">
                      Mobile Number (optional)
                    </label>
                    <input
                      type="tel"
                      id="customerMobile"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      placeholder="Enter mobile number"
                      className="customer-info-input"
                    />
                  </div>
                  <div className="customer-info-field">
                    <label htmlFor="customerEmail">Email (Optional)</label>
                    <input
                      type="email"
                      id="customerEmail"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="customer-info-input"
                    />
                  </div>
                </div>
              </div>
              <div className="customer-info-modal-footer">
                <button
                  className="customer-info-submit-btn"
                  onClick={handleCustomerInfoSubmit}
                  style={{ width: "100%" }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Blind Support Button - Outside main-container to avoid overflow/clipping issues, same as Menu page */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleVoiceAssistant}
        className="fixed rounded-full shadow-lg bg-orange-500 text-white hover:bg-orange-600 focus:outline-none blind-eye-btn"
        style={{
          position: "fixed",
          bottom: "20px", // Same lower position as accessibility button
          right: "20px", // Right side instead of left
          width: "56px",
          height: "56px",
          display: "grid",
          placeItems: "center",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          transition:
            "transform .2s ease, box-shadow .2s ease, background .2s ease",
          zIndex: 10001, // Higher than footer (z-40) to ensure it's on top
          pointerEvents: "auto",
        }}
        aria-label="Blind Support - Voice Assistant"
      >
        <img
          src={blindEyeIcon}
          alt="Blind Support"
          width="24"
          height="24"
          style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
        />
      </motion.button>
    </>
  );
}
