
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaSignLanguage } from "react-icons/fa";
import restaurantBg from "../assets/images/restaurant-img.jpg";
export default function FloatingSignLanguageButton({
  accessibilityMode,
  setAccessibilityMode,
  activeModal,
  setActiveModal,
  translations,
}) {
  const [name, setName] = useState("");
  const [letters, setLetters] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [formedLetters, setFormedLetters] = useState([]);
  const [shownImages, setShownImages] = useState([]);
  const showModal = activeModal === "sign";
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
  const toggleModal = () => {
    if (!showModal) {
      setName("");
      setLetters([]);
      setFormedLetters([]);
      setShownImages([]);
      setCurrentIndex(0);
    }
    setActiveModal(showModal ? null : "sign");
  };
  const t = (key) => translations?.[key] || key;
  const bottomPositionSign = activeModal === 'pdf' 
    ? '10rem'
    : activeModal === 'sign' 
    ? '8rem'
    : '1.5rem';
  const btnClass = accessibilityMode
    ? 'bg-[#00BFFF] hover:bg-blue-400 text-black'
    : 'bg-[#f28500] hover:bg-[#d77400] text-white';
  return (
    <>
      {/* Hide button when ANY modal is active */}
      {!activeModal && (
        <button
          onClick={toggleModal}
          className={`fixed p-4 rounded-full shadow-lg transition-all duration-300 flex items-center gap-2 z-35
            w-[60px] h-[60px] justify-center
            sm:w-auto sm:h-auto sm:min-w-[160px] sm:justify-start sm:px-4 sm:py-3
            ${btnClass}`}
          style={{
            right: '1.5rem',
            bottom: bottomPositionSign
          }}
        >
          <FaSignLanguage className="text-xl flex-shrink-0" />
          <span className="hidden sm:inline font-medium text-sm whitespace-nowrap">
            {showModal ? t("closeSign") : t("signName")}
          </span>
        </button>
      )}
      <style jsx>{`
        @media (min-width: 640px) {
          button[style*="right: 1.5rem"] {
            right: 12.5rem !important;
          }
        }
      `}</style>
      {/* Modal with completely opaque background */}
      {showModal && (
        <div className="fixed inset-0 z-55">
          {/* Solid background overlay to hide everything underneath */}
          <div
            className={`absolute inset-0 bg-cover bg-center ${
              accessibilityMode ? "brightness-50 grayscale" : ""
            }`}
            style={{ backgroundImage: `url(${restaurantBg})` }}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-lg"></div>
          </div>
          <div
            className={`relative z-60 min-h-screen w-full flex flex-col items-center justify-center px-4 py-6 sm:p-6 ${
              accessibilityMode ? "text-[#00BFFF]" : "text-white"
            }`}
          >
            <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-center drop-shadow-md">
              {t("makeNameSpeak")}
            </h1>
            <input
              className={`border p-2 rounded mb-4 w-full max-w-[250px] text-center text-base font-semibold shadow-md outline-none ${
                accessibilityMode 
                  ? "bg-black border-[#00BFFF] text-[#00BFFF] placeholder-[#00BFFF]" 
                  : "bg-white/10 border-white text-white placeholder-gray-300"
              }`}
              type="text"
              placeholder={t("enterYourName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              onClick={handleShowSign}
              style={accessibilityMode ? {backgroundColor: "#00BFFF", color: "black"} : {backgroundColor: "#facc15", color: "black"}}
              className="mt-2 font-bold px-4 py-2 rounded-full text-base shadow-md transition-transform transform hover:scale-105"
            >
              {t("showInSignLanguage")}
            </button>
            <div className="mt-8 w-full overflow-x-auto">
              <div className="flex justify-center gap-2 px-4 min-w-fit">
                <AnimatePresence>
                  {shownImages.map((letter, idx) => {
                    const src = `/sign-language/${letter}.jpg`;
                    return (
                      <motion.img
                        key={idx}
                        src={src}
                        alt={letter}
                        className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
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
                  >
                    {char}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            {/* FIXED: More rounded close button */}
            <button
              onClick={() => setActiveModal(null)}
              style={accessibilityMode ? {backgroundColor: "#00BFFF", color: "black"} : {backgroundColor: "#f28500", color: "white"}}
              className="absolute top-4 right-4 w-10 h-10 rounded-full cursor-pointer z-70 hover:opacity-80 transition-all duration-300 flex items-center justify-center text-lg font-bold shadow-lg hover:scale-110"
              title={t("close")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}