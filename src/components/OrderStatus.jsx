import React from "react";
import "./OrderStatus.css";

const DISPLAY_STEPS = [
  { key: "PREPARING", label: "Preparing" },
  { key: "READY", label: "Ready" },
  { key: "SERVED", label: "Served" },
  { key: "PAID", label: "Paid" },
];

const STATUS_TO_STEP_INDEX = {
  PREPARING: 0,
  READY: 1,
  SERVED: 2,
  PAID: 3,
};

const normalizeStatus = (value) => {
  const token = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");

  if (!token) return "PREPARING";
  if (["NEW", "PENDING", "CONFIRMED", "ACCEPT", "ACCEPTED"].includes(token)) {
    return "PREPARING";
  }
  if (["PREPARING", "BEING PREPARED", "BEINGPREPARED"].includes(token)) {
    return "PREPARING";
  }
  if (token === "READY") return "READY";
  if (token === "PAID") return "PAID";
  if (
    [
      "COMPLETED",
      "SERVED",
      "FINALIZED",
      "CANCELLED",
      "CANCELED",
      "RETURNED",
      "EXIT",
      "CLOSED",
      "REJECTED",
    ].includes(token)
  ) {
    return "SERVED";
  }
  return "PREPARING";
};

const normalizeTerminalStatus = (value) => {
  const token = String(value || "").trim().toUpperCase();
  if (token === "CANCELED") return "CANCELLED";
  return token;
};

export default function OrderStatus({
  status = "PREPARING",
  paymentStatus,
  isPaid = false,
  className = "",
  updatedAt,
  tableLabel,
  reason,
}) {
  const paymentToken = String(paymentStatus || "").trim().toUpperCase();
  const isPaymentCompleted = paymentToken === "PAID" || isPaid === true;
  const normalizedStatus = normalizeStatus(status);
  const currentIndex = STATUS_TO_STEP_INDEX[normalizedStatus] ?? 0;
  const hasReachedServed = currentIndex >= STATUS_TO_STEP_INDEX.SERVED;
  const allStepsCompleted = isPaymentCompleted && hasReachedServed;
  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString() : null;
  const terminalStatus = normalizeTerminalStatus(status);
  const isTerminal = terminalStatus === "CANCELLED" || terminalStatus === "RETURNED";
  const safeReason = typeof reason === "string" ? reason.trim() : "";

  if (isTerminal) {
    return (
      <div className={`order-status-timeline ${className}`}>
        <div className="order-status-timeline-step order-status-step-completed">
          <div className="order-status-dot order-status-dot-completed" />
          <div className="order-status-step-content">
            <span className="order-status-step-label">{terminalStatus}</span>
            {updatedLabel && (
              <span className="order-status-step-meta">Updated {updatedLabel}</span>
            )}
            {safeReason && (
              <span className="order-status-step-meta">Reason: {safeReason}</span>
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
      {DISPLAY_STEPS.map((step, idx) => {
        const isPaidStep = step.key === "PAID";
        const lifecycleCompleted = idx < currentIndex;
        const paidCompleted = isPaidStep && isPaymentCompleted;
        const isCompleted =
          allStepsCompleted || lifecycleCompleted || paidCompleted;
        const isCurrent = !isCompleted && idx === currentIndex;
        const isPending = !isCompleted && !isCurrent;
        const isLast = idx === DISPLAY_STEPS.length - 1;
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
                {!isLast && (
                  <div
                    className={`order-status-line ${
                      isCompleted ? "order-status-line-completed" : ""
                    } ${isPending ? "order-status-line-pending" : ""}`}
                  />
                )}
              </div>
              <div className="order-status-step-content">
                <span
                  className={`order-status-step-label ${
                    isCurrent ? "order-status-step-label-active" : ""
                  } ${isPending ? "order-status-step-label-pending" : ""}`}
                >
                  {label}
                </span>
                {isCurrent && updatedLabel && (
                  <span className="order-status-step-meta">Updated {updatedLabel}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
