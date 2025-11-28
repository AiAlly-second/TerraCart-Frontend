import React from 'react';
import Header from '../components/Header';
import bgImage from '../assets/images/restaurant-img.jpg';
import translations from '../data/translations/Takeaway.json';

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
          <h1 className="text-2xl sm:text-2xl font-bold">
            {t.title}
          </h1>
        </div>
      </div>
    </div>
  );
};

export default Takeaway;
