import React from 'react';
import './OrderStatus.css';

const dineInSteps = [
  { key: 'Pending', label: 'Order Placed', index: 0 },
  { key: 'Confirmed', label: 'Order Confirmed', index: 1 },
  { key: 'Preparing', label: 'Preparing Order', index: 2 },
  { key: 'Ready', label: 'Ready to Serve', index: 3 },
  { key: 'Served', label: 'Served', index: 4 },
  { key: 'Finalized', label: 'Finalized', index: 5 },
  { key: 'Paid', label: 'Paid', index: 6 },
];

const takeawaySteps = [
  { key: 'Pending', label: 'Order Placed', index: 0 },
  { key: 'Accepted', label: 'Accepted', index: 1 },
  { key: 'Being Prepared', label: 'Being Prepared', index: 2 },
  { key: 'BeingPrepared', label: 'Being Prepared', index: 2 },
  { key: 'Completed', label: 'Completed', index: 3 },
  { key: 'Paid', label: 'Paid', index: 4 },
];

const dineInStepKeys = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Served', 'Finalized', 'Paid'];
const takeawayStepKeys = ['Pending', 'Accepted', 'Being Prepared', 'Completed', 'Paid'];

function getOrderedSteps(serviceType) {
  const list = serviceType === 'TAKEAWAY' ? takeawaySteps : dineInSteps;
  const keys = serviceType === 'TAKEAWAY' ? takeawayStepKeys : dineInStepKeys;
  return keys.map(k => list.find(s => s.key === k)).filter(Boolean);
}

function getCurrentIndex(status, serviceType) {
  const list = serviceType === 'TAKEAWAY' ? takeawaySteps : dineInSteps;
  const found = list.find(s => s.key === status);
  if (found != null) return found.index;
  const byIndex = list.filter(s => s.index >= 0);
  const maxIdx = Math.max(...byIndex.map(s => s.index), -1);
  return maxIdx;
}

export default function OrderStatus({ status = 'Pending', className = '', updatedAt, serviceType = 'DINE_IN', tableLabel }) {
  const orderedSteps = getOrderedSteps(serviceType);
  const currentIndex = getCurrentIndex(status, serviceType);
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : null;
  const isTerminal = ['Cancelled', 'Returned'].includes(status);

  if (isTerminal) {
    return (
      <div className={`order-status-timeline ${className}`}>
        <div className="order-status-timeline-step order-status-step-completed">
          <div className="order-status-dot order-status-dot-completed" />
          <div className="order-status-step-content">
            <span className="order-status-step-label">{status}</span>
            {updatedLabel && <span className="order-status-step-meta">Updated {updatedLabel}</span>}
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
        const stepIndex = step.index;
        const isCompleted = currentIndex > stepIndex;
        const isCurrent = currentIndex === stepIndex;
        const isPending = currentIndex < stepIndex;
        const isLast = idx === orderedSteps.length - 1;
        const label = idx === 0 && tableLabel ? tableLabel : step.label;

        return (
          <div key={step.key} className="order-status-timeline-step-wrapper">
            <div className="order-status-timeline-step">
              <div className="order-status-step-left">
                <div
                  className={`order-status-dot ${
                    isCompleted ? 'order-status-dot-completed' : ''
                  } ${isCurrent ? 'order-status-dot-active' : ''} ${
                    isPending ? 'order-status-dot-pending' : ''
                  }`}
                >
                  {isCompleted && (
                    <svg className="order-status-check" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M2 6l3 3 5-6" />
                    </svg>
                  )}
                </div>
                {!isLast && <div className="order-status-line" />}
              </div>
              <div className="order-status-step-content">
                <span className={`order-status-step-label ${isCurrent ? 'order-status-step-label-active' : ''} ${isPending ? 'order-status-step-label-pending' : ''}`}>
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
