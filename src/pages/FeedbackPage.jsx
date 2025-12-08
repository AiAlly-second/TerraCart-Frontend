import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaStar } from "react-icons/fa";
import Header from "../components/Header";
import bgImage from "../assets/images/restaurant-img.jpg";
import "./FeedbackPage.css";

const nodeApi = (import.meta.env.VITE_NODE_API_URL || "http://localhost:5001").replace(/\/$/, "");

export default function FeedbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const orderId = location.state?.orderId || localStorage.getItem("terra_orderId") || localStorage.getItem("terra_lastPaidOrderId");
  
  const [accessibilityMode, setAccessibilityMode] = useState(
    localStorage.getItem("accessibilityMode") === "true"
  );

  // Overall rating (required)
  const [overallRating, setOverallRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  // Food Quality rating (optional)
  const [foodQuality, setFoodQuality] = useState(0);
  const [hoverFoodQuality, setHoverFoodQuality] = useState(0);

  // Service Quality rating (optional)
  const [serviceQuality, setServiceQuality] = useState(0);
  const [hoverServiceQuality, setHoverServiceQuality] = useState(0);

  // Comments (optional)
  const [comments, setComments] = useState("");

  // Customer information (optional)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

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
    
    if (overallRating === 0) {
      setError("Please provide an overall rating");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const feedbackData = {
        orderId: orderId || undefined,
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

      // Remove empty nested fields
      if (!feedbackData.orderFeedback.foodQuality && 
          !feedbackData.orderFeedback.serviceSpeed && 
          !feedbackData.orderFeedback.comments) {
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
        throw new Error(errorData.message || "Failed to submit feedback");
      }

    setSubmitted(true);
      setTimeout(() => {
        navigate("/menu");
      }, 3000);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={`feedback-page ${accessibilityMode ? "accessibility-mode" : ""}`}>
        <div className="background-container">
          <img src={bgImage} alt="Restaurant" className="background-image" />
          <div className="background-overlay" />
        </div>
        <div className="content-wrapper">
          <Header />
          <div className="main-content">
            <div className="feedback-card success-card">
              <div className="success-icon">✓</div>
              <h2 className="success-title">Thank You!</h2>
              <p className="success-message">
                Your feedback has been submitted successfully. We appreciate your time!
              </p>
              <p className="redirect-message">Redirecting to menu...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`feedback-page ${accessibilityMode ? "accessibility-mode" : ""}`}>
      <div className="background-container">
        <img src={bgImage} alt="Restaurant" className="background-image" />
        <div className="background-overlay" />
      </div>
      <div className="content-wrapper">
        <Header />
        <div className="main-content">
          <form className="feedback-card" onSubmit={handleSubmit}>
            <h2 className="feedback-title">Share Your Feedback</h2>
            <p className="feedback-subtitle">We value your opinion!</p>

            {error && <div className="error-message">{error}</div>}

            {/* Overall Rating - Required */}
            <div className="section">
              <h3 className="section-title">How was your experience? *</h3>
              <StarRating
                rating={overallRating}
                setRating={setOverallRating}
                hover={hoverRating}
                setHover={setHoverRating}
                label=""
              />
            </div>

            {/* Food Quality Rating - Optional */}
            <div className="section">
              <h3 className="section-title">Food Quality</h3>
              <StarRating
                rating={foodQuality}
                setRating={setFoodQuality}
                hover={hoverFoodQuality}
                setHover={setHoverFoodQuality}
                label=""
              />
            </div>

            {/* Service Quality Rating - Optional */}
            <div className="section">
              <h3 className="section-title">Service Quality</h3>
              <StarRating
                rating={serviceQuality}
                setRating={setServiceQuality}
                hover={hoverServiceQuality}
                setHover={setHoverServiceQuality}
                label=""
              />
            </div>

            {/* Comments - Optional */}
            <div className="section">
              <div className="input-group">
                <label className="input-label">Comments (Optional)</label>
                <textarea
                  className="feedback-textarea"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Tell us what you liked or how we can improve..."
                  rows={4}
                />
              </div>
            </div>

            {/* Customer Information - Optional */}
            <div className="section">
              <h3 className="section-title">Your Information (Optional)</h3>
              <p className="section-subtitle" style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}>
                Help us track your visits and improve your experience
              </p>
              
              <div className="input-group">
                <label className="input-label">Name (Optional)</label>
                <input
                  type="text"
                  className="feedback-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>

              <div className="input-group" style={{ marginTop: "1rem" }}>
                <label className="input-label">Phone Number (Optional)</label>
                <input
                  type="tel"
                  className="feedback-input"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  pattern="[0-9]{10}"
                />
                <small style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem", display: "block" }}>
                  We'll use this to track your visit history and provide better service
                </small>
              </div>

              <div className="input-group" style={{ marginTop: "1rem" }}>
                <label className="input-label">Email (Optional)</label>
                <input
                  type="email"
                  className="feedback-input"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Enter your email address"
                />
                <small style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem", display: "block" }}>
                  Optional - helps us match your previous visits
                </small>
              </div>
        </div>

            {/* Submit Button */}
            <div className="button-group">
              <button
                type="button"
                className="cancel-button"
                onClick={() => navigate("/menu")}
                disabled={submitting}
              >
                Skip
              </button>
              <button
                type="submit"
                className="submit-button"
                disabled={submitting || overallRating === 0}
              >
                {submitting ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
