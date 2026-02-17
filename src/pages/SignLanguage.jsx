import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { FiArrowLeft } from "react-icons/fi";
import m1 from "../assets/images/m1.png";
import m2 from "../assets/images/m2.png";
import restaurantBg from "../assets/images/restaurant-img.jpg";
import signLanguageTranslations from "../data/translations/signLanguage.json";
import {
  getCurrentLanguage,
  subscribeToLanguageChanges,
} from "../utils/language";

export default function SignLanguage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [language, setLanguage] = useState(getCurrentLanguage());
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true",
  );
  const pages = [m1, m2];
  const t = (key) =>
    signLanguageTranslations[language]?.[key] ||
    signLanguageTranslations.en?.[key] ||
    key;

  useEffect(() => {
    const unsubscribeLanguage = subscribeToLanguageChanges((lang) => {
      setLanguage(lang);
    });
    const handleAccessibilityChange = () => {
      setAccessibilityMode(localStorage.getItem("accessibilityMode") === "true");
    };
    window.addEventListener("storage", handleAccessibilityChange);
    window.addEventListener("language-change", handleAccessibilityChange);
    return () => {
      unsubscribeLanguage();
      window.removeEventListener("storage", handleAccessibilityChange);
      window.removeEventListener("language-change", handleAccessibilityChange);
    };
  }, []);

  const prevPage = () => {
    if (page > 0) setPage((p) => p - 1);
  };

  const nextPage = () => {
    if (page < pages.length - 1) setPage((p) => p + 1);
  };

  return (
    <div className="relative min-h-screen w-full">
      <div
        className={`absolute inset-0 bg-cover bg-center ${
          accessibilityMode ? "brightness-50 grayscale" : ""
        }`}
        style={{ backgroundImage: `url(${restaurantBg})` }}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-lg"></div>
      </div>

      <button
        onClick={() => navigate(-1)}
        className={`absolute top-4 left-4 z-30 p-2 rounded-md border transition ${
          accessibilityMode
            ? "border-blue-400 text-white hover:bg-[#222]"
            : "border-[#e2c1ac] text-white hover:bg-[#f3ddcb]"
        }`}
        title={t("goBack")}
        aria-label={t("goBack")}
      >
        <FiArrowLeft size={20} />
      </button>

      <div
        className={`relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-6 sm:p-6 ${
          accessibilityMode ? "text-[#00BFFF]" : "text-white"
        }`}
      >
        <button
          onClick={prevPage}
          disabled={page === 0}
          className={`absolute left-4 sm:left-6 p-3 rounded-full text-2xl z-20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 ${
            accessibilityMode
              ? "bg-[#00BFFF] text-black hover:bg-blue-400"
              : "bg-[#f28500] text-white hover:bg-[#d77400]"
          }`}
          title={t("previousPage")}
          aria-label={t("previousPage")}
        >
          <FaChevronLeft />
        </button>

        <img
          src={pages[page]}
          alt={`${t("pageAlt")} ${page + 1}`}
          className="max-h-[85vh] max-w-[90vw] object-contain"
        />

        <button
          onClick={nextPage}
          disabled={page === pages.length - 1}
          className={`absolute right-4 sm:right-6 p-3 rounded-full text-2xl z-20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 ${
            accessibilityMode
              ? "bg-[#00BFFF] text-black hover:bg-blue-400"
              : "bg-[#f28500] text-white hover:bg-[#d77400]"
          }`}
          title={t("nextPage")}
          aria-label={t("nextPage")}
        >
          <FaChevronRight />
        </button>

        {pages.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
            <div className="flex gap-2">
              {pages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setPage(idx)}
                  aria-label={`${t("pageAlt")} ${idx + 1}`}
                  className={`w-3 h-3 rounded-full transition-all ${
                    idx === page
                      ? accessibilityMode
                        ? "bg-[#00BFFF]"
                        : "bg-[#f28500]"
                      : "bg-white/50 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
