import { useState, useEffect } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaRegHandPeace,
} from "react-icons/fa";

import m1 from "../assets/images/m1.png";
import m2 from "../assets/images/m2.png";
import restaurantBg from "../assets/images/restaurant-img.jpg";

export default function FloatingPDFButton({
  accessibilityMode,
  activeModal,
  setActiveModal,
  translations,
}) {
  const [page, setPage] = useState(0);
  const pages = [m1, m2];
  const showModal = activeModal === "pdf";

  const prevPage = () => {
    if (page > 0) setPage((p) => p - 1);
  };

  const nextPage = () => {
    if (page < pages.length - 1) setPage((p) => p + 1);
  };

  const toggleModal = () => {
    if (!showModal) setPage(0);
    setActiveModal(showModal ? null : "pdf");
  };

  const t = (key) => translations?.[key] || key;

  const bottomPositionPdf = activeModal === 'sign' 
    ? '10rem'
    : activeModal === 'pdf' 
    ? '8rem'
    : '1.5rem';

  return (
    <>
      {/* Hide button when ANY modal is active */}
      {!activeModal && (
        <button
          onClick={toggleModal}
          className={`fixed p-4 rounded-full shadow-lg transition-all duration-300 flex items-center gap-2 z-50
            w-[60px] h-[60px] justify-center
            sm:w-auto sm:h-auto sm:min-w-[160px] sm:justify-start sm:px-4 sm:py-3
            ${accessibilityMode 
              ? 'bg-[#00BFFF] hover:bg-blue-400 text-black' 
              : 'bg-[#f28500] hover:bg-[#d77400] text-white'
            }`}
          style={{
            right: '5.5rem',
            bottom: bottomPositionPdf
          }}
        >
          <FaRegHandPeace className="text-lg flex-shrink-0" />
          <span className="hidden sm:inline font-medium text-sm whitespace-nowrap">
            {showModal ? t("back") : t("signLanguage")}
          </span>
        </button>
      )}

      <style jsx>{`
        @media (min-width: 640px) {
          button[style*="right: 5.5rem"] {
            right: 1.5rem !important;
          }
        }
      `}</style>

      {/* Modal with same structure as SignLanguageButton */}
      {showModal && (
        <div className="fixed inset-0 z-55">
          {/* Same background structure as SignLanguageButton */}
          <div
            className={`absolute inset-0 bg-cover bg-center ${
              accessibilityMode ? "brightness-50 grayscale" : ""
            }`}
            style={{ backgroundImage: `url(${restaurantBg})` }}
          >
            {/* Same opacity as SignLanguageButton */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-lg"></div>
          </div>

          {/* Same content structure as SignLanguageButton */}
          <div
            className={`relative z-60 min-h-screen w-full flex items-center justify-center px-4 py-6 sm:p-6 ${
              accessibilityMode ? "text-[#00BFFF]" : "text-white"
            }`}
          >
            
            {/* ADDED BACK: Previous Page Button */}
            <button
              onClick={prevPage}
              disabled={page === 0}
              className={`absolute left-4 sm:left-6 p-3 rounded-full text-2xl z-60 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 ${
                accessibilityMode 
                  ? 'bg-[#00BFFF] text-black hover:bg-blue-400' 
                  : 'bg-[#f28500] text-white hover:bg-[#d77400]'
              }`}
              title="Previous Page"
            >
              <FaChevronLeft />
            </button>

            <img
              src={pages[page]}
              alt={`Page ${page + 1}`}
              className="max-h-[85vh] max-w-[90vw] object-contain"
            />

            {/* ADDED BACK: Next Page Button */}
            <button
              onClick={nextPage}
              disabled={page === pages.length - 1}
              className={`absolute right-4 sm:right-6 p-3 rounded-full text-2xl z-60 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 ${
                accessibilityMode 
                  ? 'bg-[#00BFFF] text-black hover:bg-blue-400' 
                  : 'bg-[#f28500] text-white hover:bg-[#d77400]'
              }`}
              title="Next Page"
            >
              <FaChevronRight />
            </button>

            {/* Close button */}
            <button
              onClick={() => setActiveModal(null)}
              style={accessibilityMode ? {backgroundColor: "#00BFFF", color: "black"} : {backgroundColor: "#f28500", color: "white"}}
              className="absolute top-4 right-4 w-10 h-10 rounded-full cursor-pointer z-70 hover:opacity-80 transition-all duration-300 flex items-center justify-center text-lg font-bold shadow-lg hover:scale-110"
              title={t("close")}
            >
              ✕
            </button>

            {/* Page indicators */}
            {pages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
                <div className="flex gap-2">
                  {pages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPage(idx)}
                      className={`w-3 h-3 rounded-full transition-all ${
                        idx === page 
                          ? (accessibilityMode ? 'bg-[#00BFFF]' : 'bg-[#f28500]')
                          : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
