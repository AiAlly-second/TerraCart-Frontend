import React from "react";
import { motion } from "framer-motion";
import Header from "../components/Header";
import bgImage from "../assets/images/restaurant-img.jpg";
import blindEyeIcon from "../assets/images/blind-eye-sign.png";
import translations from "../data/translations/Takeaway.json";

const Takeaway = () => {
  // Get selected language from localStorage (default = "en")
  const selectedLang = localStorage.getItem("language") || "en";

  // Get translated text (fallback to English if not available)
  const t = translations[selectedLang] || translations["en"];

  return (
    <div className="relative min-h-screen text-white">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={bgImage}
          alt="Background"
          className="w-full h-full object-cover blur-sm brightness-75"
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Header />
        <div className="flex items-center justify-center h-[80vh] px-4 text-center">
          <h1 className="text-2xl sm:text-2xl font-bold">{t.title}</h1>
        </div>
      </div>

      {/* Blind Support Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {}}
        className="fixed rounded-full shadow-lg bg-orange-500 text-white hover:bg-orange-600 focus:outline-none blind-eye-btn"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "56px",
          height: "56px",
          display: "grid",
          placeItems: "center",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          transition:
            "transform .2s ease, box-shadow .2s ease, background .2s ease",
          zIndex: 10001,
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
    </div>
  );
};

export default Takeaway;
