import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaStar } from "react-icons/fa";
import Header from "../components/Header";
import bgImage from "../assets/images/restaurant-img.jpg";
import feedbackTranslations from "../data/translations/feedbackPage.json";
import {
  getCurrentLanguage,
  subscribeToLanguageChanges,
} from "../utils/language";
import "./FeedbackPage.css";

const nodeApi = (
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

const FEEDBACK_SUBMITTED_ORDERS_KEY = "terra_feedbackSubmittedOrders";

const getStoredSubmittedFeedbackOrderIds = () => {
  try {
    const raw = localStorage.getItem(FEEDBACK_SUBMITTED_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => (id === null || id === undefined ? "" : String(id).trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const hasSubmittedFeedbackForOrder = (orderId) => {
  if (!orderId) return false;
  const normalizedOrderId = String(orderId).trim();
  if (!normalizedOrderId) return false;
  return getStoredSubmittedFeedbackOrderIds().includes(normalizedOrderId);
};

const markFeedbackSubmittedForOrder = (orderId) => {
  if (!orderId) return;
  const normalizedOrderId = String(orderId).trim();
  if (!normalizedOrderId) return;
  const existing = getStoredSubmittedFeedbackOrderIds();
  if (existing.includes(normalizedOrderId)) return;
  existing.push(normalizedOrderId);
  localStorage.setItem(FEEDBACK_SUBMITTED_ORDERS_KEY, JSON.stringify(existing));
};

export default function FeedbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState(getCurrentLanguage());
  const t = (key) =>
    feedbackTranslations[language]?.[key] ||
    feedbackTranslations.en?.[key] ||
    key;

  const orderId =
    location.state?.orderId ||
    localStorage.getItem("terra_orderId_TAKEAWAY") ||
    localStorage.getItem("terra_orderId_DINE_IN") ||
    localStorage.getItem("terra_orderId") ||
    localStorage.getItem("terra_lastPaidOrderId");
  const resolvedOrderId = orderId ? String(orderId).trim() : "";

  const getTableInfo = () => {
    try {
      const tableData = JSON.parse(
        localStorage.getItem("terra_tableSelection") ||
          localStorage.getItem("tableSelection") ||
          "{}",
      );
      return {
        tableId: tableData.id || tableData._id || tableData.tableId,
        cartId: tableData.cartId || tableData.cafeId,
      };
    } catch (e) {
      return {};
    }
  };
  const tableInfo = getTableInfo();

  const [accessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true",
  );
  const [overallRating, setOverallRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [foodQuality, setFoodQuality] = useState(0);
  const [hoverFoodQuality, setHoverFoodQuality] = useState(0);
  const [serviceQuality, setServiceQuality] = useState(0);
  const [hoverServiceQuality, setHoverServiceQuality] = useState(0);
  const [comments, setComments] = useState("");
  const [customerName, setCustomerName] = useState(
    () => localStorage.getItem("terra_takeaway_customerName") || "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    () => localStorage.getItem("terra_takeaway_customerMobile") || "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    () => localStorage.getItem("terra_takeaway_customerEmail") || "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(() =>
    hasSubmittedFeedbackForOrder(orderId),
  );

  useEffect(() => {
    const unsubscribe = subscribeToLanguageChanges((lang) => {
      setLanguage(lang);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setAlreadySubmitted(hasSubmittedFeedbackForOrder(orderId));
  }, [orderId]);

  const StarRating = ({ rating, setRating, hover, setHover, label }) => (
    <div className="rating-group">
      <label className="rating-label">{label}</label>
      <div className="stars-container">
        {[1, 2, 3, 4, 5].map((star) => (
          <FaStar
            key={star}
            className="star-icon"
            color={star <= (hover || rating) ? "#FC8019" : "#d1d5db"}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
          />
        ))}
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (alreadySubmitted) {
      setError(t("alreadySubmittedError"));
      return;
    }

    if (overallRating === 0) {
      setError(t("overallRatingRequired"));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const feedbackData = {
        orderId: resolvedOrderId || undefined,
        tableId: tableInfo.tableId || undefined,
        overallRating,
        orderFeedback: {
          foodQuality: foodQuality || undefined,
          serviceSpeed: serviceQuality || undefined,
          comments: comments.trim() || undefined,
        },
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
      };

      if (
        !feedbackData.orderFeedback.foodQuality &&
        !feedbackData.orderFeedback.serviceSpeed &&
        !feedbackData.orderFeedback.comments
      ) {
        feedbackData.orderFeedback = undefined;
      }

      const response = await fetch(`${nodeApi}/api/feedback/public`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(feedbackData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t("submitFailed"));
      }

      markFeedbackSubmittedForOrder(resolvedOrderId);
      setAlreadySubmitted(true);
      setSubmitted(true);
      setTimeout(() => {
        navigate("/menu");
      }, 3000);
    } catch (err) {
      setError(err.message || t("genericError"));
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className={`feedback-page ${
          accessibilityMode ? "accessibility-mode" : ""
        }`}
      >
        <div className="background-container">
          <img src={bgImage} alt={t("restaurantAlt")} className="background-image" />
          <div className="background-overlay" />
        </div>
        <div className="content-wrapper">
          <Header />
          <div className="main-content">
            <div className="feedback-card success-card">
              <div className="success-icon">OK</div>
              <h2 className="success-title">{t("thankYouTitle")}</h2>
              <p className="success-message">{t("feedbackSubmittedMessage")}</p>
              <p className="redirect-message">{t("redirectMessage")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`feedback-page ${
        accessibilityMode ? "accessibility-mode" : ""
      }`}
    >
      <div className="background-container">
        <img src={bgImage} alt={t("restaurantAlt")} className="background-image" />
        <div className="background-overlay" />
      </div>
      <div className="content-wrapper">
        <Header />
        <div className="main-content">
          <form className="feedback-card" onSubmit={handleSubmit}>
            <h2 className="feedback-title">{t("shareFeedbackTitle")}</h2>
            <p className="feedback-subtitle">{t("shareFeedbackSubtitle")}</p>

            {error && <div className="error-message">{error}</div>}

            <div className="section">
              <h3 className="section-title">{t("overallExperienceTitle")}</h3>
              <StarRating
                rating={overallRating}
                setRating={setOverallRating}
                hover={hoverRating}
                setHover={setHoverRating}
                label=""
              />
            </div>

            <div className="section">
              <h3 className="section-title">{t("foodQualityTitle")}</h3>
              <StarRating
                rating={foodQuality}
                setRating={setFoodQuality}
                hover={hoverFoodQuality}
                setHover={setHoverFoodQuality}
                label=""
              />
            </div>

            <div className="section">
              <h3 className="section-title">{t("serviceQualityTitle")}</h3>
              <StarRating
                rating={serviceQuality}
                setRating={setServiceQuality}
                hover={hoverServiceQuality}
                setHover={setHoverServiceQuality}
                label=""
              />
            </div>

            <div className="section">
              <div className="input-group">
                <label className="input-label">{t("commentsLabel")}</label>
                <textarea
                  className="feedback-textarea"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={t("commentsPlaceholder")}
                  rows={4}
                />
              </div>
            </div>

            <div className="section">
              <h3 className="section-title">{t("yourInfoTitle")}</h3>
              <p
                className="section-subtitle"
                style={{
                  fontSize: "0.875rem",
                  color: "#6b7280",
                  marginBottom: "1rem",
                }}
              >
                {t("yourInfoSubtitle")}
              </p>

              <div className="input-group">
                <label className="input-label">{t("nameLabel")}</label>
                <input
                  type="text"
                  className="feedback-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>

              <div className="input-group" style={{ marginTop: "1rem" }}>
                <label className="input-label">{t("phoneLabel")}</label>
                <input
                  type="tel"
                  className="feedback-input"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={t("phonePlaceholder")}
                  pattern="[0-9]{10}"
                />
                <small
                  style={{
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    marginTop: "0.25rem",
                    display: "block",
                  }}
                >
                  {t("phoneHelper")}
                </small>
              </div>

              <div className="input-group" style={{ marginTop: "1rem" }}>
                <label className="input-label">{t("emailLabel")}</label>
                <input
                  type="email"
                  className="feedback-input"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                />
                <small
                  style={{
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    marginTop: "0.25rem",
                    display: "block",
                  }}
                >
                  {t("emailHelper")}
                </small>
              </div>
            </div>

            <div className="button-group">
              <button
                type="button"
                className="cancel-button"
                onClick={() => navigate("/menu")}
                disabled={submitting}
              >
                {t("skipButton")}
              </button>
              <button
                type="submit"
                className="submit-button"
                disabled={submitting || overallRating === 0 || alreadySubmitted}
              >
                {alreadySubmitted
                  ? t("feedbackSubmittedButton")
                  : submitting
                    ? t("submittingButton")
                    : t("submitButton")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
