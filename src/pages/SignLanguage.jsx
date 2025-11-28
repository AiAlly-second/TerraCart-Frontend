import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { FiArrowLeft } from "react-icons/fi";

import m1 from "../assets/images/m1.png";
import m2 from "../assets/images/m2.png";
import restaurantBg from "../assets/images/restaurant-img.jpg";

export default function SignLanguage({ accessibilityMode, translations }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const pages = [m1, m2];

  const prevPage = () => {
    if (page > 0) setPage((p) => p - 1);
  };

  const nextPage = () => {
    if (page < pages.length - 1) setPage((p) => p + 1);
  };

  const t = (key) => translations?.[key] || key;

  return (
    <div className="relative min-h-screen w-full">
      {/* Background */}
      <div
        className={`absolute inset-0 bg-cover bg-center ${
          accessibilityMode ? "brightness-50 grayscale" : ""
        }`}
        style={{ backgroundImage: `url(${restaurantBg})` }}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-lg"></div>
      </div>

      {/* Back Arrow */}
      <button
        onClick={() => navigate(-1)}
        className={`absolute top-4 left-4 z-30 p-2 rounded-md border transition ${
          accessibilityMode
            ? "border-blue-400 text-white hover:bg-[#222]"
            : "border-[#e2c1ac] text-white hover:bg-[#f3ddcb]"
        }`}
        title="Go Back"
      >
        <FiArrowLeft size={20} />
      </button>

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-6 sm:p-6 ${
          accessibilityMode ? "text-[#00BFFF]" : "text-white"
        }`}
      >
        {/* Previous Page Button */}
        <button
          onClick={prevPage}
          disabled={page === 0}
          className={`absolute left-4 sm:left-6 p-3 rounded-full text-2xl z-20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 ${
            accessibilityMode
              ? "bg-[#00BFFF] text-black hover:bg-blue-400"
              : "bg-[#f28500] text-white hover:bg-[#d77400]"
          }`}
          title="Previous Page"
        >
          <FaChevronLeft />
        </button>

        {/* Image */}
        <img
          src={pages[page]}
          alt={`Page ${page + 1}`}
          className="max-h-[85vh] max-w-[90vw] object-contain"
        />

        {/* Next Page Button */}
        <button
          onClick={nextPage}
          disabled={page === pages.length - 1}
          className={`absolute right-4 sm:right-6 p-3 rounded-full text-2xl z-20 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-110 ${
            accessibilityMode
              ? "bg-[#00BFFF] text-black hover:bg-blue-400"
              : "bg-[#f28500] text-white hover:bg-[#d77400]"
          }`}
          title="Next Page"
        >
          <FaChevronRight />
        </button>

        {/* Page Indicators */}
        {pages.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
            <div className="flex gap-2">
              {pages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setPage(idx)}
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
