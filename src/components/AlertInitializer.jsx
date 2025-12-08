import { useEffect } from 'react';
import { useAlert } from '../context/AlertContext';
import { setAlertContext } from '../utils/alert';

/**
 * Component that initializes the alert utility with the AlertContext
 * This allows the alert() function in utils/alert.js to work throughout the app
 * Also overrides window.alert to use custom UI
 */
const AlertInitializer = () => {
  const alertContext = useAlert();

  useEffect(() => {
    // Set the alert context so the utility function can use it
    setAlertContext(alertContext);

    // Override window.alert globally to use custom UI
    const originalAlert = window.alert;
    window.alert = (message) => {
      if (!message) return;
      
      // Determine alert type from message content
      const lowerMessage = String(message).toLowerCase();
      let type = 'info';
      
      if (lowerMessage.includes('error') || lowerMessage.includes('failed') || 
          lowerMessage.includes('invalid') || lowerMessage.includes('cannot') ||
          lowerMessage.includes('unable') || lowerMessage.includes('❌')) {
        type = 'error';
      } else if (lowerMessage.includes('success') || lowerMessage.includes('saved') || 
                 lowerMessage.includes('created') || lowerMessage.includes('updated') || 
                 lowerMessage.includes('deleted') || lowerMessage.includes('completed') ||
                 lowerMessage.includes('✅') || lowerMessage.includes('added')) {
        type = 'success';
      } else if (lowerMessage.includes('warning') || lowerMessage.includes('please') || 
                 lowerMessage.includes('⚠️') || lowerMessage.includes('⏱️')) {
        type = 'warning';
      }
      
      // Show custom alert
      alertContext.showAlert(String(message), type, 5000);
    };

    // Cleanup: restore original alert on unmount
    return () => {
      window.alert = originalAlert;
    };
  }, [alertContext]);

  return null; // This component doesn't render anything
};

export default AlertInitializer;

