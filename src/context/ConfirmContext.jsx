import React, { createContext, useContext, useState, useCallback } from "react";
import Confirm from "../components/Confirm";

const ConfirmContext = createContext();

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
};

export const ConfirmProvider = ({ children }) => {
  const [confirmState, setConfirmState] = useState(null);

  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({
        ...options,
        onConfirm: () => {
          setConfirmState(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmState(null);
          resolve(false);
        },
      });
    });
  }, []);

  const value = {
    showConfirm,
  };

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {confirmState && (
        <Confirm
          title={confirmState.title}
          message={confirmState.message}
          warningMessage={confirmState.warningMessage}
          onConfirm={confirmState.onConfirm}
          onCancel={confirmState.onCancel}
          confirmText={confirmState.confirmText || "OK"}
          cancelText={confirmState.cancelText || "Cancel"}
          danger={confirmState.danger || false}
        />
      )}
    </ConfirmContext.Provider>
  );
};















































