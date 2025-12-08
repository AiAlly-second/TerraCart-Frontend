import React, { useEffect, useState } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimesCircle, FaTimes } from 'react-icons/fa';
import './Alert.css';

const Alert = ({ message, type = 'info', onClose, duration = 5000 }) => {
  const [isAccessibilityMode, setIsAccessibilityMode] = useState(false);

  useEffect(() => {
    // Check accessibility mode from localStorage and document
    const checkAccessibilityMode = () => {
      const fromStorage = localStorage.getItem('accessibilityMode') === 'true';
      const fromDocument = document.body.classList.contains('accessibility-mode') || 
                          document.querySelector('.accessibility-mode') !== null;
      setIsAccessibilityMode(fromStorage || fromDocument);
    };
    
    checkAccessibilityMode();
    
    // Listen for storage changes
    const handleStorageChange = () => checkAccessibilityMode();
    window.addEventListener('storage', handleStorageChange);
    
    // Watch for class changes on body
    const observer = new MutationObserver(() => checkAccessibilityMode());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    
    // Also check periodically in case localStorage is changed in same window
    const interval = setInterval(checkAccessibilityMode, 200);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    const iconClass = "alert-icon";
    switch (type) {
      case 'success':
        return <FaCheckCircle className={`${iconClass} alert-icon-success`} />;
      case 'error':
        return <FaTimesCircle className={`${iconClass} alert-icon-error`} />;
      case 'warning':
        return <FaExclamationCircle className={`${iconClass} alert-icon-warning`} />;
      default:
        return <FaInfoCircle className={`${iconClass} alert-icon-info`} />;
    }
  };

  return (
    <div className={`alert alert-${type} ${isAccessibilityMode ? 'accessibility-mode' : ''}`}>
      {getIcon()}
      <div className="alert-content">
        <p className="alert-message">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="alert-close-btn"
        aria-label="Close alert"
      >
        <FaTimes />
      </button>
    </div>
  );
};

export default Alert;

