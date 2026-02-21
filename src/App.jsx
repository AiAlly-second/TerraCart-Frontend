import { useState, lazy, Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Landing from "./pages/Landing";
import SecondPage from "./pages/SecondPage";
import { AlertProvider } from "./context/AlertContext";
import AlertInitializer from "./components/AlertInitializer";
import { ConfirmProvider } from "./context/ConfirmContext";
import ConfirmInitializer from "./components/ConfirmInitializer";
import AccessibilityTools from "./components/AccessibilityTools";
import Footer from "./components/Footer";
import Loader from "./components/Loader";
import AppLoader from "./components/AppLoader";
import { useTablePersistence } from "./hooks/useTablePersistence";
import {
  getCurrentLanguage,
  subscribeToLanguageChanges,
} from "./utils/language";

// Lazy load heavy components for better performance
const Menu = lazy(() => import("./pages/Menu"));
const OrderSummary = lazy(() => import("./pages/OrderSummary"));
const OrderConfirmed = lazy(() => import("./pages/OrderConfirmed"));
const Billing = lazy(() => import("./pages/Billing"));
const Payment = lazy(() => import("./pages/Payment"));
const Takeaway = lazy(() => import("./pages/Takeaway"));
const CartPage = lazy(() => import("./pages/CartPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const SignLanguage = lazy(() => import("./pages/SignLanguage"));
const SignName = lazy(() => import("./pages/SignName"));
const BlindAssistantPage = lazy(() => import("./pages/BlindAssistantPage"));

export default function App() {
  const [activeModal, setActiveModal] = useState(null); // "pdf" | "sign" | null
  const [isAppReady, setIsAppReady] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(getCurrentLanguage());
  
  // Maintain table parameter across navigation
  useTablePersistence();

  // Show loader until app is ready with proper synchronization
  useEffect(() => {
    const startTime = Date.now();
    const MIN_DISPLAY_TIME = 2500; // Minimum 2.5 seconds to show loader
    let loadTimer = null;
    let minDisplayTimer = null;

    // Always wait for minimum time first - this ensures loader is always visible
    const initialDelay = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(300, MIN_DISPLAY_TIME - elapsed);
      
      // After minimum time, check if page is loaded
      if (document.readyState === "complete") {
        // Page already loaded, wait remaining time then hide
        minDisplayTimer = setTimeout(() => {
          setIsAppReady(true);
        }, remainingTime);
      } else {
        // Wait for load event
        const handleLoad = () => {
          if (loadTimer) clearTimeout(loadTimer);
          const timeElapsed = Date.now() - startTime;
          const timeRemaining = Math.max(300, MIN_DISPLAY_TIME - timeElapsed);
          
          minDisplayTimer = setTimeout(() => {
            setIsAppReady(true);
          }, timeRemaining);
        };
        
        window.addEventListener("load", handleLoad);
        // Fallback: hide loader after max 5 seconds even if load event doesn't fire
        loadTimer = setTimeout(() => {
          window.removeEventListener("load", handleLoad);
          const timeElapsed = Date.now() - startTime;
          const timeRemaining = Math.max(300, MIN_DISPLAY_TIME - timeElapsed);
          
          minDisplayTimer = setTimeout(() => {
            setIsAppReady(true);
          }, timeRemaining);
        }, 5000);
      }
    }, MIN_DISPLAY_TIME);

    return () => {
      clearTimeout(initialDelay);
      if (loadTimer) clearTimeout(loadTimer);
      if (minDisplayTimer) clearTimeout(minDisplayTimer);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToLanguageChanges((language) => {
      setCurrentLanguage(language);
    });
    return unsubscribe;
  }, []);

  return (
    <>
      {/* App Loader with smooth exit animation - overlays on top with z-50 */}
      <AnimatePresence>
        {!isAppReady && <AppLoader key="app-loader" />}
      </AnimatePresence>

      {/* Main App Content - only render when ready to prevent flash */}
      {isAppReady && (
        <AlertProvider>
          <ConfirmProvider>
            <AlertInitializer />
            <ConfirmInitializer />
            <>
            {/* Uncomment these if you want to use them alongside accessibility tools */}
            {/* <FloatingPDFButton
          accessibilityMode={false}
          activeModal={activeModal}
          setActiveModal={setActiveModal}
        />
        <FloatingSignLanguageButton
          accessibilityMode={false}
          activeModal={activeModal}
          setActiveModal={setActiveModal}
        /> */}

            <div>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/secondpage" element={<SecondPage />} />
                <Route
                  path="/menu"
                  element={
                    <Suspense fallback={<Loader />}>
                      <Menu />
                    </Suspense>
                  }
                />
                <Route
                  path="/cart"
                  element={
                    <Suspense fallback={<Loader />}>
                      <CartPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/order-summary"
                  element={
                    <Suspense fallback={<Loader />}>
                      <OrderSummary />
                    </Suspense>
                  }
                />
                <Route
                  path="/order-confirmed"
                  element={
                    <Suspense fallback={<Loader />}>
                      <OrderConfirmed />
                    </Suspense>
                  }
                />
                <Route
                  path="/billing"
                  element={
                    <Suspense fallback={<Loader />}>
                      <Billing />
                    </Suspense>
                  }
                />
                <Route
                  path="/payment"
                  element={
                    <Suspense fallback={<Loader />}>
                      <Payment />
                    </Suspense>
                  }
                />
                <Route
                  path="/takeaway"
                  element={
                    <Suspense fallback={<Loader />}>
                      <Takeaway />
                    </Suspense>
                  }
                />
                <Route
                  path="/feedback"
                  element={
                    <Suspense fallback={<Loader />}>
                      <FeedbackPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/sign-name"
                  element={
                    <Suspense fallback={<Loader />}>
                      <SignName />
                    </Suspense>
                  }
                />
                <Route
                  path="/sign-language"
                  element={
                    <Suspense fallback={<Loader />}>
                      <SignLanguage />
                    </Suspense>
                  }
                />
                <Route
                  path="/blind-assistant"
                  element={
                    <Suspense fallback={<Loader />}>
                      <BlindAssistantPage />
                    </Suspense>
                  }
                />
              </Routes>

              {/* Accessibility Tools - appears on all pages */}
              <AccessibilityTools />

              {/* Footer */}
              <Footer />
            </div>
          </>
        </ConfirmProvider>
      </AlertProvider>
      )}
    </>
  );
}
