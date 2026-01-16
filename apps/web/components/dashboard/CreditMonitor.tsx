'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { CreditAlertModal } from '@/components/modals/CreditAlertModal';

interface CreditMonitorProps {
  userId: string;
  currentPlan: string;
  remainingCents: number;
  allocatedCents: number;
  usagePercentage: number;
}

// Helper to check if we're in cooldown period (runs outside component for SSR safety)
function checkCooldownStatus(userId: string): {
  inWarningCooldown: boolean;
  inExhaustedCooldown: boolean;
} {
  if (typeof window === 'undefined') {
    return { inWarningCooldown: false, inExhaustedCooldown: false };
  }

  let inWarningCooldown = false;
  let inExhaustedCooldown = false;

  try {
    const warningShown = localStorage.getItem(`credit-alert-warning-${userId}`);
    const exhaustedShown = localStorage.getItem(`credit-alert-exhausted-${userId}`);

    if (warningShown) {
      const warningTime = parseInt(warningShown, 10);
      inWarningCooldown = Date.now() - warningTime < 24 * 60 * 60 * 1000;
    }

    if (exhaustedShown) {
      const exhaustedTime = parseInt(exhaustedShown, 10);
      inExhaustedCooldown = Date.now() - exhaustedTime < 6 * 60 * 60 * 1000;
    }
  } catch (e) {
    console.error('Failed to read alert state:', e);
  }

  return { inWarningCooldown, inExhaustedCooldown };
}

export function CreditMonitor({
  userId,
  currentPlan,
  remainingCents,
  allocatedCents,
  usagePercentage,
}: CreditMonitorProps) {
  // Track whether we've shown alerts this render cycle
  const hasTriggeredRef = useRef(false);

  // Compute initial alert state based on props and cooldown status
  const initialAlertState = useMemo(() => {
    const { inWarningCooldown, inExhaustedCooldown } = checkCooldownStatus(userId);

    if (usagePercentage >= 100 && !inExhaustedCooldown) {
      return { showModal: true, alertType: 'exhausted' as const };
    } else if (usagePercentage >= 80 && usagePercentage < 100 && !inWarningCooldown) {
      return { showModal: true, alertType: 'low' as const };
    }
    return { showModal: false, alertType: 'none' as const };
  }, [userId, usagePercentage]);

  const [showModal, setShowModal] = useState(initialAlertState.showModal);
  const [alertType, setAlertType] = useState<'low' | 'exhausted' | 'none'>(
    initialAlertState.alertType,
  );

  // Save to localStorage when modal is shown (side effect only, no state updates)
  useEffect(() => {
    if (showModal && alertType !== 'none' && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      try {
        const key =
          alertType === 'exhausted'
            ? `credit-alert-exhausted-${userId}`
            : `credit-alert-warning-${userId}`;
        localStorage.setItem(key, Date.now().toString());
      } catch (e) {
        console.error('Failed to save alert state:', e);
      }
    }
  }, [showModal, alertType, userId]);

  // Handle prop changes after initial render (usage might change)
  useEffect(() => {
    // Skip if we've already triggered an alert
    if (hasTriggeredRef.current) return;

    const { inWarningCooldown, inExhaustedCooldown } = checkCooldownStatus(userId);

    if (usagePercentage >= 100 && !inExhaustedCooldown) {
      hasTriggeredRef.current = true;
      // Use a microtask to batch state updates and avoid synchronous setState in effect
      queueMicrotask(() => {
        setAlertType('exhausted');
        setShowModal(true);
      });
    } else if (usagePercentage >= 80 && usagePercentage < 100 && !inWarningCooldown) {
      hasTriggeredRef.current = true;
      queueMicrotask(() => {
        setAlertType('low');
        setShowModal(true);
      });
    }
  }, [usagePercentage, userId]);

  const handleClose = () => {
    setShowModal(false);
  };

  return (
    <CreditAlertModal
      isOpen={showModal}
      onClose={handleClose}
      alertType={alertType}
      currentPlan={currentPlan}
      remainingCents={remainingCents}
      allocatedCents={allocatedCents}
      percentageUsed={usagePercentage}
    />
  );
}
