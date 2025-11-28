import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { FiEye } from "react-icons/fi";
import Header from "../components/Header";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import translations from "../data/translations/orderConfirmed.json";
import FloatingSignLanguageButton from "../components/FloatingSignLanguageButton";
import FloatingPDFButton from "../components/FloatingPDFButton";
import floatingButtonTranslations from "../data/translations/floatingButtons.json";
import "./OrderConfirmed.css"; // Import the CSS file

export default function OrderConfirmed() {
  const navigate = useNavigate();
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );
  const [activeModal, setActiveModal] = useState(null);

  // ✅ Language from localStorage
  const language = localStorage.getItem("language") || "en";
  const t = (key) => translations[language]?.[key] || key;
  
  // ADDED: Floating button translations
  const floatingButtonT = floatingButtonTranslations[language] || floatingButtonTranslations.en;

  const toggleAccessibility = () => {
    const newMode = !accessibilityMode;
    setAccessibilityMode(newMode);
    localStorage.setItem("accessibilityMode", newMode.toString());
  };

  return (
    <div
      className={`order-confirmed-container ${accessibilityMode ? "accessibility-mode" : ""}`}
    >
      {/* Background Image */}
      <div className="background-container">
        <img
          src={restaurantBg}
          alt="Restaurant"
          className={`background-image ${accessibilityMode ? "accessibility-mode" : ""}`}
        />
        <div
          className={`background-overlay ${accessibilityMode ? "accessibility-mode" : ""}`}
        />
      </div>

      {/* Accessibility Toggle Button 
      <button
        onClick={toggleAccessibility}
        className={`accessibility-toggle ${accessibilityMode ? "accessibility-mode" : ""}`}
        title="Toggle Accessibility Mode"
      >
        <FiEye size={24} />
      </button>
      */}
      
      {/* Header */}
      <Header hideBackButton={true} hideGroupOrdering={true} />

      {/* Content */}
      <div className="main-content">
        {/* Card */}
        <div
          className={`confirmation-card ${accessibilityMode ? "accessibility-mode" : ""}`}
        >
          <h1 className="card-title">{t("orderConfirmed")}</h1>
          <p
            className={`card-description ${accessibilityMode ? "accessibility-mode" : ""}`}
          >
            {t("foodPreparing")}
          </p>

          {/* Buttons */}
          <div className="action-buttons">
            <button
              onClick={() => navigate("/menu")}
              className={`action-button ${accessibilityMode ? "accessibility-mode" : ""}`}
            >
              {t("orderMore")}
            </button>

            <button
              onClick={() => navigate("/billing")}
              className={`action-button ${accessibilityMode ? "accessibility-mode" : ""}`}
            >
              {t("billing")}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Buttons */}
  {  /*  <FloatingPDFButton
        accessibilityMode={accessibilityMode}
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        translations={floatingButtonT}
      />

      <FloatingSignLanguageButton
        accessibilityMode={accessibilityMode}
        setAccessibilityMode={setAccessibilityMode}
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        translations={floatingButtonT}
      />
      */}

    </div>
  );
}
