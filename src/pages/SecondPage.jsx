import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import Header from "../components/Header";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import blindEyeIcon from "../assets/images/blind-eye-sign.png";
import translations from "../data/translations/secondpage.json";
import useVoiceAssistant from "../utils/useVoiceAssistant";
import "./SecondPage.css";

const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");

const checkVoiceSupport = (language) => {
  const voices = window.speechSynthesis.getVoices();
  const langPrefix =
    language === "mr" ? "mr" : language === "gu" ? "gu" : language === "hi" ? "hi" : "en";
  const hasNativeSupport = voices.some((voice) => voice.lang.toLowerCase().startsWith(langPrefix));

  if (!hasNativeSupport && (language === "mr" || language === "gu")) {
    console.warn(`Limited voice support for ${language}. Using fallback pronunciation.`);
  }
  
  return hasNativeSupport;
};

export default function SecondPage() {
  const navigate = useNavigate();

  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const [language] = useState(localStorage.getItem("language") || "en");
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem("terra_sessionToken"));
  const [tableInfo, setTableInfo] = useState(() => {
    try {
      const stored = localStorage.getItem("terra_selectedTable");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Simplified waitlist state - only when table is occupied
  const [waitlistToken, setWaitlistToken] = useState(localStorage.getItem("terra_waitToken"));
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
    if (!tableInfo) {
      setIsTableOccupied(false);
      setShowWaitlistModal(false);
      return;
    }

    // CRITICAL: Check actual table.status field, not HTTP status
    const tableStatus = tableInfo.status || "AVAILABLE";
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
      return;
    }

    // Table is occupied (status !== "AVAILABLE") - only show waitlist modal if user is not already in waitlist
    if (isOccupied && !waitlistToken) {
      setShowWaitlistModal(true);
    } else {
      setShowWaitlistModal(false);
    }
  }, [tableInfo, waitlistToken]);

  // Poll waitlist status ONLY if user is in waitlist AND table is NOT available
  useEffect(() => {
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
        const res = await fetch(`${nodeApi}/api/waitlist/status?token=${waitlistToken}`);
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
        setWaitlistInfo(data);

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

    checkWaitlistStatus();
    const interval = setInterval(checkWaitlistStatus, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [waitlistToken, tableInfo]);

  // Load table info on mount
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
      } catch {
        setTableInfo(null);
      }
    }
  }, []);

  const startServiceFlow = useCallback(
    async (serviceType = "DINE_IN") => {
    const isTakeaway = serviceType === "TAKEAWAY";
    
    // For TAKEAWAY orders, show customer info modal first
    if (isTakeaway) {
      setShowCustomerInfoModal(true);
      return;
    }

      // For DINE_IN orders, ALWAYS verify table status via QR lookup first
    const storedTable = localStorage.getItem("terra_selectedTable");
    if (!storedTable) {
      alert("We couldn't detect your table. Please scan the table QR again or contact staff.");
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
      const storedSession = sessionToken || localStorage.getItem("terra_sessionToken");
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
      const payload = await res.json().catch(() => ({}));

        // Table is occupied (423 status) - STRICT: Must join waitlist
      if (res.status === 423) {
        const lockedTable = payload.table || table;
          localStorage.setItem("terra_selectedTable", JSON.stringify(lockedTable));
          setTableInfo(lockedTable);
          setIsTableOccupied(true);
        
          // Check if user has active order - only exception to allow access
        const existingOrderId = localStorage.getItem("terra_orderId") || 
                                localStorage.getItem("terra_orderId_DINE_IN");
        const hasActiveOrder = existingOrderId && lockedTable?.currentOrder === existingOrderId;
        
        if (hasActiveOrder) {
          // User has active order, allow proceeding to menu
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
              const statusRes = await fetch(`${nodeApi}/api/waitlist/status?token=${waitlistToken}`);
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                // Only allow if status is NOTIFIED or SEATED
                if (statusData.status === "NOTIFIED" || statusData.status === "SEATED") {
                  // User is notified or seated, allow to proceed
                  if (statusData.status === "SEATED" && statusData.sessionToken) {
                    localStorage.setItem("terra_sessionToken", statusData.sessionToken);
                    setSessionToken(statusData.sessionToken);
                    localStorage.removeItem("terra_waitToken");
                    setWaitlistToken(null);
                    setWaitlistInfo(null);
                  }
                  localStorage.setItem("terra_serviceType", serviceType);
                  navigate("/menu", { state: { serviceType, table: lockedTable } });
                  return;
                } else {
                  // User is still waiting - BLOCK ACCESS
                  alert("Table is currently occupied. Please wait for your turn in the waitlist. You must join the waitlist to access this table.");
                  setShowWaitlistModal(true);
                  return;
                }
              }
            } catch (err) {
              console.error("Failed to check waitlist status", err);
            }
          }

          // User is NOT in waitlist - MUST join waitlist, NO BYPASS
          alert("Table is currently occupied. You must join the waitlist to access this table.");
          setShowWaitlistModal(true);
        return;
      }

        // Table lookup failed
      if (!res.ok || !payload?.table) {
        throw new Error(payload?.message || "Failed to check table status.");
      }

        // STRONG LOGIC: Verify table status from response
      const tableData = payload.table;
        const tableStatus = tableData.status || "AVAILABLE";
        
        // CRITICAL: If table status is AVAILABLE, allow direct access (no waitlist)
        if (tableStatus === "AVAILABLE") {
      localStorage.setItem("terra_selectedTable", JSON.stringify(tableData));
      setTableInfo(tableData);
          setIsTableOccupied(false);
          setShowWaitlistModal(false);

          // Clear any existing waitlist token (first user doesn't need waitlist)
          if (waitlistToken) {
            localStorage.removeItem("terra_waitToken");
            setWaitlistToken(null);
            setWaitlistInfo(null);
          }

          // Update session token if provided
      if (payload.sessionToken || tableData.sessionToken) {
        const nextToken = payload.sessionToken || tableData.sessionToken;
        localStorage.setItem("terra_sessionToken", nextToken);
        setSessionToken(nextToken);
      }

          // Proceed directly to menu - no waitlist needed
          localStorage.setItem("terra_serviceType", serviceType);
          navigate("/menu", { state: { serviceType, table: tableData } });
          return;
        }

        // Table is NOT available - apply waitlist logic (only if status is NOT "AVAILABLE")
        localStorage.setItem("terra_selectedTable", JSON.stringify(tableData));
        setTableInfo(tableData);
        setIsTableOccupied(true);

        // Update session token if provided
          if (payload.sessionToken || tableData.sessionToken) {
          const nextToken = payload.sessionToken || tableData.sessionToken;
          localStorage.setItem("terra_sessionToken", nextToken);
          setSessionToken(nextToken);
        }

        // If user was in waitlist and now seated, clear waitlist
        if (waitlistToken && payload.waitlist?.status === "SEATED") {
          if (payload.waitlist.sessionToken) {
            localStorage.setItem("terra_sessionToken", payload.waitlist.sessionToken);
            setSessionToken(payload.waitlist.sessionToken);
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
        alert("Table is currently occupied. You must join the waitlist to access this table.");
        setShowWaitlistModal(true);
    } catch (err) {
      console.error("startServiceFlow error", err);
      alert("Unable to check table availability. Please ask staff for help.");
    }
    },
    [navigate, waitlistToken, sessionToken]
  );

  const startDineInFlow = useCallback(() => startServiceFlow("DINE_IN"), [startServiceFlow]);
  const startTakeawayFlow = useCallback(() => startServiceFlow("TAKEAWAY"), [startServiceFlow]);

  // Handle customer info modal submit for takeaway orders
  const handleCustomerInfoSubmit = useCallback(() => {
    // Save customer info to localStorage
    if (customerName) localStorage.setItem("terra_takeaway_customerName", customerName);
    if (customerMobile) localStorage.setItem("terra_takeaway_customerMobile", customerMobile);
    if (customerEmail) localStorage.setItem("terra_takeaway_customerEmail", customerEmail);
    
    // Close modal and navigate to menu
    setShowCustomerInfoModal(false);
    localStorage.setItem("terra_serviceType", "TAKEAWAY");
    navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
  }, [customerName, customerMobile, customerEmail, navigate]);

  // Handle skip customer info (all fields optional)
  const handleSkipCustomerInfo = useCallback(() => {
    // Clear any existing customer info
    setCustomerName("");
    setCustomerMobile("");
    setCustomerEmail("");
    localStorage.removeItem("terra_takeaway_customerName");
    localStorage.removeItem("terra_takeaway_customerMobile");
    localStorage.removeItem("terra_takeaway_customerEmail");
    
    // Close modal and navigate to menu
    setShowCustomerInfoModal(false);
    localStorage.setItem("terra_serviceType", "TAKEAWAY");
    navigate("/menu", { state: { serviceType: "TAKEAWAY" } });
  }, [navigate]);

  // Join waitlist - STRICT: ONLY when table is NOT available
  const handleJoinWaitlist = useCallback(async () => {
    // CRITICAL: No waitlist if table is available
    if (!tableInfo) {
      alert("We couldn't detect your table. Please ask staff for help.");
      return;
    }

    const tableStatus = tableInfo.status || "AVAILABLE";
    if (tableStatus === "AVAILABLE") {
      alert("Table is available. You can proceed directly without waitlist.");
      return;
    }

    if (!isTableOccupied) {
      alert("Table is not occupied. You can proceed directly.");
      return;
    }

    const tableId = tableInfo?.id || tableInfo?._id;
    if (!tableId) {
      alert("We couldn't detect your table. Please ask staff for help.");
      return;
    }

    try {
      setJoiningWaitlist(true);
      const res = await fetch(`${nodeApi}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tableId: tableId,
          token: waitlistToken || undefined,
          sessionToken: sessionToken || localStorage.getItem("terra_sessionToken") || undefined,
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
      });
      setShowWaitlistModal(false);
      
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
  }, [tableInfo, isTableOccupied, waitlistToken]);

  // Leave waitlist
  const handleLeaveWaitlist = useCallback(async () => {
    if (!waitlistToken) return;
    
    const confirmLeave = window.confirm(t("waitlistLeaveConfirm") || "Leave the waitlist?");
    if (!confirmLeave) return;

    try {
      await fetch(`${nodeApi}/api/waitlist/${waitlistToken}`, { method: "DELETE" });
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
      const res = await fetch(`${nodeApi}/api/waitlist/status?token=${waitlistToken}`);
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

    readAloud(speechText, () => {
      const commands = {
        [dineInText.toLowerCase()]: () => startDineInFlow(),
        [takeAwayText.toLowerCase()]: () => startTakeawayFlow(),
      };

      if (language === "hi") {
        Object.assign(commands, {
          "रेस्टोरेंट में": startDineInFlow,
          "रेस्टोरेंट": startDineInFlow,
          "खाना": startDineInFlow,
          "पैकेट": startTakeawayFlow,
          "टेकअवे": startTakeawayFlow,
        });
      }

      if (language === "mr") {
        Object.assign(commands, {
          "रेस्टॉरंट": startDineInFlow,
          "रेस्टो": startDineInFlow,
          "जेवण": startDineInFlow,
          "खाणे": startDineInFlow,
          "पॅकेट": startTakeawayFlow,
          "पार्सल": startTakeawayFlow,
          "घर": startTakeawayFlow,
        });
      }

      if (language === "gu") {
        Object.assign(commands, {
          "રેસ્ટોરન્ટ": startDineInFlow,
          "રેસ્ટો": startDineInFlow,
          "જમવું": startDineInFlow,
          "ખાવું": startDineInFlow,
          "પેકેટ": startTakeawayFlow,
          "પાર્સલ": startTakeawayFlow,
          "ઘર": startTakeawayFlow,
        });
      }

      Object.assign(commands, {
        "dine in": startDineInFlow,
        "dining": startDineInFlow,
        "restaurant": startDineInFlow,
        "take away": startTakeawayFlow,
        "takeaway": startTakeawayFlow,
        "parcel": startTakeawayFlow,
      });

      startListening(commands, language);
    }, language);
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
    <div className={`main-container ${accessibilityMode ? "accessibility-mode" : "normal-mode"}`}>
      <Header showNavigationTabs={false} />

      <div
        className={`background-wrapper ${accessibilityMode ? "accessibility-background" : ""}`}
        style={{ backgroundImage: `url(${restaurantBg})` }}
      >
        <div className="overlay" />
      </div>

      <div className="content-wrapper">
        <div className="buttons-container">
          <button
            onClick={() => {
              // STRONG LOGIC: Check actual table status before allowing Dine In
              if (!tableInfo) {
                alert("We couldn't detect your table. Please scan the table QR again.");
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
                alert("Table is currently occupied. You must join the waitlist to access Dine In.");
                setShowWaitlistModal(true);
                return;
              }
              
              // Table is occupied but user is in waitlist - proceed to check status
              startDineInFlow();
            }}
            className={`nav-btn ${accessibilityMode ? "nav-btn-accessibility" : "nav-btn-normal"}`}
          >
            {t("dineIn")}
          </button>

          <button
            onClick={startTakeawayFlow}
            className={`nav-btn ${accessibilityMode ? "nav-btn-accessibility" : "nav-btn-normal"}`}
          >
            {t("takeAway")}
          </button>
        </div>

        {/* Waitlist Status Card - only show if user is in waitlist AND table is NOT available */}
        {waitlistToken && waitlistInfo && tableInfo?.status !== "AVAILABLE" && (
          <div className="waitlist-status-card">
            <h3 className="waitlist-status-title">{t("waitlistActiveTitle")}</h3>
            <p className="waitlist-text">
              {t("waitlistStatusLabel")}: <strong>{waitlistStatusText(waitlistInfo.status)}</strong>
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
                    alert("Table is currently occupied. Please wait for your turn in the waitlist.");
                    return;
                  }
                  startDineInFlow();
                }}
                disabled={waitlistInfo.status !== "NOTIFIED" && waitlistInfo.status !== "SEATED"}
                  >
                    {t("waitlistReadyButton")}
                  </button>
                  <button className="waitlist-secondary" onClick={handleLeaveWaitlist}>
                    {t("waitlistCancel")}
                  </button>
                  <button className="waitlist-secondary" onClick={handleRefreshWaitlist}>
                    {t("waitlistRefresh")}
                  </button>
                </div>
          </div>
        )}

        <div className="spacer" />
      </div>

       <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
         onClick={handleVoiceAssistant}
        className="fixed rounded-full shadow-lg bg-orange-500 text-white hover:bg-orange-600 focus:outline-none blind-eye-btn"
        style={{ 
          zIndex: 9999, 
          bottom: '20px',
          right: '20px',
          width: '56px',
          height: '56px',
          display: 'grid',
          placeItems: 'center',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          transition: 'transform .2s ease, box-shadow .2s ease, background .2s ease'
        }}
      >
        <img 
          src={blindEyeIcon} 
          alt="Blind Support" 
          width="24"
          height="24"
          style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
        />
      </motion.button>

      {/* Waitlist Modal - STRICT: only show when table is occupied (NOT available) */}
      {showWaitlistModal && isTableOccupied && tableInfo?.status !== "AVAILABLE" && !waitlistToken && (
        <div className="waitlist-modal">
          <div className="waitlist-panel">
            <h3 className="waitlist-title">{t("waitlistTitle")}</h3>
            <p className="waitlist-text">{t("waitlistDescription")}</p>
            <p className="waitlist-text">
              {t("waitlistDescription") || "This table is currently occupied. Would you like to join the waitlist?"}
            </p>
            <div className="waitlist-actions">
              <button
                className="waitlist-primary"
                onClick={handleJoinWaitlist}
                disabled={joiningWaitlist}
              >
                {joiningWaitlist ? t("waitlistJoining") || "Joining..." : t("waitlistJoin") || "Join Waitlist"}
              </button>
              <button
                className="waitlist-secondary"
                onClick={() => {
                  // STRICT: If user clicks "Not Now", they cannot access Dine In
                  setShowWaitlistModal(false);
                  alert("Table is currently occupied. You must join the waitlist to access Dine In. Please join the waitlist when you're ready.");
                }}
              >
                {t("waitlistNotNow") || "Not Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Info Modal for Takeaway Orders */}
      {showCustomerInfoModal && (
        <div className="customer-info-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleSkipCustomerInfo();
          }
        }}>
          <div className="customer-info-modal" onClick={(e) => e.stopPropagation()}>
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
              <p style={{ marginBottom: '16px', color: '#666', fontSize: '0.9rem' }}>
                Please provide your details for the takeaway order (all fields are optional):
              </p>
              <div className="customer-info-form">
                <div className="customer-info-field">
                  <label htmlFor="customerName">Name</label>
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
                  <label htmlFor="customerMobile">Mobile Number</label>
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
                  <label htmlFor="customerEmail">Email</label>
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
                className="customer-info-skip-btn"
                onClick={handleSkipCustomerInfo}
              >
                Skip
              </button>
              <button 
                className="customer-info-submit-btn"
                onClick={handleCustomerInfoSubmit}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
