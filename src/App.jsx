import { useState, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import SecondPage from "./pages/SecondPage";
import { AlertProvider } from "./context/AlertContext";
import AlertInitializer from "./components/AlertInitializer";
import { ConfirmProvider } from "./context/ConfirmContext";
import ConfirmInitializer from "./components/ConfirmInitializer";
import AccessibilityTools from "./components/AccessibilityTools";
import Footer from "./components/Footer";
import Loader from "./components/Loader";

// Lazy load heavy components for better performance
const Menu = lazy(() => import("./pages/Menu"));
const OrderSummary = lazy(() => import("./pages/OrderSummary"));
const OrderConfirmed = lazy(() => import("./pages/OrderConfirmed"));
const Billing = lazy(() => import("./pages/Billing"));
const Payment = lazy(() => import("./pages/Payment"));
const Takeaway = lazy(() => import("./pages/Takeaway"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const SignLanguage = lazy(() => import("./pages/SignLanguage"));
const SignName = lazy(() => import("./pages/SignName"));

export default function App() {
  const [activeModal, setActiveModal] = useState(null); // "pdf" | "sign" | null

  return (
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
          </Routes>

          {/* Accessibility Tools - appears on all pages */}
          <AccessibilityTools />

          {/* Footer */}
          <Footer />
        </>
      </ConfirmProvider>
    </AlertProvider>
  );
}
