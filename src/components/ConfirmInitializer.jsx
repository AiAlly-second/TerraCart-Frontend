import { useEffect } from "react";
import { useConfirm } from "../context/ConfirmContext";
import { setConfirmContext } from "../utils/confirm";

/**
 * Component that initializes the confirm utility with the ConfirmContext
 * This allows the confirm() function in utils/confirm.js to work throughout the app
 * Also overrides window.confirm to use custom UI
 */
const ConfirmInitializer = () => {
  const confirmContext = useConfirm();

  useEffect(() => {
    // Set the confirm context so the utility function can use it
    setConfirmContext(confirmContext);

    // Override window.confirm globally to use custom UI
    const originalConfirm = window.confirm;
    window.confirm = async (message) => {
      if (!message) return false;

      const messageStr = String(message).toLowerCase();
      // Auto-detect dangerous actions
      const isDanger =
        messageStr.includes("cancel") ||
        messageStr.includes("delete") ||
        messageStr.includes("remove") ||
        messageStr.includes("permanent") ||
        messageStr.includes("cannot be undone");

      // Use custom confirm dialog
      return await confirmContext.showConfirm({
        title: isDanger ? "Confirm Action" : "Confirmation",
        message: String(message),
        confirmText: "OK",
        cancelText: "Cancel",
        danger: isDanger,
      });
    };

    // Cleanup: restore original confirm on unmount
    return () => {
      window.confirm = originalConfirm;
    };
  }, [confirmContext]);

  return null; // This component doesn't render anything
};

export default ConfirmInitializer;
















































