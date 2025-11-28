import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import translations from "../data/translations/signname.json";

export default function SignName({ accessibilityMode }) {
  const navigate = useNavigate();

  // Read language from localStorage with a safe fallback
  const language = (() => {
    try {
      return localStorage.getItem("language") || "en";
    } catch {
      return "en";
    }
  })();

  // Tiny local t() with fallback to English -> key
  const t = (key) =>
    (translations[language] && translations[language][key]) ||
    (translations.en && translations.en[key]) ||
    key;

  const [name, setName] = useState("");
  const [letters, setLetters] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [formedLetters, setFormedLetters] = useState([]);
  const [shownImages, setShownImages] = useState([]);

  const handleShowSign = () => {
    if (!name.trim()) return;
    const chars = name
      .toUpperCase()
      .split("")
      .filter((c) => /[A-Z]/.test(c));
    setLetters(chars);
    setFormedLetters([]);
    setShownImages([]);
    setCurrentIndex(0);
  };

  useEffect(() => {
    if (letters.length > 0 && currentIndex < letters.length) {
      const timer = setTimeout(() => {
        setFormedLetters((prev) => [...prev, letters[currentIndex]]);
        setShownImages((prev) => [...prev, letters[currentIndex]]);
        setCurrentIndex((prev) => prev + 1);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, letters]);

  // LIGHT PEACH THEME (no card)
  const peachBg = "rgba(255, 243, 230, 0.92)"; // page overlay
  const peachAccent = "#F7B27A";
  const peachChip = "rgba(255, 240, 225, 0.85)";
  const btn = "#F9A04B";
  const btnHover = "#E68E3A";
  const textPrimary = accessibilityMode ? "#111827" : "#4A2C2A";
  const inputBg = accessibilityMode ? "#FFFFFF" : "rgba(255,255,255,0.85)";
  const inputBorder = accessibilityMode ? "#111827" : peachAccent;

  return (
    <div className="relative min-h-screen w-full">
      {/* Background image with light peach veil */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${restaurantBg})` }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: peachBg, backdropFilter: "blur(2px)" }}
        />
      </div>

      {/* Content: full-page layout (no card) */}
      <div
        className="relative z-10 min-h-screen w-full flex flex-col items-center justify-center px-4 py-10"
        style={{ color: textPrimary }}
      >
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 p-3 rounded-full shadow-md text-lg font-bold hover:scale-110 transition-all border"
          title={t("back")}
          aria-label={t("back")}
          style={{
            backgroundColor: accessibilityMode ? "#FFFFFF" : btn,
            color: accessibilityMode ? "#111827" : "#1F2937",
            borderColor: accessibilityMode ? "#111827" : btn,
          }}
          onMouseOver={(e) => {
            if (!accessibilityMode) e.currentTarget.style.backgroundColor = btnHover;
          }}
          onMouseOut={(e) => {
            if (!accessibilityMode) e.currentTarget.style.backgroundColor = btn;
          }}
        >
          <FaArrowLeft />
        </button>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-6 text-center">
          {t("title")}
        </h1>

        {/* Input + CTA */}
        <div className="flex flex-col items-center">
          <input
            className="border rounded w-full max-w-[320px] text-center text-base font-semibold shadow-sm outline-none px-3 py-2 placeholder-opacity-80 mb-3"
            type="text"
            placeholder={t("placeholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              backgroundColor: inputBg,
              borderColor: inputBorder,
              color: textPrimary,
            }}
          />

          <button
            onClick={handleShowSign}
            className="font-bold px-5 py-2.5 rounded-full text-base shadow-md transition-transform transform hover:scale-[1.03] border"
            style={{
              backgroundColor: btn,
              color: "#1F2937",
              borderColor: btn,
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = btnHover)}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = btn)}
          >
            {t("cta")}
          </button>
        </div>

        {/* Sign language images */}
        <div className="mt-8 w-full overflow-x-auto">
          <div className="flex justify-center gap-2 px-2 sm:px-4 min-w-fit">
            <AnimatePresence>
              {shownImages.map((letter, idx) => {
                const src = `/sign-language/${letter}.jpg`;
                return (
                  <motion.img
                    key={idx}
                    src={src}
                    alt={letter}
                    className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0 rounded-lg"
                    style={{
                      backgroundColor: "#FFF8F1",
                      border: `1px solid ${peachAccent}`,
                    }}
                    initial={
                      idx === 0
                        ? { opacity: 0, scale: 0.3, rotate: -10 }
                        : { opacity: 0, x: -50, scale: 0.5 }
                    }
                    animate={
                      idx === 0
                        ? {
                            opacity: [0, 1, 0.6, 1],
                            scale: [0.3, 1.1, 0.9, 1],
                            rotate: [-10, 10, -5, 0],
                          }
                        : { opacity: 1, x: 0, scale: 1 }
                    }
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: idx === 0 ? 1 : 0.6,
                      type: idx === 0 ? "tween" : "spring",
                      bounce: 0.4,
                      delay: idx * 0.05,
                    }}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Letters */}
        <div className="flex mt-6 gap-2 text-2xl sm:text-4xl font-extrabold tracking-wide flex-wrap justify-center">
          <AnimatePresence>
            {formedLetters.map((char, idx) => (
              <motion.span
                key={idx}
                initial={{ opacity: 0, y: -50, rotate: -90, scale: 0.3 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                transition={{
                  duration: 0.6,
                  type: "spring",
                  bounce: 0.5,
                  delay: idx * 0.05,
                }}
                className="rounded-md px-1"
                style={{
                  color: textPrimary,
                  backgroundColor: peachChip,
                  border: `1px solid ${peachAccent}`,
                }}
              >
                {char}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
