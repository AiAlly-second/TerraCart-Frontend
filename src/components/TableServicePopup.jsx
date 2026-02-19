import React, { useRef, useState } from "react";
import { FiX, FiMic, FiMicOff } from "react-icons/fi";
import translations from "../data/translations/tableservicepopup.json";

export default function TableServicePopup({ showCard, setShowCard, currentTable, onTableSelect }) {
  // language from localStorage (fallback to en)
  const language = (() => {
    try {
      return localStorage.getItem("language") || "en";
    } catch {
      return "en";
    }
  })();
  const t = translations[language] || translations.en;
  const serviceType = React.useMemo(() => {
    try {
      return localStorage.getItem("terra_serviceType") || "DINE_IN";
    } catch {
      return "DINE_IN";
    }
  }, [showCard]);
  const isTakeawayMode =
    serviceType === "TAKEAWAY" ||
    serviceType === "PICKUP" ||
    serviceType === "DELIVERY";

  // Initialize selectedTable from currentTable or localStorage
  const [selectedTable, setSelectedTable] = useState(() => {
    return currentTable || localStorage.getItem('selectedTable') || '';
  });

  const [selectedService, setSelectedService] = useState(null);
  const [showTableSelect, setShowTableSelect] = useState(!currentTable);
  const [availableTables, setAvailableTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Fetch tables if we don't have currentTable with ID
  React.useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoadingTables(true);
        const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");
        // We need a cartId to fetch tables. Try to get it from various places.
        const storedTable = localStorage.getItem('terra_selectedTable');
        let cartId = null;
        if (storedTable) {
          cartId = JSON.parse(storedTable).cartId;
        }
        
        const url = cartId ? `${nodeApi}/api/tables/public?cartId=${cartId}` : `${nodeApi}/api/tables/public`;
        const response = await fetch(url);
        const data = await response.json();
        if (Array.isArray(data)) {
          setAvailableTables(data);
        }
      } catch (err) {
        console.error("Failed to fetch tables:", err);
      } finally {
        setLoadingTables(false);
      }
    };

    if (showCard && !isTakeawayMode) {
      fetchTables();
    }
  }, [showCard, isTakeawayMode]);

  // Available table numbers (customize as needed)
  const tables = Array.from({ length: 20 }, (_, i) => String(i + 1));

  const serviceRequests = [
    { icon: "💧", key: "water" },
    { icon: "🧂", key: "saltPepper" },
    { icon: "🍽️", key: "plates" },
    { icon: "🥄", key: "cutlery" },
    { icon: "🧻", key: "napkins" },
    { icon: "🧽", key: "cleanTable" },
    { icon: "📋", key: "menuCard" },
    { icon: "💳", key: "bill" },
    { icon: "🌶️", key: "sauce" },
    { icon: "🥤", key: "softDrinks" },
    { icon: "🍋", key: "lemonWater" },
    { icon: "🔔", key: "callWaiter" }
  ];

  const [customRequest, setCustomRequest] = useState("");
  const [recording, setRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  const recognitionRef = useRef(null);

  // Map service keys to backend request types
  const getRequestType = (serviceKey) => {
    const mapping = {
      water: "water",
      saltPepper: "assistance",
      plates: "assistance",
      cutlery: "cutlery",
      napkins: "napkins",
      cleanTable: "assistance",
      menuCard: "menu",
      bill: "bill",
      sauce: "assistance",
      softDrinks: "assistance",
      lemonWater: "water",
      callWaiter: "assistance",
    };
    return mapping[serviceKey] || "assistance";
  };

  const getStoredCartId = () => {
    const selectedCartId = localStorage.getItem("terra_selectedCartId");
    if (selectedCartId) return selectedCartId;

    const takeawayCartId = localStorage.getItem("terra_takeaway_cartId");
    if (takeawayCartId) return takeawayCartId;

    const tableDataStr = localStorage.getItem("terra_selectedTable");
    if (!tableDataStr) return null;
    try {
      const tableData = JSON.parse(tableDataStr);
      const rawCartId = tableData.cartId || tableData.cafeId || null;
      if (!rawCartId) return null;
      if (typeof rawCartId === "string") return rawCartId;
      if (typeof rawCartId === "object") {
        const nestedId = rawCartId._id || rawCartId.id;
        return nestedId ? String(nestedId) : null;
      }
      return String(rawCartId);
    } catch {
      return null;
    }
  };

  const getTakeawayToken = () => {
    const previewToken = Number(localStorage.getItem("terra_takeaway_token_preview"));
    if (Number.isInteger(previewToken) && previewToken > 0) {
      return previewToken;
    }

    try {
      const previousOrderRaw = localStorage.getItem("terra_previousOrderDetail");
      if (!previousOrderRaw) return null;
      const previousOrder = JSON.parse(previousOrderRaw);
      const storedToken = Number(previousOrder?.takeawayToken);
      if (Number.isInteger(storedToken) && storedToken > 0) {
        return storedToken;
      }
    } catch {
      return null;
    }

    return null;
  };

  const takeawayTokenForDisplay = React.useMemo(() => {
    if (!isTakeawayMode) return null;
    return getTakeawayToken();
  }, [isTakeawayMode, showCard]);

  const getRequestContext = () => {
    const tableDataStr = localStorage.getItem("terra_selectedTable");
    const tableData = tableDataStr ? JSON.parse(tableDataStr) : {};
    let tableId = tableData.id || tableData._id;
    const tableNumber =
      tableData.number || tableData.tableNumber || currentTable || selectedTable;

    if (!isTakeawayMode && !tableId && tableNumber) {
      const found = availableTables.find(
        (table) => String(table.number) === String(tableNumber),
      );
      if (found) {
        tableId = found._id;
      }
    }

    const orderId = isTakeawayMode
      ? localStorage.getItem("terra_orderId_TAKEAWAY") ||
        localStorage.getItem("terra_orderId") ||
        null
      : localStorage.getItem("terra_orderId_DINE_IN") ||
        localStorage.getItem("terra_orderId") ||
        null;
    const cartId = getStoredCartId();
    const tokenNumber = isTakeawayMode ? getTakeawayToken() : null;

    if (!isTakeawayMode && !tableId) {
      throw new Error(
        t.alerts.selectTable ||
          "Please select a valid table first so we know where to send the waiter.",
      );
    }

    if (isTakeawayMode && !cartId) {
      throw new Error("Unable to identify takeaway cart. Please scan the takeaway QR again.");
    }

    return { tableId, tableNumber, orderId, cartId, tokenNumber };
  };

  const sendCustomerRequest = async ({ requestType, customerNotes }) => {
    const context = getRequestContext();
    const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");

    const requestData = {
      requestType,
      customerNotes:
        isTakeawayMode && context.tokenNumber
          ? `[Token ${context.tokenNumber}] ${customerNotes}`
          : customerNotes,
      ...(context.orderId && { orderId: context.orderId }),
      ...(context.cartId && { cartId: context.cartId }),
      ...(!isTakeawayMode && context.tableId && { tableId: context.tableId }),
    };

    const response = await fetch(`${nodeApi}/api/customer-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Failed to send request");
    }

    return context;
  };

  const handleServiceRequest = async (serviceKey) => {
    if (isSendingRequest) return;

    try {
      setIsSendingRequest(true);
      const serviceLabel = t.services[serviceKey] || serviceKey;
      const context = await sendCustomerRequest({
        requestType: getRequestType(serviceKey),
        customerNotes: serviceLabel,
      });

      const destinationSuffix = isTakeawayMode
        ? context.tokenNumber
          ? ` - Token ${context.tokenNumber}`
          : " - Takeaway"
        : ` - Table ${context.tableNumber}`;
      alert(`${t.alerts.requestSentPrefix || "Request sent"}: ${serviceLabel}${destinationSuffix}`);
      setShowCard(false);
    } catch (error) {
      console.error("Error sending service request:", error);
      alert(`Failed to send request: ${error.message}`);
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleSendCustom = async () => {
    if (!customRequest.trim()) {
      alert(t.alerts.emptyRequest || "Please enter your request");
      return;
    }

    if (isSendingRequest) return;

    try {
      setIsSendingRequest(true);
      const context = await sendCustomerRequest({
        requestType: "assistance",
        customerNotes: customRequest.trim(),
      });

      const destinationSuffix = isTakeawayMode
        ? context.tokenNumber
          ? ` - Token ${context.tokenNumber}`
          : " - Takeaway"
        : ` - Table ${context.tableNumber}`;
      alert(`${t.alerts.requestSentPrefix || "Request sent"}: ${customRequest.trim()}${destinationSuffix}`);
      setCustomRequest("");
      setShowCard(false);
    } catch (error) {
      console.error("Error sending custom request:", error);
      alert(`Failed to send request: ${error.message}`);
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleUrgentCall = async () => {
    if (isSendingRequest) return;

    try {
      setIsSendingRequest(true);
      const context = await sendCustomerRequest({
        requestType: "assistance",
        customerNotes: "URGENT: Call waiter immediately",
      });

      const destinationSuffix = isTakeawayMode
        ? context.tokenNumber
          ? ` (Token ${context.tokenNumber})`
          : " (Takeaway)"
        : ` (Table ${context.tableNumber})`;
      alert(
        (t.alerts.urgentCalled ||
          "Urgent request sent! A waiter will be with you shortly.") +
          destinationSuffix,
      );
      setShowCard(false);
    } catch (error) {
      console.error("Error sending urgent request:", error);
      alert(`Failed to send urgent request: ${error.message}`);
    } finally {
      setIsSendingRequest(false);
    }
  };
  const stopRecordingCleanup = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    } catch (err) {
      console.warn("Error stopping recognition:", err);
    }
    setRecording(false);
  };

  const handleVoiceInput = async () => {
    if (recording) {
      stopRecordingCleanup();
      return;
    }

    // Check if browser supports Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser doesn't support voice input. Please type your request instead.");
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = language === 'en' ? 'en-US' : language === 'hi' ? 'hi-IN' : 'en-US';

      recognition.onstart = () => {
        setRecording(true);
        console.log("🎤 Voice recognition started");
      };

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("📝 Transcribed:", transcript);
        setCustomRequest(transcript);
        setRecording(false);

        // Parse the order and format it nicely
        setIsProcessing(true);
        try {
          const flaskApi = (import.meta.env.VITE_FLASK_API_URL || "http://localhost:5050").replace(/\/$/, "");
          const res = await fetch(`${flaskApi}/parse-order-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcript }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
          
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Backend returned ${res.status}`);
          }
          
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            // Format the parsed items nicely
            const formattedOrder = data.items
              .map(item => `${item.quantity}x ${item.name}`)
              .join(", ");
            setCustomRequest(formattedOrder);
            console.log("✅ Parsed order:", data);
          } else if (data.error) {
            // Backend returned an error but we have the transcript
            console.warn("Backend parsing error:", data.error);
            // Keep the transcript as-is
          }
        } catch (err) {
          console.error("Order parsing failed:", err);
          // Check if it's a connection error
          if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
            alert("❌ Cannot connect to backend server. Please make sure Flask server is running on port 5050.\n\nYou can still type your order manually.");
          } else if (err.name === 'AbortError' || err.message.includes('timeout')) {
            alert("⏱️ Request timed out. The backend server may be slow or unavailable.\n\nYou can still type your order manually.");
          } else {
            alert(`⚠️ Order parsing failed: ${err.message}\n\nYou can still see your transcribed text and type manually.`);
          }
          // Keep the transcript so user can still use it
        } finally {
          setIsProcessing(false);
        }
      };

      recognition.onerror = (event) => {
        console.error("Voice recognition error:", event.error);
        setRecording(false);
        if (event.error === 'no-speech') {
          alert("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          alert("Microphone permission denied. Please allow microphone access.");
        } else {
          alert(t.alerts.voiceError || "Voice recognition error. Please try typing instead.");
        }
      };

      recognition.onend = () => {
        setRecording(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (err) {
      console.error("Error starting voice recognition:", err);
      alert(t.alerts.micError || "Failed to start voice input. Please try typing instead.");
      setRecording(false);
    }
  };

  if (!showCard) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        maxWidth: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.75)",
        zIndex: 1000000, // Ensuring it's above everything
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px",
        boxSizing: "border-box"
      }}
      onClick={() => {
        stopRecordingCleanup();
        setShowCard(false);
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          width: "100%",
          maxWidth: 420,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottom: "1px solid #e5e7eb",
            background: "linear-gradient(to right, #fff7ed, white)"
          }}
        >
          <h3
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: "#d97706",
              margin: 0
            }}
          >
            {t.header}{" "}
            {isTakeawayMode
              ? takeawayTokenForDisplay
                ? `- Token ${takeawayTokenForDisplay}`
                : "- Takeaway"
              : selectedTable
                ? `- Table ${selectedTable}`
                : ""}
          </h3>
          <button
            onClick={() => {
              stopRecordingCleanup();
              setShowCard(false);
            }}
            style={{
              padding: 8,
              borderRadius: "50%",
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              color: "#6b7280"
            }}
            title="Close"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Table/Token Context */}
        <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>
          {isTakeawayMode ? (
            <>
              <p style={{ fontSize: 14, marginBottom: 8, fontWeight: 500 }}>
                Takeaway Assistance
              </p>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #fde68a",
                  backgroundColor: "#fffbeb",
                  color: "#92400e",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {takeawayTokenForDisplay
                  ? `Token ${takeawayTokenForDisplay}`
                  : "Token will be assigned"}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, marginBottom: 8, fontWeight: 500 }}>
                {currentTable ? "Assigned Table" : "Select Table:"}
              </p>
              {currentTable ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #dbeafe",
                    backgroundColor: "#eff6ff",
                    color: "#1d4ed8",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  Table {currentTable}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: 8,
                  }}
                >
                  {tables.map((table) => (
                    <button
                      key={table}
                      onClick={() => {
                        setSelectedTable(table);
                        localStorage.setItem("selectedTable", table);
                        if (onTableSelect) onTableSelect(table);
                      }}
                      style={{
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        backgroundColor:
                          selectedTable === table ? "#16a34a" : "white",
                        color: selectedTable === table ? "white" : "#374151",
                        cursor: "pointer",
                        fontWeight: "500",
                      }}
                    >
                      {table}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
              marginBottom: 16,
              textAlign: "center",
              fontWeight: 500
            }}
          >
            {t.tapService}
          </p>

          {/* Services Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 16
            }}
          >
            {serviceRequests.map((service, index) => (
              <button
                key={index}
                onClick={() => handleServiceRequest(service.key)}
                disabled={isSendingRequest}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  backgroundColor: "white",
                  cursor: isSendingRequest ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s",
                  boxShadow: "0 1px 3px 0 rgba(0,0,0,0.1)",
                  opacity: isSendingRequest ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#fb923c";
                  e.currentTarget.style.backgroundColor = "#fff7ed";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.backgroundColor = "white";
                }}
              >
                <span style={{ fontSize: 20 }}>{service.icon}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    textAlign: "center",
                    lineHeight: 1.2,
                    color: "#374151"
                  }}
                >
                  {t.services[service.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Speak or Type your request */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              backgroundColor: "#fff7ed"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                {t.speakOrType}
              </label>
              <button
                onClick={handleVoiceInput}
                disabled={isProcessing}
                style={{
                  padding: 8,
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  color: "white",
                  backgroundColor: recording ? "#dc2626" : "#16a34a",
                  opacity: isProcessing ? 0.7 : 1
                }}
                title={recording ? t.titleStop : t.titleStart}
              >
                {recording ? <FiMicOff size={16} /> : <FiMic size={16} />}
              </button>
            </div>

            <textarea
              placeholder={t.placeholder}
              rows={3}
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                outline: "none",
                resize: "vertical",
                fontSize: 13,
                backgroundColor: "white"
              }}
            />

            <button
              onClick={handleSendCustom}
              disabled={isProcessing || isSendingRequest}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                backgroundColor: "#f97316",
                color: "white",
                border: "none",
                cursor: (isProcessing || isSendingRequest) ? "not-allowed" : "pointer",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                opacity: (isProcessing || isSendingRequest) ? 0.7 : 1
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#ea580c";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#f97316";
              }}
            >
              {t.sendButton}
            </button>

            {recording && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#dc2626",
                  textAlign: "right"
                }}
              >
                {t.listening}
              </p>
            )}
            {(isProcessing || isSendingRequest) && (
              <p
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#6b7280",
                  textAlign: "right"
                }}
              >
                {isSendingRequest ? (t.sending || "Sending request...") : t.processing}
              </p>
            )}
          </div>

          {/* Emergency Call Button */}
              <button
                onClick={handleUrgentCall}
                disabled={isSendingRequest}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 8,
              fontWeight: "bold",
              fontSize: 14,
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              cursor: isSendingRequest ? "not-allowed" : "pointer",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              opacity: isSendingRequest ? 0.6 : 1
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#b91c1c";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#dc2626";
            }}
          >
            {t.urgentButton}
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            textAlign: "center"
          }}
        >
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            {t.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
