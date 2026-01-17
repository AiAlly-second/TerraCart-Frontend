import Header from "../components/Header";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import blindEyeIcon from "../assets/images/blind-eye-sign.png";
import { getWithRetry } from "../utils/fetchWithTimeout";

const languages = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
  { code: "gu", label: "ગુજરાતી" },
];

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

// Validate API URL in production
if (
  import.meta.env.PROD &&
  (!import.meta.env.VITE_NODE_API_URL || nodeApi.includes("localhost"))
) {
  console.error(
    "[Landing] ⚠️ WARNING: VITE_NODE_API_URL is not set correctly in production!",
    "Current value:",
    import.meta.env.VITE_NODE_API_URL || "undefined"
  );
}

// Helper function to clear old DINE_IN order data when session changes
// CRITICAL: Preserves takeaway order data - only clears DINE_IN data
function clearOldOrderData() {
  console.log(
    "[Landing] Clearing old DINE_IN order data due to session change (preserving takeaway data)"
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
// CRITICAL: Only clears DINE_IN data - preserves takeaway data
function updateSessionToken(newToken, oldToken) {
  if (newToken && newToken !== oldToken) {
    // Only clear DINE_IN data when sessionToken changes
    // Takeaway uses separate sessionToken (terra_takeaway_sessionToken) so it's preserved
    clearOldOrderData(); // This now only clears DINE_IN data
  }
  if (newToken) {
    localStorage.setItem("terra_sessionToken", newToken);
  }
}

export default function Landing() {
  const navigate = useNavigate();
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const language = localStorage.getItem("language") || "en";

  const handleLanguageSelect = (langCode) => {
    localStorage.setItem("language", langCode);
    navigate("/secondpage");
  };

  const [isLoading, setIsLoading] = useState(true);

  // ✅ Ensure voices are loaded
  useEffect(() => {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }, []);

  // Read takeaway QR parameters from URL (takeaway-only mode and cart binding)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const takeawayParam = params.get("takeaway");
    const cartParam = params.get("cart");

    if (takeawayParam) {
      // Enable takeaway-only mode for this session
      localStorage.setItem("terra_takeaway_only", "true");
      if (cartParam) {
        localStorage.setItem("terra_takeaway_cartId", cartParam);
      }
    } else {
      // If no takeaway flag in URL, clear any previous takeaway-only mode
      localStorage.removeItem("terra_takeaway_only");
      localStorage.removeItem("terra_takeaway_cartId");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let slug = params.get("table");
    
    // CRITICAL: Check sessionStorage for persisted table parameter
    // This handles the case where useTablePersistence is maintaining the table across pages
    if (!slug) {
      const persistedTable = sessionStorage.getItem('terra_table_param');
      if (persistedTable) {
        console.log('[Landing] Using persisted table parameter from sessionStorage:', persistedTable);
        slug = persistedTable;
        // Update URL to include table parameter for consistency
        const newUrl = `${window.location.pathname}?table=${persistedTable}`;
        window.history.replaceState({}, '', newUrl);
      }
    }

    // CRITICAL: If no table parameter in URL or sessionStorage, clear all dine-in order data
    // This ensures users opening normal links don't see old table/dine order data
    if (!slug || slug.trim().length < 5) {
      // Also clear if slug is too short (likely invalid)
      if (slug && slug.trim().length < 5) {
        console.warn("[Landing] Invalid slug detected (too short):", slug);
      }
      // Clear all dine-in order data when opening normal link (not from QR)
      clearOldOrderData();
      // Also clear table-related data
      localStorage.removeItem("terra_selectedTable");
      localStorage.removeItem("terra_scanToken");
      localStorage.removeItem("terra_sessionToken");
      localStorage.removeItem("terra_waitToken");
      localStorage.removeItem("terra_serviceType"); // Clear serviceType for normal links
      localStorage.removeItem("terra_orderType"); // Clear orderType for normal links (prevents Pickup/Delivery persistence)
      console.log("[Landing] No table parameter - cleared all dine-in order data");
      setIsLoading(false);
      return;
    }
    
    // CRITICAL: Validate stored table matches URL slug
    // This prevents using wrong table data when URL changes
    const storedSlug = localStorage.getItem("terra_scanToken");
    const storedTableStr = localStorage.getItem("terra_selectedTable");
    
    if (storedSlug && storedSlug !== slug) {
      console.warn("[Landing] URL table slug doesn't match stored slug - clearing old table data:", {
        urlSlug: slug,
        storedSlug: storedSlug,
      });
      // Clear old table data if it doesn't match URL
      localStorage.removeItem("terra_selectedTable");
      localStorage.removeItem("terra_scanToken");
      localStorage.removeItem("terra_sessionToken");
      localStorage.removeItem("terra_waitToken");
      localStorage.removeItem("terra_serviceType");
      clearOldOrderData();
    } else if (storedTableStr) {
      // Validate stored table data matches URL slug
      try {
        const storedTable = JSON.parse(storedTableStr);
        const storedTableSlug = storedTable.qrSlug || storedSlug;
        if (storedTableSlug && storedTableSlug !== slug) {
          console.warn("[Landing] Stored table qrSlug doesn't match URL slug - clearing:", {
            urlSlug: slug,
            storedTableSlug: storedTableSlug,
            tableNumber: storedTable.number,
          });
          // Clear mismatched table data
          localStorage.removeItem("terra_selectedTable");
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_sessionToken");
          localStorage.removeItem("terra_waitToken");
          localStorage.removeItem("terra_serviceType");
          clearOldOrderData();
        }
      } catch (e) {
        console.warn("[Landing] Failed to validate stored table data:", e);
        // Clear invalid table data
        localStorage.removeItem("terra_selectedTable");
        localStorage.removeItem("terra_scanToken");
      }
    }

    const assignTableFromSlug = async () => {
      try {
        // CRITICAL: Check if payment was completed - if so, clear all previous session data
        // This ensures that after payment completion, when user refreshes and scans a table (new or same),
        // they start with a fresh session and don't see previous order data
        const paymentCompleted = localStorage.getItem("terra_paymentCompleted") === "true";
        if (paymentCompleted) {
          console.log("[Landing] Payment was completed - clearing all previous session data for fresh start");
          // Clear all session and order data
          localStorage.removeItem("terra_selectedTable");
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_sessionToken");
          localStorage.removeItem("terra_waitToken");
          localStorage.removeItem("terra_serviceType");
          // Clear all order data
          clearOldOrderData();
          // Clear takeaway data
          localStorage.removeItem("terra_takeaway_only");
          localStorage.removeItem("terra_takeaway_cartId");
          localStorage.removeItem("terra_takeaway_customerName");
          localStorage.removeItem("terra_takeaway_customerMobile");
          localStorage.removeItem("terra_takeaway_customerEmail");
          localStorage.removeItem("terra_takeaway_sessionToken");
          localStorage.removeItem("terra_orderId_TAKEAWAY");
          localStorage.removeItem("terra_cart_TAKEAWAY");
          localStorage.removeItem("terra_orderStatus_TAKEAWAY");
          localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
          // Clear the payment completed flag
          localStorage.removeItem("terra_paymentCompleted");
          console.log("[Landing] All session data cleared after payment completion");
        }

        const previousSlug = localStorage.getItem("terra_scanToken");
        const storedSession = localStorage.getItem("terra_sessionToken");
        const storedWait = localStorage.getItem("terra_waitToken");

        // CRITICAL: Always clear old table data when scanning a NEW slug
        // This prevents wrong table data from being used (e.g., scanning table 12 but using cached table 8 data)
        const isNewTableScan = previousSlug && previousSlug !== slug;
        
        if (isNewTableScan) {
          // CRITICAL: Clear ALL table-related data when scanning a different table QR
          // This ensures we start fresh and don't use cached data from a different table
          console.log("[Landing] New table QR scan detected - clearing old table data:", {
            previousSlug,
            newSlug: slug,
          });
          // Clear ALL table-related data first
          localStorage.removeItem("terra_selectedTable");
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_sessionToken");
          localStorage.removeItem("terra_waitToken");
          // Clear serviceType to force fresh detection
          localStorage.removeItem("terra_serviceType");
          // Clear order data for the old table
          clearOldOrderData();
          // CRITICAL: Also clear takeaway flags to ensure clean state
          localStorage.removeItem("terra_takeaway_only");
          localStorage.removeItem("terra_takeaway_cartId");
        } else if (!previousSlug) {
          // First scan - ensure clean state
          console.log("[Landing] First table QR scan - ensuring clean state");
          localStorage.removeItem("terra_takeaway_only");
          localStorage.removeItem("terra_takeaway_cartId");
        }

        // CRITICAL: When scanning a dine-in table QR, always clear takeaway-related data
        // This ensures dine-in tables don't show takeaway orders and don't redirect to takeaway
        // Only clear takeaway data if this is a DIFFERENT table QR scan (not a refresh)
        // Don't clear takeaway data on page refresh (same slug) - preserve order data
        if (isNewTableScan) {
          // Only clear takeaway data when scanning a DIFFERENT table QR
          // This preserves takeaway order data on page refresh
          localStorage.removeItem("terra_takeaway_customerName");
          localStorage.removeItem("terra_takeaway_customerMobile");
          localStorage.removeItem("terra_takeaway_customerEmail");
          localStorage.removeItem("terra_takeaway_sessionToken");
          // CRITICAL: Clear takeaway cartId when scanning dine-in table QR
          // This prevents menu from loading takeaway cart instead of table's cart
          localStorage.removeItem("terra_takeaway_cartId");
          // CRITICAL: Clear takeaway order data to prevent redirect to takeaway flow
          localStorage.removeItem("terra_orderId_TAKEAWAY");
          localStorage.removeItem("terra_cart_TAKEAWAY");
          localStorage.removeItem("terra_orderStatus_TAKEAWAY");
          localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
          // CRITICAL: Clear takeaway-only flag to prevent takeaway mode
          localStorage.removeItem("terra_takeaway_only");
          console.log(
            "[Landing] Different table QR scan detected, cleared takeaway data, cartId, and flags"
          );
        } else if (!previousSlug) {
          // First scan (no previous slug) - clear takeaway data to ensure clean state
          localStorage.removeItem("terra_takeaway_cartId");
          localStorage.removeItem("terra_takeaway_only");
          // Also clear stale takeaway order IDs to prevent redirect
          localStorage.removeItem("terra_orderId_TAKEAWAY");
          console.log(
            "[Landing] First table QR scan - cleared takeaway cartId, flags, and order IDs for clean state"
          );
        } else {
          // Same slug (page refresh) - preserve takeaway order data
          console.log(
            "[Landing] Same table QR or first scan - preserving takeaway order data"
          );
        }

        // CRITICAL: Pass waitToken if it exists - this prevents duplicate waitlist entries
        // Backend will check table status first and only use waitToken if table is NOT available
        const query = new URLSearchParams();
        if (storedSession) {
          query.set("sessionToken", storedSession);
        }
        // Pass waitToken if exists - backend will reuse existing entry instead of creating duplicate
        if (storedWait) {
          query.set("waitToken", storedWait);
        }
        // Validate and encode slug
        const validSlug = slug.trim();
        if (validSlug.length < 5) {
          console.error("[Landing] Invalid slug (too short):", validSlug);
          alert("Invalid table QR code. Please scan the table QR code again.");
          return;
        }
        
        const url = `${nodeApi}/api/tables/lookup/${encodeURIComponent(validSlug)}${
          query.toString() ? `?${query.toString()}` : ""
        }`;
        console.log("[Landing] Table lookup URL:", url);
        console.log(
          "[Landing] Table lookup with waitToken:",
          storedWait || "No"
        );
        console.log("[Landing] Backend API URL:", nodeApi);
        console.log("[Landing] Slug from URL:", slug);
        console.log("[Landing] Environment:", {
          mode: import.meta.env.MODE,
          dev: import.meta.env.DEV,
          prod: import.meta.env.PROD,
          viteNodeApiUrl: import.meta.env.VITE_NODE_API_URL,
        });

        // Use fetch with retry and timeout for better reliability
        const res = await getWithRetry(
          url,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
          {
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 20000, // 20 second timeout for table lookup
            shouldRetry: (error, attempt) => {
              // Retry on network errors, timeouts, or 5xx errors
              if (
                error.message?.includes("timeout") ||
                error.message?.includes("Network error") ||
                error.message?.includes("Failed to fetch") ||
                error.message?.includes("CORS")
              ) {
                console.log(
                  `[Landing] Retrying table lookup (attempt ${
                    attempt + 1
                  }/3)...`
                );
                return true;
              }
              // Don't retry on 4xx errors (client errors)
              if (error.status >= 400 && error.status < 500) {
                return false;
              }
              // Retry on 5xx errors (server errors)
              if (error.status >= 500) {
                return true;
              }
              return attempt < 2;
            },
          }
        ).catch((fetchError) => {
          console.error("[Landing] Fetch error after retries:", fetchError);

          // Provide user-friendly error messages
          if (fetchError.message?.includes("timeout")) {
            throw new Error(
              "Connection timeout: The server took too long to respond. This might be due to slow network or server issues. Please try again."
            );
          }
          if (
            fetchError.message?.includes("CORS") ||
            fetchError.message?.includes("Failed to fetch")
          ) {
            throw new Error(
              `Network error: Cannot connect to server. Please check your internet connection. If the problem persists, the server might be temporarily unavailable.`
            );
          }
          throw new Error(
            `Network error: ${
              fetchError.message || "Unknown error"
            }. Please try again or contact support if the problem persists.`
          );
        });

        // Parse JSON response - 423 status is expected for locked tables
        let payload = {};
        const contentType = res.headers.get("content-type");
        const isJson = contentType && contentType.includes("application/json");

        try {
          if (isJson) {
            // Try to parse as JSON first
            payload = await res.json();
          } else {
            // If not JSON, try to parse text
            const text = await res.text();
            if (text) {
              payload = JSON.parse(text);
            }
          }
        } catch (parseErr) {
          console.warn(
            "[Landing] Failed to parse response:",
            parseErr,
            "Status:",
            res.status
          );
          // For 423 status, we still want to proceed - it's expected behavior
          if (res.status === 423) {
            // Create a default payload for 423 if parsing fails
            // BUT: Don't assume waitlist - check table status first
            payload = {
              message: "Table is currently occupied. Please wait.",
              table: {
                status: "OCCUPIED", // Default to occupied if we can't parse
              },
            };
          } else {
            throw new Error("Failed to parse server response");
          }
        }

        // 423 is expected for locked tables - don't treat it as an error
        // NOTE: Browser may log "Failed to load resource: 423" in console - this is normal and expected
        // 400 with isMerged flag means table is merged - handle specially
        if (!res.ok && res.status !== 423) {
          console.error("[Landing] Table lookup failed:", {
            status: res.status,
            statusText: res.statusText,
            payload: payload,
            url: url,
            nodeApi: nodeApi,
          });

          if (res.status === 404) {
            throw new Error(
              "Table not found. The QR code may be invalid or the table may have been deleted. Please contact staff."
            );
          }

          if (res.status === 400 && payload?.isMerged) {
            // Table is merged - show special message
            alert(
              payload.message ||
                "This table has been merged with another table. Please scan the primary table's QR code."
            );
            throw new Error(payload.message || "Table is merged");
          }

          if (res.status === 0 || !res.status) {
            throw new Error(
              "Cannot connect to server. This might be a network issue or the server is temporarily unavailable. Please check your internet connection and try again."
            );
          }

          // Provide more specific error messages based on status code
          if (res.status === 500 || res.status >= 502) {
            throw new Error(
              "Server error: The server encountered an issue. Please try again in a moment. If the problem persists, contact support."
            );
          }

          if (res.status === 503) {
            throw new Error(
              "Service unavailable: The server is temporarily unavailable. Please try again in a few moments."
            );
          }

          throw new Error(
            payload?.message ||
              `Failed to fetch table information (Status: ${res.status}). Please try scanning the QR code again.`
          );
        }

        // Log for debugging
        if (res.status === 423) {
          console.log(
            "[Landing] Table locked (423), waitlist info:",
            payload.waitlist
          );
        }

        const tableData = payload.table || payload;
        if (!tableData) {
          throw new Error("Invalid table response");
        }

        // CRITICAL: Validate table data has required fields
        // This ensures we're storing a valid table, not corrupted data
        if (!tableData.id && !tableData._id) {
          console.error("[Landing] Table response missing ID:", tableData);
          throw new Error("Invalid table response: missing table ID");
        }
        if (!tableData.number && !tableData.tableNumber) {
          console.error("[Landing] Table response missing number:", tableData);
          throw new Error("Invalid table response: missing table number");
        }

        // CRITICAL: Validate that the returned table matches the slug we scanned
        // This prevents wrong table data from being stored (e.g., scanning table 12 but getting table 8)
        const returnedQrSlug = tableData.qrSlug || tableData.qrToken;
        if (returnedQrSlug && returnedQrSlug !== slug) {
          console.error("[Landing] Table slug mismatch!", {
            scannedSlug: slug,
            returnedQrSlug: returnedQrSlug,
            tableNumber: tableData.number || tableData.tableNumber,
            tableId: tableData.id || tableData._id,
          });
          throw new Error(
            `Table QR code mismatch: Scanned slug "${slug}" but got table with slug "${returnedQrSlug}" (Table ${tableData.number || tableData.tableNumber}). Please scan the correct QR code.`
          );
        }

        // Log table lookup for debugging
        console.log("[Landing] Table lookup successful:", {
          scannedSlug: slug,
          tableNumber: tableData.number || tableData.tableNumber,
          tableId: tableData.id || tableData._id,
          qrSlug: returnedQrSlug,
          cartId: tableData.cartId || tableData.cafeId,
        });

        const isNewTable = previousSlug && previousSlug !== slug;

        // CRITICAL: Check table status - if AVAILABLE, clear DINE_IN order data only
        // For takeaway orders, preserve data across refreshes - only clear when switching tables
        const tableStatusFromResponse =
          tableData.status || (res.status === 423 ? "OCCUPIED" : "AVAILABLE");
        const shouldClearDineInOrderData =
          isNewTable || tableStatusFromResponse === "AVAILABLE";

        if (isNewTable) {
          // Clear old format keys for new table scan (DINE_IN only)
          localStorage.removeItem("terra_orderId");
          localStorage.removeItem("terra_cart");
          localStorage.removeItem("terra_orderStatus");
          localStorage.removeItem("terra_orderStatusUpdatedAt");
          localStorage.removeItem("terra_serviceType");
          localStorage.removeItem("terra_waitToken");
          localStorage.removeItem("terra_sessionToken");

          // Clear DINE_IN-specific keys
          localStorage.removeItem("terra_orderId_DINE_IN");
          localStorage.removeItem("terra_cart_DINE_IN");
          localStorage.removeItem("terra_orderStatus_DINE_IN");
          localStorage.removeItem("terra_orderStatusUpdatedAt_DINE_IN");

          // CRITICAL: Only clear takeaway data when switching to a DIFFERENT table
          // This was already handled above in the isNewTableScan check
          // Don't clear takeaway data here again to avoid double-clearing
          console.log(
            "[Landing] New table scan - cleared DINE_IN data, takeaway data already handled"
          );

          // Clear only DINE_IN-specific keys - preserve TAKEAWAY data
          // TAKEAWAY data should only be cleared when explicitly switching from takeaway to dine-in
          localStorage.removeItem("terra_cart_DINE_IN");
          localStorage.removeItem("terra_orderId_DINE_IN");
          localStorage.removeItem("terra_orderStatus_DINE_IN");
          localStorage.removeItem("terra_orderStatusUpdatedAt_DINE_IN");
          localStorage.removeItem("terra_lastTableId_DINE_IN");
          localStorage.removeItem("terra_lastTableSlug_DINE_IN");

          console.log(
            "[Landing] New table detected, cleared all cart, order, and customer data"
          );
        }

        // CRITICAL: Ensure table data includes cartId for proper menu filtering
        // If cartId is missing from response, log a warning
        if (!tableData.cartId && !tableData.cafeId) {
          console.warn(
            "[Landing] Table response missing cartId/cafeId:",
            tableData
          );
        }
        
        // CRITICAL: Clear takeaway cartId when table is successfully scanned
        // This ensures menu loads the correct cart for dine-in orders
        localStorage.removeItem("terra_takeaway_cartId");
        localStorage.removeItem("terra_takeaway_only");
        
        // CRITICAL: Explicitly set serviceType to DINE_IN when table QR is scanned
        // This prevents Menu.jsx from detecting stale takeaway orders and redirecting
        localStorage.setItem("terra_serviceType", "DINE_IN");
        
        // CRITICAL: Store table data with all required fields
        // Ensure we include id, number, qrSlug, cartId, and status for proper table identification
        // CRITICAL: Always use the slug from the URL (the one we scanned), not from the response
        // This ensures we store the correct slug even if there's a mismatch
        const tableDataToStore = {
          id: tableData.id || tableData._id,
          _id: tableData._id || tableData.id,
          number: tableData.number || tableData.tableNumber,
          tableNumber: tableData.tableNumber || tableData.number,
          name: tableData.name || null,
          qrSlug: slug, // CRITICAL: Always use the slug from URL (the one we scanned)
          cartId: tableData.cartId || tableData.cafeId || null,
          cafeId: tableData.cartId || tableData.cafeId || null, // Alias for compatibility
          status: tableData.status || "AVAILABLE",
          capacity: tableData.capacity || null,
          originalCapacity: tableData.originalCapacity || null,
          sessionToken: tableData.sessionToken || null,
          currentOrder: tableData.currentOrder || null,
        };
        
        // CRITICAL: Validate table number matches what we expect
        // Double-check that we're storing the correct table
        const storedTableNumber = tableDataToStore.number;
        console.log("[Landing] Storing table data:", {
          scannedSlug: slug,
          storedTableNumber: storedTableNumber,
          tableId: tableDataToStore.id,
          qrSlug: tableDataToStore.qrSlug,
          cartId: tableDataToStore.cartId,
          status: tableDataToStore.status,
        });
        
        localStorage.setItem("terra_selectedTable", JSON.stringify(tableDataToStore));
        localStorage.setItem("terra_scanToken", slug);
        
        // CRITICAL: Verify the stored data matches what we scanned
        const verifyStored = localStorage.getItem("terra_selectedTable");
        if (verifyStored) {
          try {
            const verified = JSON.parse(verifyStored);
            if (verified.qrSlug !== slug) {
              console.error("[Landing] CRITICAL: Stored table slug doesn't match scanned slug!", {
                scannedSlug: slug,
                storedSlug: verified.qrSlug,
                tableNumber: verified.number,
              });
              // Clear and re-store with correct slug
              localStorage.setItem("terra_selectedTable", JSON.stringify(tableDataToStore));
              localStorage.setItem("terra_scanToken", slug);
            }
          } catch (e) {
            console.error("[Landing] Failed to verify stored table data:", e);
          }
        }

        // STRONG LOGIC: Check table status from response
        const tableStatus =
          tableData.status || (res.status === 423 ? "OCCUPIED" : "AVAILABLE");

        // CRITICAL: If table is AVAILABLE, clear DINE_IN order data only
        // Preserve takeaway order data - only clear when user is actually switching to dine-in
        if (tableStatus === "AVAILABLE" && !isNewTable) {
          // Table is available but not a new scan - clear DINE_IN order data only
          // Don't clear takeaway data unless user is explicitly switching modes
          clearOldOrderData(); // This now only clears DINE_IN data
          console.log(
            "[Landing] Table is AVAILABLE - cleared DINE_IN order data (preserved takeaway data)"
          );
        }

        // CRITICAL: If table is AVAILABLE, NO WAITLIST LOGIC - clear all waitlist state
        // Also clear DINE_IN order data to ensure new customer sees clean state
        if (res.status === 200 && tableStatus === "AVAILABLE") {
          // Table is available - clear ALL waitlist-related state
          localStorage.removeItem("terra_waitToken");

          // CRITICAL: Clear DINE_IN order data when table is AVAILABLE
          // Preserve takeaway order data - only clear when user is actually switching to dine-in
          clearOldOrderData(); // This now only clears DINE_IN data
          console.log(
            "[Landing] Table is AVAILABLE - cleared DINE_IN order data (preserved takeaway data)"
          );

          // Update sessionToken
          const newSessionToken =
            payload.sessionToken || tableData.sessionToken;
          if (newSessionToken) {
            localStorage.setItem("terra_sessionToken", newSessionToken);
          }
          // First user can proceed directly - NO WAITLIST LOGIC APPLIED
          return;
        }

        // CRITICAL: Double-check - if table status is AVAILABLE, skip all waitlist logic
        if (tableStatus === "AVAILABLE") {
          localStorage.removeItem("terra_waitToken");

          // CRITICAL: Always clear old order data when table is AVAILABLE
          // This ensures new customers don't see previous customer's orders
          clearOldOrderData();
          console.log(
            "[Landing] Table is AVAILABLE - cleared all order data for new customer"
          );

          // Update sessionToken
          const newSessionToken =
            payload.sessionToken || tableData.sessionToken;
          if (newSessionToken) {
            localStorage.setItem("terra_sessionToken", newSessionToken);
          }
          return; // No waitlist logic for available tables
        }

        // Table is NOT available - apply waitlist logic
        // CRITICAL: DO NOT remove sessionToken on 423 responses - 423 is expected for occupied tables
        // Only clear sessionToken on actual errors (network failures, 500 errors)
        // Preserve sessionToken when table is locked but user has active order
        if (res.status !== 423) {
          // Only update sessionToken for non-423 responses
          const newSessionToken =
            payload.sessionToken || tableData.sessionToken;
          updateSessionToken(newSessionToken, storedSession);
        } else {
          // For 423 responses, preserve existing sessionToken if user has active order
          const existingOrderId =
            localStorage.getItem("terra_orderId") ||
            localStorage.getItem("terra_orderId_DINE_IN");
          if (!existingOrderId) {
            // Only clear if user has no active order
            // But still try to preserve if payload has sessionToken
            const newSessionToken =
              payload.sessionToken || tableData.sessionToken;
            if (newSessionToken) {
              updateSessionToken(newSessionToken, storedSession);
            }
          } else {
            // User has active order - preserve sessionToken
            const currentToken = localStorage.getItem("terra_sessionToken");
            if (currentToken) {
              // Keep existing token
              console.log(
                "[Landing] Preserving sessionToken for user with active order"
              );
            }
          }
        }

        // CRITICAL: Only store waitlist token if user already has an existing entry
        // Don't auto-create waitlist entries - user must join manually
        if (tableStatus !== "AVAILABLE") {
          if (payload.waitlist?.token && storedWait) {
            // User already has a waitlist entry - restore it
            localStorage.setItem("terra_waitToken", payload.waitlist.token);
          } else if (res.status !== 423 || !storedWait) {
            // No existing waitlist entry - clear token, user must join manually
            localStorage.removeItem("terra_waitToken");
          }
          if (
            payload.waitlist?.status === "SEATED" &&
            payload.waitlist?.sessionToken
          ) {
            // CRITICAL: Clear all previous customer order data when waitlist user is seated
            // This ensures new waitlist customers don't see previous customer's orders
            clearOldOrderData();
            console.log(
              "[Landing] Waitlist user SEATED - cleared all order data for new customer"
            );

            updateSessionToken(payload.waitlist.sessionToken, storedSession);
            localStorage.removeItem("terra_waitToken");
          }

          // CRITICAL: Also clear order data when waitlist user is NOTIFIED
          if (payload.waitlist?.status === "NOTIFIED") {
            clearOldOrderData();
            console.log(
              "[Landing] Waitlist user NOTIFIED - cleared all order data for new customer"
            );
          }
        }

        // CRITICAL: Only handle 423 status if table is actually NOT available
        // Check table status FIRST before applying any waitlist logic
        if (res.status === 423) {
          // Verify table status from response - if available, clear waitlist
          const actualTableStatus = tableData?.status || "OCCUPIED";

          // STRONG CHECK: If table is actually AVAILABLE, clear waitlist and return
          if (actualTableStatus === "AVAILABLE") {
            localStorage.removeItem("terra_waitToken");

            // CRITICAL: Always clear old order data when table is AVAILABLE
            // This ensures new customers don't see previous customer's orders
            clearOldOrderData();
            console.log(
              "[Landing] Table is AVAILABLE (423 response) - cleared all order data for new customer"
            );

            const newSessionToken =
              payload.sessionToken || tableData?.sessionToken;
            if (newSessionToken) {
              localStorage.setItem("terra_sessionToken", newSessionToken);
            }
            return; // Table is available, no waitlist needed
          }

          // Table is actually OCCUPIED - apply waitlist logic
          console.log(
            "[Landing] Table locked (423), waitlist info:",
            payload.waitlist
              ? {
                  token: payload.waitlist.token,
                  status: payload.waitlist.status,
                  position: payload.waitlist.position,
                }
              : "No waitlist info"
          );

          // CRITICAL: Don't auto-store waitlist token - user must explicitly join waitlist
          // Only store if user already has an existing waitlist entry (they joined before)
          if (actualTableStatus !== "AVAILABLE") {
            // Table is occupied - user needs to join waitlist manually
            // Don't auto-join, just inform them
            if (payload.waitlist?.token) {
              // User already has a waitlist entry from previous session - restore it
              localStorage.setItem("terra_waitToken", payload.waitlist.token);
              const position = payload.waitlist?.position || 1;
              alert(
                payload?.message ||
                  `Table is currently occupied. You are #${position} in the waitlist.`
              );
            } else {
              // No waitlist entry - user must join manually
              alert(
                payload?.message ||
                  "This table is currently occupied. You will be asked to join the waitlist on the next page."
              );
              // Clear any old waitlist token
              localStorage.removeItem("terra_waitToken");
            }
          }

          // Continue with the flow - don't throw error, allow user to proceed
          return; // Exit early, user can proceed to next page
        }
      } catch (err) {
        console.error("Table assignment failed", err);
        if (err.message === "Table is currently assigned to another guest") {
          const storedSession = localStorage.getItem("terra_sessionToken");
          localStorage.removeItem("terra_sessionToken");
          localStorage.removeItem("terra_waitToken");
          if (storedSession) {
            setTimeout(assignTableFromSlug, 1000);
            return;
          }
          localStorage.removeItem("terra_scanToken");
          alert(
            "This table is currently occupied. Please ask the staff for assistance."
          );
        } else if (err.message && err.message.includes("merged")) {
          // Table is merged - message already shown in the check above
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_waitToken");
          localStorage.removeItem("terra_sessionToken");
          // Don't show alert again, it was already shown
        } else {
          localStorage.removeItem("terra_scanToken");
          localStorage.removeItem("terra_waitToken");
          localStorage.removeItem("terra_sessionToken");
          localStorage.removeItem("terra_selectedTable");
          // Only show generic error if it wasn't already shown (merged table case)
          if (!err.message || !err.message.includes("merged")) {
            // Check if it's a 404 error (table not found)
            if (err.message && err.message.includes("Table not found")) {
              alert(
                "Table not found. The QR code may be invalid or the table may have been removed. Please scan the table QR code again or contact staff for assistance."
              );
            } else {
              alert(
                "We couldn't detect your table. Please rescan the table QR or contact staff."
              );
            }
          }
        }
      } finally {
        params.delete("table");
        const newQuery = params.toString();
        const newUrl = `${window.location.pathname}${
          newQuery ? `?${newQuery}` : ""
        }${window.location.hash}`;
        window.history.replaceState({}, "", newUrl);
        setIsLoading(false);
      }
    };

    assignTableFromSlug();
  }, []);

  const toggleAccessibility = () => {
    const newMode = !accessibilityMode;
    setAccessibilityMode(newMode);
    localStorage.setItem("accessibilityMode", newMode.toString());
  };

  const recognitionRef = useRef(null);
  const [shouldContinueListening, setShouldContinueListening] = useState(true);

  const clickButtonByText = (text) => {
    const buttons = document.querySelectorAll("button");
    for (let btn of buttons) {
      if (btn.innerText.trim().toLowerCase() === text.toLowerCase()) {
        btn.click();

        // ✅ Stop listening after clicking button
        setShouldContinueListening(false);
        if (recognitionRef.current) {
          recognitionRef.current.onend = null; // prevent auto-restart
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
        return true;
      }
    }
    return false;
  };

  const startListening = () => {
    const recognition = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("Listening...");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim().toLowerCase();
      console.log("User said:", transcript);

      let matched = false;

      if (transcript.includes("english") || transcript.includes("इंग्लिश")) {
        matched = clickButtonByText("English");
      } else if (transcript.includes("hindi") || transcript.includes("हिंदी")) {
        matched = clickButtonByText("हिन्दी");
      } else if (
        transcript.includes("marathi") ||
        transcript.includes("मराठी")
      ) {
        matched = clickButtonByText("मराठी");
      } else if (
        transcript.includes("gujarati") ||
        transcript.includes("ગુજરાતી")
      ) {
        matched = clickButtonByText("ગુજરાતી");
      }

      if (matched) return;

      // If no match
      const utterance = new SpeechSynthesisUtterance(
        "Your voice was not clear, please repeat again."
      );
      utterance.voice = window.speechSynthesis.getVoices()[0];
      utterance.onend = () => {
        if (shouldContinueListening && recognitionRef.current) {
          recognitionRef.current.start();
        }
      };
      window.speechSynthesis.speak(utterance);
    };

    recognition.onend = () => {
      if (shouldContinueListening && !window.speechSynthesis.speaking) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition; // ✅ save to ref
    recognition.start();
  };
  // 🔊 Read Page Aloud + then Listen
  const readPageAloud = () => {
    window.speechSynthesis.cancel();

    const texts = [
      "Welcome to Terra Cart!",
      "Please select your language.",
      "Option 1: English",
      "Option 2: हिंदी",
      "Option 3: मराठी",
      "Option 4: ગુજરાતી",
      "Now please say your choice.",
    ];

    const voices = window.speechSynthesis.getVoices();

    // 🔹 Fix a single voice
    let fixedVoice =
      voices.find((v) => v.name.includes("Google हिन्दी")) ||
      voices.find((v) => v.name.includes("Google US English")) ||
      voices[0];

    const speakWithPause = (index) => {
      if (index >= texts.length) {
        // ✅ Start listening once all text is spoken
        startListening();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(texts[index]);
      utterance.voice = fixedVoice;
      utterance.lang = fixedVoice?.lang || "en-US";
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onend = () => {
        setTimeout(() => speakWithPause(index + 1), 50); // pause
      };

      window.speechSynthesis.speak(utterance);
    };

    speakWithPause(0);
  };

  return (
    <div className={accessibilityMode ? "bg-white" : "bg-gray-100"}>
      <Header showNavigationTabs={false} isFixed={false} />

      <div className="relative">
        <div className="absolute inset-0 bg-white" />

        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-5rem)] px-4 py-4 sm:py-6 md:py-8">
          {/* Title box */}
          <div className="mb-8 sm:mb-12 md:mb-16">
            <div
              className={`
                rounded-lg py-1 px-1 text-center
                ${accessibilityMode ? "border-2 border-orange-800" : ""}
              `}
            >
              <h1
                className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold leading-snug"
                style={{ color: "#1B1212" }}
              >
                <span className="block">Welcome&nbsp;!</span>
              </h1>
            </div>
          </div>

          {/* Loading Indicator or Language Selection */}
          {isLoading ? (
             <div className="flex flex-col items-center justify-center">
               <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
               <p className="text-lg font-semibold text-gray-700">Loading...</p>
             </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="w-full max-w-md"
            >
              <p
                className={`
                  text-center font-semibold mb-6 sm:mb-8 md:mb-10
                  ${
                    accessibilityMode
                      ? "text-xl sm:text-2xl md:text-3xl font-bold bg-white px-3 sm:px-4 py-2 rounded-lg"
                      : "text-base sm:text-lg md:text-xl"
                  }
                `}
                style={{ color: "#1B1212" }}
              >
                Please select your preferred language
              </p>
              <div className="grid grid-cols-1 gap-4">
                {languages.map((lang) => (
                  <motion.button
                    key={lang.code}
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleLanguageSelect(lang.code)}
                    className={`
                      py-4 sm:py-5 md:py-6 px-6 sm:px-8 rounded-lg font-semibold
                      text-lg sm:text-xl md:text-2xl transition-all duration-200
                      text-white shadow-lg hover:shadow-xl active:scale-95 border-2
                      ${
                        accessibilityMode
                          ? "border-gray-800 bg-gray-800"
                          : "border-transparent hover:border-white/30"
                      }
                    `}
                    style={{
                      backgroundColor: accessibilityMode ? undefined : "#FC8019",
                    }}
                  >
                    {lang.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
      
      {/* Existing floating button code ... */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={readPageAloud}
        className="fixed rounded-full shadow-lg bg-orange-600 text-white hover:bg-orange-700 focus:outline-none blind-eye-btn"
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
        aria-label="Blind Support - Read Page Aloud"
      >
        <img
          src={blindEyeIcon}
          alt="Blind Support"
          width="24"
          height="24"
          style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
        />
      </motion.button>
    </div>
  );
}
