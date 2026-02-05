import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import io from "socket.io-client";

import Header from "../components/Header";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import blindEyeIcon from "../assets/images/blind-eye-sign.png";
import translations from "../data/translations/secondpage.json";
import useVoiceAssistant from "../utils/useVoiceAssistant";
import OrderTypeSelector from "../components/OrderTypeSelector";
import { getNearbyCarts, getAvailableCarts, getCartById } from "../services/cartApi";
import "./SecondPage.css";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

// Validate API URL in production
if (
  import.meta.env.PROD &&
  (!import.meta.env.VITE_NODE_API_URL || nodeApi.includes("localhost"))
) {
  console.error(
    "[SecondPage] ⚠️ WARNING: VITE_NODE_API_URL is not set correctly in production!",
    "Current value:",
    import.meta.env.VITE_NODE_API_URL || "undefined"
  );
}

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
  const [language, setLanguage] = useState(localStorage.getItem("language") || "en");

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      setLanguage(localStorage.getItem("language") || "en");
    };
    
    window.addEventListener("storage", handleLanguageChange);
    window.addEventListener("language-change", handleLanguageChange);
    
    return () => {
      window.removeEventListener("storage", handleLanguageChange);
      window.removeEventListener("language-change", handleLanguageChange);
    };
  }, []);
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
  
  // Order type and location state for PICKUP/DELIVERY
  const [orderType, setOrderType] = useState(null); // PICKUP or DELIVERY
  const [customerLocation, setCustomerLocation] = useState(null);
  const [selectedCart, setSelectedCart] = useState(null);
  const [nearbyCarts, setNearbyCarts] = useState([]);
  const [loadingCarts, setLoadingCarts] = useState(false);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [showWaitlistInfoModal, setShowWaitlistInfoModal] = useState(false);
  const [waitlistGuestName, setWaitlistGuestName] = useState("");
  const [waitlistPartySize, setWaitlistPartySize] = useState("1");
  const [takeawayOnly, setTakeawayOnly] = useState(
    () => localStorage.getItem("terra_takeaway_only") === "true"
  );

  // Check if this is a normal link (not from QR scan)
  // Pickup/Delivery should only show on normal links, not QR scans
  // CRITICAL: Use useState and useEffect to make it reactive to localStorage changes
  // This ensures it updates when QR scan sets terra_scanToken or terra_selectedTable
  const [isNormalLink, setIsNormalLink] = useState(() => {
    const hasTakeawayQR = localStorage.getItem("terra_takeaway_only") === "true";
    const hasScanToken = localStorage.getItem("terra_scanToken");
    const hasTableInfo = localStorage.getItem("terra_selectedTable");
    
    // Normal link = no QR scan indicators
    return !hasTakeawayQR && !hasScanToken && !hasTableInfo;
  });

  // Update isNormalLink when localStorage values, tableInfo state, or URL change (e.g., after QR scan)
  // CRITICAL: URL with ?table= means table takeaway context – not normal link (don't auto-show form)
  useEffect(() => {
    const checkNormalLink = () => {
      const hasTakeawayQR = localStorage.getItem("terra_takeaway_only") === "true";
      const hasScanToken = localStorage.getItem("terra_scanToken");
      const hasTableInfo = localStorage.getItem("terra_selectedTable") || tableInfo;
      const hasTableInUrl = !!(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("table"));
      const isNormal = !hasTakeawayQR && !hasScanToken && !hasTableInfo && !hasTableInUrl;
      setIsNormalLink(isNormal);
    };

    // Check immediately
    checkNormalLink();

    // Listen for storage events (when localStorage changes from other tabs/windows)
    window.addEventListener("storage", checkNormalLink);

    // Also check periodically in case localStorage was set after component mount
    // This handles the case where Landing.jsx sets values after SecondPage mounts
    // CRITICAL: On render deployment, there might be timing issues, so check more frequently initially
    const interval = setInterval(checkNormalLink, 100);

    return () => {
      window.removeEventListener("storage", checkNormalLink);
      clearInterval(interval);
    };
  }, [tableInfo]); // Also react to tableInfo state changes

  // Effect to clear dine-in order data if accessed without table info (normal link)
  useEffect(() => {
    // Only clear dine-in data, preserve takeaway data
    if (isNormalLink) {
      console.log("[SecondPage] Normal link detected - clearing dine-in order data");
      clearOldOrderData();
      // Also clear table-related data
      localStorage.removeItem("terra_selectedTable");
      localStorage.removeItem("terra_scanToken");
      localStorage.removeItem("terra_sessionToken");
      localStorage.removeItem("terra_waitToken");
      // Update state
      setTableInfo(null);
      setSessionToken(null);
      setWaitlistToken(null);
    }
  }, [isNormalLink]);

  // Track if user manually closed the modal
  const hasUserClosedModal = useRef(false);

  // Auto-show customer info modal for normal links (Pickup/Delivery selection)
  // This ensures users see Pickup/Delivery options immediately when accessing via normal link
  // BUT only if they haven't manually closed it
  useEffect(() => {
    if (isNormalLink && !showCustomerInfoModal && !hasUserClosedModal.current) {
      console.log("[SecondPage] Normal link detected - auto-showing customer info modal");
      setShowCustomerInfoModal(true);
    }
  }, [isNormalLink, showCustomerInfoModal]);


  // Fetch carts when order type and location are available
  useEffect(() => {
    if (!orderType || !customerLocation) {
      setNearbyCarts([]);
      return;
    }

    // For DELIVERY, require GPS coordinates or pin code - don't show carts until location is available
    if (orderType === "DELIVERY" && (!customerLocation.latitude || !customerLocation.longitude)) {
      // If manual address is provided, check if it's a pin code
      if (customerLocation.address && customerLocation.address.trim()) {
        const addressValue = customerLocation.address.trim();
        const isPinCode = /^\d{6}$/.test(addressValue);
        
        setLoadingCarts(true);
        
        // If it's a pin code, fetch carts directly by pin code
        if (isPinCode) {
          console.log("[SecondPage] Fetching carts by pin code:", addressValue);
          getNearbyCarts(null, null, orderType, addressValue)
            .then((carts) => {
              // All carts returned are already filtered by pin code match
              setNearbyCarts(carts);
              setLoadingCarts(false);
              // Auto-select first available cart if none selected
              if (carts.length > 0 && !selectedCart) {
                setSelectedCart(carts[0]);
              }
            })
            .catch((error) => {
              console.error("[SecondPage] Error fetching carts by pin code:", error);
              setLoadingCarts(false);
              setNearbyCarts([]);
            });
        } else {
          // Not a pin code, try to geocode the address
          geocodeAddress(customerLocation.address)
            .then((coords) => {
              if (coords) {
                // Update location with coordinates
                const updatedLocation = {
                  ...customerLocation,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                };
                setCustomerLocation(updatedLocation);
                // Fetch carts with coordinates
                return getNearbyCarts(
                  coords.latitude,
                  coords.longitude,
                  orderType
                );
              } else {
                setLoadingCarts(false);
                setNearbyCarts([]);
                return Promise.resolve([]);
              }
            })
            .then((carts) => {
              // Filter to only show carts that can deliver (within range)
              const deliverableCarts = carts.filter((c) => c.canDeliver);
              setNearbyCarts(deliverableCarts);
              setLoadingCarts(false);
              // Auto-select first available cart if none selected
              if (deliverableCarts.length > 0 && !selectedCart) {
                setSelectedCart(deliverableCarts[0]);
              }
            })
            .catch((error) => {
              console.error("[SecondPage] Error geocoding or fetching carts:", error);
              setLoadingCarts(false);
              setNearbyCarts([]);
            });
        }
      } else {
        // No address provided yet - don't show any carts
        setNearbyCarts([]);
      }
      return;
    }

    setLoadingCarts(true);

    // If location has GPS coordinates, use location-based fetching
    if (customerLocation.latitude && customerLocation.longitude) {
      getNearbyCarts(
        customerLocation.latitude,
        customerLocation.longitude,
        orderType
      )
        .then((carts) => {
          // For DELIVERY, only show carts that can deliver (within range)
          // For PICKUP, show all carts with pickup enabled
          const filteredCarts = orderType === "DELIVERY" 
            ? carts.filter((c) => c.canDeliver)
            : carts.filter((c) => c.canPickup);
          
          setNearbyCarts(filteredCarts);
          setLoadingCarts(false);
          // Auto-select first available cart if none selected
          if (filteredCarts.length > 0 && !selectedCart) {
            setSelectedCart(filteredCarts[0]);
          }
        })
        .catch((error) => {
          console.warn("[SecondPage] Error fetching nearby carts:", error.message || error);
          setNearbyCarts([]);
          setLoadingCarts(false);
        });
    } else {
      // Manual address entered (no GPS) - only for PICKUP
      // For DELIVERY, this case is handled above
      if (orderType === "PICKUP") {
        getAvailableCarts(orderType)
          .then((carts) => {
            const pickupCarts = carts.filter((c) => c.canPickup);
            setNearbyCarts(pickupCarts);
            setLoadingCarts(false);
            // Auto-select first available cart if none selected
            if (pickupCarts.length > 0 && !selectedCart) {
              setSelectedCart(pickupCarts[0]);
            }
          })
          .catch((error) => {
            console.warn("[SecondPage] Error fetching available carts:", error.message || error);
            setNearbyCarts([]);
            setLoadingCarts(false);
          });
      } else {
        setNearbyCarts([]);
        setLoadingCarts(false);
      }
    }
  }, [orderType, customerLocation, selectedCart]);

  // Geocode function to convert address or pin code to coordinates
  const geocodeAddress = async (addressOrPinCode) => {
    try {
      // If it's a 6-digit number, treat it as pin code (India format)
      const isPinCode = /^\d{6}$/.test(addressOrPinCode.trim());
      let searchQuery = addressOrPinCode;
      
      if (isPinCode) {
        // For pin code, add "India" to improve search accuracy
        searchQuery = `${addressOrPinCode}, India`;
      }
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&countrycodes=in`,
        {
          headers: {
            'User-Agent': 'TerraCart-Ordering-System'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error("Failed to geocode address");
      }
      
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (error) {
      console.error("[SecondPage] Geocoding error:", error);
      return null;
    }
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100; // Round to 2 decimal places
  };

  // Check if customer is within delivery range
  const checkDeliveryAvailability = (cart, customerLat, customerLon) => {
    if (!cart || !cart.coordinates?.latitude || !cart.coordinates?.longitude) {
      return { available: false, distance: null, reason: "Cart location not configured" };
    }
    
    if (!customerLat || !customerLon) {
      return { available: false, distance: null, reason: "Customer location not available" };
    }

    if (!cart.deliveryEnabled) {
      return { available: false, distance: null, reason: "Delivery not enabled for this store" };
    }

    const distance = calculateDistance(
      customerLat,
      customerLon,
      cart.coordinates.latitude,
      cart.coordinates.longitude
    );
    
    const maxRadius = cart.deliveryRadius || 5;
    const isWithinRange = distance <= maxRadius;

    return {
      available: isWithinRange,
      distance: distance,
      maxRadius: maxRadius,
      reason: isWithinRange ? null : `You are ${distance.toFixed(2)} km away, but maximum delivery radius is ${maxRadius} km`,
    };
  };

  // Handler for cart selection
  // Note: For DELIVERY, carts are already filtered to only show those within range
  const handleCartChange = useCallback((cart) => {
    setSelectedCart(cart);
  }, []);

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
        // CRITICAL: If table is AVAILABLE, never show waitlist modal
        const tableStatus = table.status || "AVAILABLE";
        const currentWaitlistToken = localStorage.getItem("terra_waitToken");
        
        if (tableStatus === "AVAILABLE") {
          // Table is available - hide waitlist modal and clear waitlist state
          setIsTableOccupied(false);
          setShowWaitlistModal(false);
          if (currentWaitlistToken) {
            localStorage.removeItem("terra_waitToken");
            setWaitlistToken(null);
            setWaitlistInfo(null);
          }
          console.log(
            "[SecondPage] Table is AVAILABLE on mount - hiding waitlist modal"
          );
        } else if (
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

            // Log for debugging
            if (import.meta.env.DEV) {
              console.log("[SecondPage] Refreshing table status:", {
                nodeApi,
                slug,
                url,
              });
            }

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
                  // CRITICAL: Preserve capacity from payload to ensure dynamic seat display linked with cart admin
                  capacity: payload.table.capacity || payload.table.originalCapacity || table.capacity || table.originalCapacity || null,
                  originalCapacity: payload.table.originalCapacity || table.originalCapacity || null,
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

                // CRITICAL: Check refreshed status and update waitlist modal accordingly
                // This ensures proper sync between admin table management and customer frontend
                if (refreshedStatus === "AVAILABLE") {
                  // Table is available - hide waitlist modal and clear waitlist state
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
                    "[SecondPage] Table is AVAILABLE (from refresh) - cleared all order data and waitlist state"
                  );
                } else if (
                  !isTakeaway &&
                  refreshedStatus !== "AVAILABLE" &&
                  !waitlistToken
                ) {
                  // Table is occupied and user is not in waitlist - show modal
                  setIsTableOccupied(true);
                  setShowWaitlistModal(true);
                  console.log(
                    "[SecondPage] Table is OCCUPIED (from refresh) - showing waitlist modal"
                  );
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
              
              // CRITICAL: Check the actual table status from the response
              // Even if we get 423, the table might actually be AVAILABLE (edge case)
              const lockedTableStatus = lockedTable?.status || "OCCUPIED";
              
              // CRITICAL: Preserve capacity when storing locked table
              const lockedTableWithCapacity = {
                ...lockedTable,
                capacity: lockedTable.capacity || lockedTable.originalCapacity || table.capacity || table.originalCapacity || null,
                originalCapacity: lockedTable.originalCapacity || table.originalCapacity || null,
              };
              
              setTableInfo(lockedTableWithCapacity);
              localStorage.setItem(
                "terra_selectedTable",
                JSON.stringify(lockedTableWithCapacity)
              );
              
              // CRITICAL: Only show waitlist if table is actually OCCUPIED, not AVAILABLE
              // This ensures proper sync between admin table management and customer frontend
              if (lockedTableStatus === "AVAILABLE") {
                // Table is actually available despite 423 response - hide waitlist
                setIsTableOccupied(false);
                setShowWaitlistModal(false);
                localStorage.removeItem("terra_waitToken");
                setWaitlistToken(null);
                setWaitlistInfo(null);
                console.log(
                  "[SecondPage] Table is AVAILABLE (despite 423 response) - hiding waitlist modal"
                );
              } else {
                // Table is actually occupied - show waitlist modal
                setIsTableOccupied(true);
                // CRITICAL: Always show waitlist modal for 423 responses if user is not in waitlist
                // BUT ONLY for DINE_IN orders
                const currentWaitlistToken =
                  localStorage.getItem("terra_waitToken");
                if (!isTakeaway && !currentWaitlistToken) {
                  console.log(
                    "[SecondPage] Table is locked (423) and OCCUPIED - showing waitlist modal (this is expected behavior)"
                  );
                  setShowWaitlistModal(true);
                } else if (isTakeaway) {
                  setIsTableOccupied(false);
                  setShowWaitlistModal(false);
                }
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
            // CRITICAL: If table is AVAILABLE, never show waitlist modal
            const currentServiceType =
              localStorage.getItem("terra_serviceType") || "DINE_IN";
            const isTakeaway = currentServiceType === "TAKEAWAY";
            const tableStatus = table.status || "AVAILABLE";
            
            if (tableStatus === "AVAILABLE") {
              // Table is available - hide waitlist modal
              setIsTableOccupied(false);
              setShowWaitlistModal(false);
              if (waitlistToken) {
                localStorage.removeItem("terra_waitToken");
                setWaitlistToken(null);
                setWaitlistInfo(null);
              }
              console.log(
                "[SecondPage] Table is AVAILABLE (refresh failed) - hiding waitlist modal"
              );
            } else if (!isTakeaway && tableStatus !== "AVAILABLE" && !waitlistToken) {
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
        
        // CRITICAL: Set up periodic refresh as fallback ONLY if socket is disconnected
        // Primary sync method is socket connection (real-time), periodic refresh is fallback
        // This is more efficient for Vercel deployments and reduces server load
        // Note: Socket connection status is tracked via window.__tableStatusSocketConnected
        // which is updated by the socket useEffect below
        let refreshInterval = null;
        
        // Track socket connection status for fallback refresh
        const checkSocketAndRefresh = () => {
          // Only use periodic refresh if socket is not connected (fallback mechanism)
          // Socket connection is handled in separate useEffect below
          const socketConnected = (typeof window !== "undefined" && window.__tableStatusSocketConnected) || false;
          if (!socketConnected) {
            // Only refresh if user doesn't have active order (to avoid disrupting their session)
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
            
            if (!hasActiveOrder) {
              console.log("[SecondPage] Socket disconnected - using fallback refresh");
              refreshTableStatus();
            }
          }
        };
        
        // Set up periodic refresh with longer interval (30 seconds) as fallback
        // Only runs if socket is disconnected - socket is primary sync method
        // This reduces load on Vercel and backend servers
        refreshInterval = setInterval(checkSocketAndRefresh, 30000); // Refresh every 30 seconds as fallback
        
        // Initialize socket connection status (will be updated by socket useEffect)
        if (typeof window !== "undefined") {
          window.__tableStatusSocketConnected = false;
        }
        
        return () => {
          clearTimeout(timeoutId);
          if (refreshInterval) {
            clearInterval(refreshInterval);
          }
        };
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
        {
          newStatus: updatedTable.status,
          previousStatus: tableInfo.status,
          tableId: updatedTableId,
          tableNumber: updatedTable.number,
        }
      );

      // Update table info with new status
      const updatedTableInfo = {
        ...tableInfo,
        status: updatedTable.status,
        currentOrder: updatedTable.currentOrder || null,
        sessionToken: updatedTable.sessionToken || tableInfo.sessionToken,
        // CRITICAL: Preserve capacity from updated table data to ensure dynamic seat display linked with cart admin
        capacity: updatedTable.capacity || updatedTable.originalCapacity || tableInfo.capacity || tableInfo.originalCapacity || null,
        originalCapacity: updatedTable.originalCapacity || tableInfo.originalCapacity || null,
      };
      setTableInfo(updatedTableInfo);
      // Update localStorage to persist the change
      localStorage.setItem(
        "terra_selectedTable",
        JSON.stringify(updatedTableInfo)
      );

      // CRITICAL: If table becomes AVAILABLE, clear waitlist state and hide modal
      // Also clear all previous customer order data to prevent showing old orders
      // This ensures proper sync between admin table management and customer frontend
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
        // BUT only if user doesn't have an active order and it's not a TAKEAWAY order
        const currentServiceType =
          localStorage.getItem("terra_serviceType") || "DINE_IN";
        const isTakeaway = currentServiceType === "TAKEAWAY";
        
        if (!isTakeaway) {
          const currentWaitlistToken = localStorage.getItem("terra_waitToken");
          if (!currentWaitlistToken) {
            setIsTableOccupied(true);
            setShowWaitlistModal(true);
            console.log(
              "[SecondPage] Table is OCCUPIED via socket - showing waitlist modal"
            );
          }
        } else {
          // TAKEAWAY orders should never show waitlist
          setIsTableOccupied(false);
          setShowWaitlistModal(false);
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
        // Mark socket as connected for fallback refresh logic
        if (typeof window !== "undefined") {
          window.__tableStatusSocketConnected = true;
        }
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
        // Mark socket as disconnected for fallback refresh logic
        if (typeof window !== "undefined") {
          window.__tableStatusSocketConnected = false;
        }
      });

      tableStatusSocket.on("disconnect", (reason) => {
        if (reason !== "io client disconnect") {
          console.log("[SecondPage] Table status socket disconnected:", reason);
        }
        // Mark socket as disconnected for fallback refresh logic
        if (typeof window !== "undefined") {
          window.__tableStatusSocketConnected = false;
        }
      });

      tableStatusSocket.on("table:status:updated", handleTableStatusUpdated);
    } catch (err) {
      console.warn("[SecondPage] Failed to create table status socket:", err);
    }

    // Cleanup on unmount – only disconnect if already connected to avoid "closed before established" warning
    return () => {
      if (tableStatusSocket) {
        tableStatusSocket.off("table:status:updated", handleTableStatusUpdated);
        if (tableStatusSocket.connected) tableStatusSocket.disconnect();
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

        // Validate and encode slug
        if (!slug || slug.trim().length < 5) {
          console.error("[SecondPage] Invalid slug:", slug);
          alert("Invalid table QR code. Please scan the table QR code again.");
          return;
        }
        
        const url = `${nodeApi}/api/tables/lookup/${encodeURIComponent(slug.trim())}${
          params.toString() ? `?${params.toString()}` : ""
        }`;

        // Log API URL and slug for debugging (only in development)
        if (import.meta.env.DEV) {
          console.log("[SecondPage] Table lookup:", {
            nodeApi,
            slug,
            url,
            storedTable: table,
          });
        }

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

          // Log additional info for debugging
          console.error("[SecondPage] Table lookup 404:", {
            url,
            slug,
            nodeApi,
            response: errorPayload,
          });

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
        // CRITICAL: Ensure capacity is preserved when setting table info
        // This ensures the UI shows the actual capacity from cart admin, not a hardcoded value
        const tableDataWithCapacity = {
          ...tableData,
          capacity: tableData.capacity || tableData.originalCapacity || tableInfo?.capacity || tableInfo?.originalCapacity || null,
          originalCapacity: tableData.originalCapacity || tableInfo?.originalCapacity || null,
        };
        setTableInfo(tableDataWithCapacity);
        localStorage.setItem("terra_selectedTable", JSON.stringify(tableDataWithCapacity));
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
    // Clear waitlist state for takeaway
    localStorage.removeItem("terra_waitToken");
    setWaitlistToken(null);
    setWaitlistInfo(null);
    setShowWaitlistModal(false);
    setIsTableOccupied(false);
    localStorage.setItem("terra_serviceType", "TAKEAWAY");

    // Table takeaway: skip Customer Information form and go straight to menu
    // Detect table context from localStorage/state OR from URL (?table=) so it works when secondpage?table=xxx
    const hasTableInStorageOrState =
      !!localStorage.getItem("terra_scanToken") ||
      !!localStorage.getItem("terra_selectedTable") ||
      !!tableInfo;
    const hasTableInUrl = !!(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("table"));
    const isTakeawayOnlyQR = localStorage.getItem("terra_takeaway_only") === "true";
    const isTableTakeaway = (hasTableInStorageOrState || hasTableInUrl) && !isTakeawayOnlyQR;

    if (isTableTakeaway) {
      const takeawaySessionToken = `TAKEAWAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("terra_takeaway_sessionToken", takeawaySessionToken);
      localStorage.removeItem("terra_orderId_TAKEAWAY");
      localStorage.removeItem("terra_cart_TAKEAWAY");
      localStorage.removeItem("terra_orderStatus_TAKEAWAY");
      localStorage.removeItem("terra_orderStatusUpdatedAt_TAKEAWAY");
      localStorage.removeItem("terra_orderType");
      navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
      return;
    }

    // Normal link (pickup/delivery) or takeaway-only QR: show Customer Information modal – do not touch
    setShowCustomerInfoModal(true);
  }, [navigate, tableInfo]);

  // Handle customer info modal submit for takeaway orders (fields OPTIONAL)
  // Works for both regular takeaway and takeaway-only QR flows
  const handleCustomerInfoSubmit = useCallback(async () => {
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

    // Save customer info to localStorage (OPTIONAL for regular takeaway, REQUIRED for PICKUP/DELIVERY)
    // Enforce validation for ALL takeaway/pickup/delivery orders
    // Use state values directly (they are synced with inputs)
    const nameVal = customerName?.trim();
    const mobileVal = customerMobile?.trim();

    if (!nameVal || !mobileVal) {
      alert("Please enter both Name and Mobile Number to continue.");
      return;
    }

    // STRICT VALIDATION: Name must contain only letters and be at least 2 chars
    const nameRegex = /^[a-zA-Z\s]{2,}$/;
    if (!nameRegex.test(nameVal)) {
      alert("Please enter a valid Name (letters only).");
      return;
    }

    // STRICT VALIDATION: Mobile must be 10 digits
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobileVal)) {
      alert("Please enter a valid 10-digit Mobile Number.");
      return;
    }

    // STRICT VALIDATION: Email format (if provided)
    if (customerEmail?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail.trim())) {
        alert("Please enter a valid Email Address.");
        return;
      }
    }

    // Save strictly validated data
    localStorage.setItem("terra_takeaway_customerName", nameVal);
    localStorage.setItem("terra_takeaway_customerMobile", mobileVal);
    
    // Email is optional
    if (customerEmail && customerEmail.trim()) {
      localStorage.setItem("terra_takeaway_customerEmail", customerEmail.trim());
    } else {
      localStorage.removeItem("terra_takeaway_customerEmail");
    }
    if (customerEmail && customerEmail.trim()) {
      localStorage.setItem(
        "terra_takeaway_customerEmail",
        customerEmail.trim()
      );
    } else {
      localStorage.removeItem("terra_takeaway_customerEmail");
    }

    // Check if this is a normal link (not from QR scan)
    const hasTakeawayQR = localStorage.getItem("terra_takeaway_only") === "true";
    const hasScanToken = localStorage.getItem("terra_scanToken");
    const hasTableInfo = localStorage.getItem("terra_selectedTable");
    const isNormalLinkCheck = !hasTakeawayQR && !hasScanToken && !hasTableInfo;



    // Save order type and location for PICKUP/DELIVERY (only for normal links)
    if (isNormalLinkCheck) {
      if (orderType) {
        localStorage.setItem("terra_orderType", orderType);
      } else {
        // If normal link but no specific order type selected (shouldn't happen with UI enforcement, but safe fallback)
        localStorage.removeItem("terra_orderType");
      }
    } else {
      // CLEAR order type for QR scans (Takeaway QR / Restaurant Counter)
      // This ensures they are treated as standard TAKEAWAY, not PICKUP or DELIVERY
      localStorage.removeItem("terra_orderType");
    }

    if (isNormalLinkCheck && customerLocation) {
      localStorage.setItem("terra_customerLocation", JSON.stringify(customerLocation));
    } else {
      localStorage.removeItem("terra_customerLocation");
    }

    if (isNormalLinkCheck && selectedCart?._id) {
      localStorage.setItem("terra_selectedCartId", selectedCart._id);
    } else {
      localStorage.removeItem("terra_selectedCartId");
    }

    if (isNormalLinkCheck && specialInstructions && specialInstructions.trim()) {
      localStorage.setItem("terra_specialInstructions", specialInstructions.trim());
    } else {
      localStorage.removeItem("terra_specialInstructions");
    }

    // VALIDATION: Check delivery availability for DELIVERY orders
    if (isNormalLinkCheck && orderType === "DELIVERY") {
      // Validate that cart is selected
      if (!selectedCart) {
        alert("Please select a store for delivery.");
        return;
      }

      // Validate that customer location is available
      if (!customerLocation || !customerLocation.address) {
        alert("Please provide your delivery address.");
        return;
      }

      // If coordinates are not available, try to geocode the address
      let customerLat = customerLocation.latitude;
      let customerLon = customerLocation.longitude;

      if (!customerLat || !customerLon) {
        if (!customerLocation.address) {
          alert("Please provide a valid delivery address.");
          return;
        }
        
        // Try to geocode the address
        const coords = await geocodeAddress(customerLocation.address);
        if (!coords) {
          alert("Could not determine the location of your address. Please use 'Use Current Location' or enter a more specific address.");
          return;
        }
        customerLat = coords.latitude;
        customerLon = coords.longitude;
      }

      // Check delivery availability
      const deliveryCheck = checkDeliveryAvailability(
        selectedCart,
        customerLat,
        customerLon
      );

      if (!deliveryCheck.available) {
        if (deliveryCheck.distance !== null) {
          alert(
            `❌ Delivery not available!\n\n${deliveryCheck.reason}\n\nPlease select a different store or choose Pickup instead.`
          );
        } else {
          alert(
            `❌ Delivery not available!\n\n${deliveryCheck.reason}\n\nPlease select a different store or choose Pickup instead.`
          );
        }
        return;
      }

      // Update customer location with coordinates if they were geocoded
      if (customerLocation.latitude !== customerLat || customerLocation.longitude !== customerLon) {
        setCustomerLocation({
          ...customerLocation,
          latitude: customerLat,
          longitude: customerLon,
        });
        localStorage.setItem("terra_customerLocation", JSON.stringify({
          ...customerLocation,
          latitude: customerLat,
          longitude: customerLon,
        }));
      }
    }

    // Save takeaway session token
    localStorage.setItem("terra_takeaway_sessionToken", takeawaySessionToken);

    // Set serviceType based on order type (only for normal links)
    if (isNormalLinkCheck && orderType === "PICKUP") {
      localStorage.setItem("terra_serviceType", "PICKUP");
    } else if (isNormalLinkCheck && orderType === "DELIVERY") {
      localStorage.setItem("terra_serviceType", "DELIVERY");
    } else {
      // Regular takeaway (for QR scans or no order type)
      localStorage.setItem("terra_serviceType", "TAKEAWAY");
    }

    // CRITICAL: Clear waitlist state for takeaway orders
    localStorage.removeItem("terra_waitToken");
    setWaitlistToken(null);
    setWaitlistInfo(null);
    setShowWaitlistModal(false);
    setIsTableOccupied(false);

    // Close modal and navigate to menu
    setShowCustomerInfoModal(false);
    navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
  }, [customerName, customerMobile, customerEmail, navigate, orderType, selectedCart, customerLocation]);

  // Handle skip/cancel customer info
  const handleSkipCustomerInfo = useCallback(() => {
    // Mark that user manually closed the modal to prevent auto-reopen
    hasUserClosedModal.current = true;
    
    // Just close the modal - do not navigate to menu
    // User must fill details to proceed
    setShowCustomerInfoModal(false);
    
    // Optionally clear any partial input if needed, but keeping it might be better UX
    // For now, just closing is sufficient to block access
  }, []);

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
    // CRITICAL: Use capacity or originalCapacity from tableInfo to ensure it's linked with cart admin table seats
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
            {/* Dine-in button: Show for table QR (?table= or stored), not for normal links or takeaway-only */}
            {(() => {
              const hasTakeawayQR = localStorage.getItem("terra_takeaway_only") === "true";
              const hasScanToken = localStorage.getItem("terra_scanToken");
              const hasTableInfo = localStorage.getItem("terra_selectedTable") || tableInfo;
              const hasTableInUrl = !!(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("table"));
              const isNormal = !hasTakeawayQR && !hasScanToken && !hasTableInfo && !hasTableInUrl;
              return !takeawayOnly && !isNormal;
            })() && (
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

            {/* Takeaway button: Show for table QR (?table=), takeaway QR, or when terra_scanToken/terra_selectedTable set */}
            {(() => {
              const hasTakeawayQR = localStorage.getItem("terra_takeaway_only") === "true";
              const hasScanToken = localStorage.getItem("terra_scanToken");
              const hasTableInfo = localStorage.getItem("terra_selectedTable") || tableInfo;
              const hasTableInUrl = !!(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("table"));
              const isNormal = !hasTakeawayQR && !hasScanToken && !hasTableInfo && !hasTableInUrl;
              return !isNormal;
            })() && (
              <button
                onClick={startTakeawayFlow}
                className={`nav-btn ${
                  accessibilityMode ? "nav-btn-accessibility" : "nav-btn-normal"
                }`}
              >
                {t("takeAway")}
              </button>
            )}
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
                      max={tableInfo?.capacity || tableInfo?.originalCapacity || undefined}
                      required
                    />
                    {(tableInfo?.capacity || tableInfo?.originalCapacity) && (
                      <p
                        style={{
                          marginTop: "4px",
                          fontSize: "0.75rem",
                          color: "#666",
                        }}
                      >
                        Available Seats: <strong>{tableInfo.capacity || tableInfo.originalCapacity || "N/A"}</strong>
                        {waitlistPartySize &&
                          parseInt(waitlistPartySize, 10) >
                            (tableInfo.capacity || tableInfo.originalCapacity) && (
                            <span
                              style={{
                                display: "block",
                                marginTop: "4px",
                                color: "#ef4444",
                                fontWeight: "500",
                              }}
                            >
                              ⚠️ Maximum capacity is {tableInfo.capacity || tableInfo.originalCapacity}{" "}
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

            {/* Customer Info Modal for Takeaway Orders */}
        {showCustomerInfoModal && (
          <div
            className="customer-info-modal-overlay"
            onClick={(e) => {
              // Prevent closing by clicking outside for normal links (required form)
              if (e.target === e.currentTarget && !isNormalLink) {
                handleSkipCustomerInfo();
              }
            }}
          >
            <div
              className="customer-info-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="customer-info-modal-header">
                <h3>{t("customerInfoTitle") || "Customer Information (Required)"}</h3>
                {/* Only show close button for QR scan takeaway (not normal links) */}
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
                    color: "#d97706",
                    fontSize: "0.9rem",
                    fontWeight: "600",
                  }}
                >
                  {isNormalLink && orderType 
                        ? (orderType === "PICKUP" 
                            ? (t("customerInfoDescPickup") || "Please provide your details for the pickup order. Name and mobile number are required.") 
                            : (t("customerInfoDescDelivery") || "Please provide your details for the delivery order. Name and mobile number are required."))
                        : (t("customerInfoDescTakeaway") || "Please provide your details for the takeaway order. Name and mobile number are required.")}
                </p>

                {/* Order Type Selector for PICKUP/DELIVERY - Only show on normal links (not QR scans) */}
                {isNormalLink && (
                  <div className="mb-4">
                    <OrderTypeSelector
                      selectedType={orderType}
                      onTypeChange={setOrderType}
                      customerLocation={customerLocation}
                      onLocationChange={setCustomerLocation}
                      selectedCart={selectedCart}
                      onCartChange={handleCartChange}
                      nearbyCarts={nearbyCarts}
                      loading={loadingCarts}
                      texts={{
                        title: t("chooseOrderType"),
                        pickupOption: t("pickupOption"),
                        pickupDesc: t("pickupDesc"),
                        deliveryOption: t("deliveryOption"),
                        deliveryDesc: t("deliveryDesc")
                      }}
                    />
                  </div>
                )}

                <div className="customer-info-form">
                  <div className="customer-info-field">
                    <label htmlFor="customerName">
                      {t("nameLabel") || "Name (Required)"}
                    </label>
                    <input
                      type="text"
                      id="customerName"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={t("namePlaceholder") || "Enter your name"}
                      className="customer-info-input"
                      required
                    />
                  </div>
                  <div className="customer-info-field">
                    <label htmlFor="customerMobile">
                      {t("mobileLabel") || "Mobile Number (Required)"}
                    </label>
                    <input
                      type="tel"
                      id="customerMobile"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      placeholder={t("mobilePlaceholder") || "Enter mobile number"}
                      className="customer-info-input"
                      required
                    />
                  </div>
                  <div className="customer-info-field">
                    <label htmlFor="customerEmail">{t("emailLabel") || "Email (Optional)"}</label>
                    <input
                      type="email"
                      id="customerEmail"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder={t("emailPlaceholder") || "Enter email address"}
                      className="customer-info-input"
                    />
                  </div>
                  {/* Special Instructions - Only show for PICKUP/DELIVERY on normal links */}
                  {isNormalLink && (orderType === "PICKUP" || orderType === "DELIVERY") && (
                    <div className="customer-info-field">
                      <label htmlFor="specialInstructions">
                        {t("specialInstructionsLabel") || "Special Instructions (Optional)"}
                      </label>
                      <textarea
                        id="specialInstructions"
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder={t("specialInstructionsPlaceholder") || "e.g., No onion, Urgent pickup, Leave at door"}
                        className="customer-info-input"
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="customer-info-modal-footer">
                <button
                  className="customer-info-submit-btn"
                  onClick={handleCustomerInfoSubmit}
                  style={{ width: "100%" }}
                >
                  {t("continueButton") || "Continue"}
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
        onClick={() => navigate("/blind-assistant")}
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
          zIndex: 9000, // Below modals (10000) but above content
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
