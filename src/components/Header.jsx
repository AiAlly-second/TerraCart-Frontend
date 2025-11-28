import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiMic, FiMicOff, FiArrowLeft } from "react-icons/fi";
import logo from "../assets/images/logo_new.png";
import translations from "../data/translations/Header.json";
import NavigationTabs from "./NavigationTabs";

// CHANGE 1: Add the 'isFixed' prop with a default value of 'true'
export default function Header({ showNavigationTabs = true, isFixed = true }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [language, setLanguage] = useState(localStorage.getItem("language") || "en");
  const t = translations[language];
  const [showCard, setShowCard] = useState(false);
  const [recording, setRecording] = useState(false);
  const [customRequest, setCustomRequest] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const [activeTab, setActiveTab] = useState("table");
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const handleStorageChange = () => {
      setAccessibilityMode(localStorage.getItem("accessibilityMode") === "true");
      setLanguage(localStorage.getItem("language") || "en");
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const bgHeader = accessibilityMode
    ? "bg-black text-white border-blue-400"
    : "bg-[#f5e3d5]/80 text-[#4a2e1f] border-[#e2c1ac]";
  const buttonBase = accessibilityMode
    ? "bg-[#00BFFF] text-black hover:bg-blue-400"
    : "bg-[#d86d2a] text-white hover:bg-[#c75b1a]";
  const popupBg = accessibilityMode
    ? "bg-black/90 text-white border-blue-400"
    : "bg-[#f5e3d5]/90 text-[#4a2e1f] border-[#e2c1ac]";
  const inputBg = accessibilityMode
    ? "bg-black text-white border-blue-400"
    : "bg-[#fef4ec] text-[#4a2e1f] border-[#e2c1ac]";
  const cardBg = accessibilityMode
    ? "bg-[#111] border-blue-400 text-white"
    : "bg-[#f3ddcb] border-[#e2c1ac] text-[#4a2e1f]";

  const handleFeatureClick = () => {
    alert(t.alertRequest);
  };

  const handleVoiceInput = async () => {
    // ... (Your voice input logic remains the same)
  };

  // CHANGE 2: Define conditional classes based on the 'isFixed' prop.
  const positionClasses = isFixed
    ? 'fixed top-0 left-0 z-20' // Classes for a fixed header
    : 'relative';               // Classes for a scrolling header

  return (
    <>
      {/* CHANGE 3: Apply the 'positionClasses' to the header element */}
      <header
        className={`${positionClasses} w-full flex flex-col items-center shadow-md backdrop-blur-md border-b h-20 ${bgHeader}`}
      >
        {/* The rest of your header's internal JSX remains unchanged */}
        <div className="w-full flex items-center justify-center relative h-20">
          {location.pathname !== '/' && (
            <button
              onClick={() => navigate(-1)}
              className={`absolute left-4 p-2 rounded-full transition ${
                accessibilityMode
                  ? "text-white hover:text-blue-400"
                  : "text-[#4a2e1f] hover:text-[#d86d2a]"
              }`}
            >
              <FiArrowLeft size={28} />
            </button>
          )}
          <img src={logo} alt="Logo" className="h-12 object-contain" />
        </div>
        
        {showNavigationTabs && (
          <NavigationTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setShowCard={setShowCard}
            language={language}
            accessibilityMode={accessibilityMode}
          />
        )}
      </header>

      {/* The rest of your component (the popup) remains unchanged */}
      <AnimatePresence>
        {showCard && (
          <>
            <motion.div
              className="fixed inset-0 backdrop-blur-sm bg-black/30 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.3 }}
            >
              {/* ... The rest of your popup code ... */}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
