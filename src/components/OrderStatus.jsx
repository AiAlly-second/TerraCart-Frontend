import React from "react";
import "./OrderStatus.css";

// UI shows only 3 states; all backend statuses map to one of these (updates when admin changes status)
const DISPLAY_STEPS = {
  DINE_IN: [
    { key: "placed", label: "Order Placed" },
    { key: "preparing", label: "Preparing" },
    { key: "done", label: "Done" },
  ],
  TAKEAWAY: [
    { key: "placed", label: "Order Placed" },
    { key: "preparing", label: "Preparing" },
    { key: "done", label: "Done" },
  ],
};

// Map every backend status -> display step index (0, 1, 2). When admin updates status, current step updates.
const DINE_IN_STATUS_TO_STEP = {
  Pending: 0,
  Confirmed: 0,
  Preparing: 1,
  Ready: 1,
  Served: 1,
  Finalized: 1,
  Paid: 2,
  Cancelled: -1,
  Returned: -1,
};
const TAKEAWAY_STATUS_TO_STEP = {
  Pending: 0,
  Confirmed: 0,
  Accept: 1,
  Accepted: 1,
  "Being Prepared": 1,
  BeingPrepared: 1,
  Completed: 1,
  Paid: 2,
  Exit: 2,
  Cancelled: -1,
  Returned: -1,
};

function getOrderedSteps(serviceType) {
  const key = serviceType === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN";
  return DISPLAY_STEPS[key];
}

function normalizeTakeawayStatus(status) {
  if (status == null || status === "") return "Pending";
  const s = String(status).trim();
  if (s === "Accept") return "Accepted";
  if (s === "BeingPrepared") return "Being Prepared";
  return s;
}

function getCurrentIndex(status, serviceType) {
  const safe = (status ?? "").toString().trim();
  if (serviceType === "TAKEAWAY") {
    const normalized = normalizeTakeawayStatus(safe);
    const step = TAKEAWAY_STATUS_TO_STEP[normalized];
    if (step !== undefined && step >= 0) return step;
    return 0;
  }
  const step = DINE_IN_STATUS_TO_STEP[safe];
  if (step !== undefined && step >= 0) return step;
  return 0;
}

export default function OrderStatus({
  status = "Pending",
  className = "",
  updatedAt,
  serviceType = "DINE_IN",
  tableLabel,
}) {
  const orderedSteps = getOrderedSteps(serviceType);
  const safeStatus = status ?? "Pending";
  const currentIndex = getCurrentIndex(safeStatus, serviceType);
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : null;
  const isTerminal = ["Cancelled", "Returned"].includes(safeStatus);

  if (isTerminal) {
    return (
      <div className={`order-status-timeline ${className}`}>
        <div className="order-status-timeline-step order-status-step-completed">
          <div className="order-status-dot order-status-dot-completed" />
          <div className="order-status-step-content">
            <span className="order-status-step-label">{safeStatus}</span>
            {updatedLabel && (
              <span className="order-status-step-meta">
                Updated {updatedLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`order-status-timeline ${className}`}>
      {updatedLabel && (
        <div className="order-status-updated-meta">Updated {updatedLabel}</div>
      )}
      {orderedSteps.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isPending = idx > currentIndex;
        const isLast = idx === orderedSteps.length - 1;
        const label = idx === 0 && tableLabel ? tableLabel : step.label;

        return (
          <div key={step.key} className="order-status-timeline-step-wrapper">
            <div className="order-status-timeline-step">
              <div className="order-status-step-left">
                <div
                  className={`order-status-dot ${
                    isCompleted ? "order-status-dot-completed" : ""
                  } ${isCurrent ? "order-status-dot-active" : ""} ${
                    isPending ? "order-status-dot-pending" : ""
                  }`}
                >
                  {isCompleted && (
                    <svg
                      className="order-status-check"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M2 6l3 3 5-6" />
                    </svg>
                  )}
                </div>
                {!isLast && <div className="order-status-line" />}
              </div>
              <div className="order-status-step-content">
                <span
                  className={`order-status-step-label ${isCurrent ? "order-status-step-label-active" : ""} ${isPending ? "order-status-step-label-pending" : ""}`}
                >
                  {label}
                </span>
                {isCurrent && updatedLabel && (
                  <span className="order-status-step-meta">
                    Updated {updatedLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
