'use client';

import { useEffect, useState } from 'react';
import { CreditAlertModal } from '@/components/modals/CreditAlertModal';

interface CreditMonitorProps {
  userId: string;
  currentPlan: string;
  remainingCents: number;
  allocatedCents: number;
  usagePercentage: number;
}

export function CreditMonitor({
  userId,
  currentPlan,
  remainingCents,
  allocatedCents,
  usagePercentage,
}: CreditMonitorProps) {
  const [showModal, setShowModal] = useState(false);
  const [alertType, setAlertType] = useState<'low' | 'exhausted' | 'none'>('none');
  const [hasShownWarning, setHasShownWarning] = useState(false);
  const [hasShownExhausted, setHasShownExhausted] = useState(false);

  useEffect(() => {
    // Check localStorage first to see if we're in cooldown period
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

    // Check credit thresholds
    if (usagePercentage >= 100 && !hasShownExhausted && !inExhaustedCooldown) {
      // Credits exhausted
      setAlertType('exhausted');
      setShowModal(true);
      setHasShownExhausted(true);

      // Store in localStorage to avoid showing multiple times
      try {
        localStorage.setItem(`credit-alert-exhausted-${userId}`, Date.now().toString());
      } catch (e) {
        console.error('Failed to save alert state:', e);
      }
    } else if (
      usagePercentage >= 80 &&
      usagePercentage < 100 &&
      !hasShownWarning &&
      !inWarningCooldown
    ) {
      // Low credits warning
      setAlertType('low');
      setShowModal(true);
      setHasShownWarning(true);

      // Store in localStorage to avoid showing multiple times
      try {
        localStorage.setItem(`credit-alert-warning-${userId}`, Date.now().toString());
      } catch (e) {
        console.error('Failed to save alert state:', e);
      }
    }
  }, [usagePercentage, userId, hasShownWarning, hasShownExhausted]);

  useEffect(() => {
    // Check localStorage to see if we've already shown alerts this session
    try {
      const warningShown = localStorage.getItem(`credit-alert-warning-${userId}`);
      const exhaustedShown = localStorage.getItem(`credit-alert-exhausted-${userId}`);

      if (warningShown) {
        const warningTime = parseInt(warningShown, 10);
        // Show warning again if it's been more than 24 hours
        if (Date.now() - warningTime < 24 * 60 * 60 * 1000) {
          setHasShownWarning(true);
        }
      }

      if (exhaustedShown) {
        const exhaustedTime = parseInt(exhaustedShown, 10);
        // Show exhausted alert again if it's been more than 6 hours
        if (Date.now() - exhaustedTime < 6 * 60 * 60 * 1000) {
          setHasShownExhausted(true);
        }
      }
    } catch (e) {
      console.error('Failed to read alert state:', e);
    }
  }, [userId]);

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
