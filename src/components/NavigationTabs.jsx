// components/NavigationTabs.jsx
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TableServicePopup from "./TableServicePopup";
import translations from "../data/translations/navigationtabs.json";

export default function NavigationTabs({
  activeTab,
  setActiveTab,
  accessibilityMode,
}) {
  const navigate = useNavigate();

  // Read language from localStorage with fallback to "en"
  const language = useMemo(() => {
    try {
      return localStorage.getItem("language") || "en";
    } catch {
      return "en";
    }
  }, []);

  // Select translations safely
  const t = translations[language] || translations.en;

  // Internal state for Table Service popup
  const [showCard, setShowCard] = useState(false);

  // Updated color themes - plain white with black text and orange borders
  const buttonBase = "bg-white text-black border-orange-500";
  const inactiveTab = "bg-white text-black hover:bg-gray-50";

  return (
    <>
      <div className="w-full flex border-t border-orange-500">
        {/* Sign Menu 
        <button
          className={`flex-1 py-2 text-xs sm:text-sm md:text-base font-medium transition-colors border-r border-orange-500 ${
            activeTab === "signLanguage" ? buttonBase : inactiveTab
          }`}
          onClick={() => {
            setActiveTab("signLanguage");
            navigate("/sign-language");
          }}
        >
          {t.signMenu || "Sign Menu"}
        </button>
        */}

        {/* Table Service */}
        <button
          className={`flex-1 py-2 text-xs sm:text-sm md:text-base font-medium transition-colors border-r border-orange-500 ${
            activeTab === "table" ? buttonBase : inactiveTab
          }`}
          onClick={() => {
            setActiveTab("table");
            setShowCard(true);
          }}
        >
          {t.tableService || "Assistance"}
        </button>

        {/* Sign Name */}
        <button
          className={`flex-1 py-2 text-xs sm:text-sm md:text-base font-medium transition-colors ${
            activeTab === "signName" ? buttonBase : inactiveTab
          }`}
          onClick={() => {
            setActiveTab("signName");
            navigate("/sign-name");
          }}
        >
          {t.signName || "Sign Name"}
        </button>
      </div>

      {/* Table Service Popup */}
      <TableServicePopup
        showCard={showCard}
        setShowCard={setShowCard}
        language={language}
        accessibilityMode={accessibilityMode}
      />
    </>
  );
}
