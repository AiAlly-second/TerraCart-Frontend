import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Using the correct circular TerraCart logo (jpeg version)
import logo from "../assets/images/logo_new.jpeg";

export default function AppLoader() {
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Preload logo image
  useEffect(() => {
    const img = new Image();
    img.src = logo;
    img.onload = () => {
      setLogoLoaded(true);
    };
    img.onerror = () => {
      console.error("Failed to load logo image");
      setLogoError(true);
      setLogoLoaded(true); // Show loader even if logo fails
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'transparent',
        pointerEvents: 'all',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="flex flex-col items-center justify-center w-full h-full"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* TerraCart Logo with Bouncing Animation - Medium size, smaller on desktop */}
        {logoLoaded && !logoError && (
          <motion.img
            src={logo}
            alt="TerraCart Logo"
            className="object-contain"
            style={{
              width: 'clamp(150px, 30vw, 180px)',
              height: 'clamp(150px, 30vw, 180px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: 1,
              y: [0, -30, 0],
              scale: [1, 1.08, 1],
            }}
            transition={{
              opacity: { duration: 0.3 },
              y: {
                duration: 1.2,
                repeat: Infinity,
                ease: [0.4, 0, 0.6, 1],
              },
              scale: {
                duration: 1.2,
                repeat: Infinity,
                ease: [0.4, 0, 0.6, 1],
              },
            }}
          />
        )}
        
        {/* Fallback if logo doesn't load */}
        {logoError && (
          <motion.div
            className="flex items-center justify-center bg-[#d97706] rounded-full"
            style={{
              width: 'clamp(150px, 30vw, 180px)',
              height: 'clamp(150px, 30vw, 180px)',
            }}
            animate={{
              y: [0, -30, 0],
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: [0.4, 0, 0.6, 1],
            }}
          >
            <span className="text-white text-4xl sm:text-5xl md:text-6xl font-bold">TC</span>
          </motion.div>
        )}

        {/* Loading placeholder while logo loads */}
        {!logoLoaded && (
          <motion.div
            className="bg-gray-200 rounded-lg"
            style={{
              width: 'clamp(150px, 30vw, 180px)',
              height: 'clamp(150px, 30vw, 180px)',
            }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
