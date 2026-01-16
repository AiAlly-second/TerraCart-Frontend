import React, { useEffect, useState } from "react";
import {
  FaExclamationTriangle,
  FaQuestionCircle,
  FaTimes,
} from "react-icons/fa";
import "./Confirm.css";

const Confirm = ({
  title,
  message,
  warningMessage,
  onConfirm,
  onCancel,
  confirmText = "OK",
  cancelText = "Cancel",
  danger = false,
}) => {
  const [isAccessibilityMode, setIsAccessibilityMode] = useState(false);

  useEffect(() => {
    const checkAccessibilityMode = () => {
      const fromStorage = localStorage.getItem("accessibilityMode") === "true";
      const fromDocument =
        document.body.classList.contains("accessibility-mode") ||
        document.querySelector(".accessibility-mode") !== null;
      setIsAccessibilityMode(fromStorage || fromDocument);
    };

    checkAccessibilityMode();

    const handleStorageChange = () => checkAccessibilityMode();
    window.addEventListener("storage", handleStorageChange);

    const observer = new MutationObserver(() => checkAccessibilityMode());
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const interval = setInterval(checkAccessibilityMode, 200);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className={`confirm-modal ${
          isAccessibilityMode ? "accessibility-mode" : ""
        } ${danger ? "confirm-danger" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-header">
          {danger ? (
            <FaExclamationTriangle className="confirm-icon confirm-icon-danger" />
          ) : (
            <FaQuestionCircle className="confirm-icon confirm-icon-info" />
          )}
          <h3 className="confirm-title">{title}</h3>
        </div>

        {warningMessage && (
          <div className="confirm-warning">{warningMessage}</div>
        )}

        <div className="confirm-content">
          <p className="confirm-message">{message}</p>
        </div>

        <div className="confirm-actions">
          <button
            onClick={onCancel}
            className="confirm-button confirm-button-cancel"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`confirm-button confirm-button-confirm ${
              danger ? "confirm-button-danger" : ""
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Confirm;


















































