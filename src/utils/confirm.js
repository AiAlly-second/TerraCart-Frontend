/**
 * Custom confirm utility that replaces native browser confirm()
 * This function uses the ConfirmContext to show styled confirmation modals
 */

let confirmContext = null;

// Set the confirm context (called from components that have access to useConfirm)
export const setConfirmContext = (context) => {
  confirmContext = context;
};

// Main confirm function that mimics native confirm() but uses custom UI
export const confirm = async (message, options = {}) => {
  if (!confirmContext) {
    // Fallback to native confirm if context is not available
    console.warn(
      "Confirm context not available, falling back to native confirm"
    );
    return await window.confirm(message);
  }

  // Determine if it's a dangerous action
  const lowerMessage = String(message).toLowerCase();
  const isDanger =
    options.danger !== undefined
      ? options.danger
      : lowerMessage.includes("delete") ||
        lowerMessage.includes("remove") ||
        lowerMessage.includes("cancel") ||
        lowerMessage.includes("permanent") ||
        lowerMessage.includes("cannot be undone");

  // Show the confirmation modal
  return await confirmContext.showConfirm({
    title: options.title || (isDanger ? "Confirm Action" : "Confirmation"),
    message: String(message),
    warningMessage: options.warningMessage || "",
    confirmText: options.confirmText || "OK",
    cancelText: options.cancelText || "Cancel",
    danger: isDanger,
  });
};


















































