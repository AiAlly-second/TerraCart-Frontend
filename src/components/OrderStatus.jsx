import React from 'react';

const dineInSteps = {
  Pending: { icon: '⏳', color: 'bg-orange-500', index: 0 },
  Confirmed: { icon: '👨‍🍳', color: 'bg-yellow-500', index: 1 },
  Preparing: { icon: '🔥', color: 'bg-blue-500', index: 2 },
  Ready: { icon: '✨', color: 'bg-purple-500', index: 3 },
  Served: { icon: '🍽️', color: 'bg-indigo-500', index: 4 },
  Finalized: { icon: '📋', color: 'bg-cyan-500', index: 5 },
  Paid: { icon: '✅', color: 'bg-green-500', index: 6 },
  Cancelled: { icon: '❌', color: 'bg-red-500', index: -1 },
  Returned: { icon: '↩️', color: 'bg-rose-500', index: -2 },
};

const takeawaySteps = {
  Pending: { icon: '⏳', color: 'bg-orange-500', index: 0 },
  Accepted: { icon: '✅', color: 'bg-yellow-500', index: 1 },
  'Being Prepared': { icon: '🔥', color: 'bg-blue-500', index: 2 },
  BeingPrepared: { icon: '🔥', color: 'bg-blue-500', index: 2 },
  Completed: { icon: '📦', color: 'bg-purple-500', index: 3 },
  Paid: { icon: '✅', color: 'bg-green-500', index: 4 },
  Cancelled: { icon: '❌', color: 'bg-red-500', index: -1 },
  Returned: { icon: '↩️', color: 'bg-rose-500', index: -2 },
};

export default function OrderStatus({ status = 'Pending', className = '', updatedAt, serviceType = 'DINE_IN' }) {
  const steps = serviceType === 'TAKEAWAY' ? takeawaySteps : dineInSteps;
  const currentStep = steps[status] || steps.Pending;
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : null;
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Current status badge */}
      <div className="flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-white text-sm ${currentStep.color}`}>
          {currentStep.icon} {status}
        </span>
        {updatedLabel && (
          <span className="text-xs text-gray-500">
            Updated {updatedLabel}
          </span>
        )}
      </div>

      {/* Progress timeline */}
      {!['Cancelled', 'Returned'].includes(status) && (
        <div className="flex items-center gap-1">
          {Object.entries(steps)
            .filter(([key]) => !['Cancelled', 'Returned'].includes(key))
            .sort((a, b) => a[1].index - b[1].index)
            .map(([key, step], idx, arr) => (
              <React.Fragment key={key}>
                {/* Step dot */}
                <div
                  className={`w-3 h-3 rounded-full ${
                    step.index <= currentStep.index ? step.color : 'bg-gray-300'
                  }`}
                />
                {/* Connector line (except after last dot) */}
                {idx < arr.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      step.index < currentStep.index ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
        </div>
      )}
    </div>
  );
}