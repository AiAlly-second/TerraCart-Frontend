// Alert utility function for customer frontend
// This allows using alert() function throughout the app with custom UI

let alertContext = null;

export const setAlertContext = (context) => {
  alertContext = context;
};

// Main alert function that mimics native alert() but uses custom UI
export const alert = (message, type = 'info') => {
  if (!alertContext) {
    // Fallback to native alert if context is not available
    console.warn('Alert context not available, falling back to native alert');
    window.alert(message);
    return;
  }

  // Determine alert type from message content if not specified
  if (type === 'info') {
    const lowerMessage = String(message).toLowerCase();
    if (lowerMessage.includes('error') || lowerMessage.includes('failed') || 
        lowerMessage.includes('invalid') || lowerMessage.includes('cannot') ||
        lowerMessage.includes('unable') || lowerMessage.includes('❌')) {
      type = 'error';
    } else if (lowerMessage.includes('success') || lowerMessage.includes('saved') || 
               lowerMessage.includes('created') || lowerMessage.includes('updated') || 
               lowerMessage.includes('deleted') || lowerMessage.includes('completed') ||
               lowerMessage.includes('✅') || lowerMessage.includes('added')) {
      type = 'success';
    } else if (lowerMessage.includes('warning') || lowerMessage.includes('cannot') || 
               lowerMessage.includes('please') || lowerMessage.includes('⚠️') ||
               lowerMessage.includes('⏱️')) {
      type = 'warning';
    }
  }

  // Show the alert using the context
  alertContext.showAlert(message, type, 5000);
};

// Export convenience methods
export const alertSuccess = (message, duration = 5000) => {
  if (alertContext) {
    alertContext.showSuccess(message, duration);
  } else {
    window.alert(message);
  }
};

export const alertError = (message, duration = 5000) => {
  if (alertContext) {
    alertContext.showError(message, duration);
  } else {
    window.alert(message);
  }
};

export const alertWarning = (message, duration = 5000) => {
  if (alertContext) {
    alertContext.showWarning(message, duration);
  } else {
    window.alert(message);
  }
};

export const alertInfo = (message, duration = 5000) => {
  if (alertContext) {
    alertContext.showInfo(message, duration);
  } else {
    window.alert(message);
  }
};

