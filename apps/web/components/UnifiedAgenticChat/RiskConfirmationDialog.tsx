/**
 * CHT-003 fix: Custom confirmation dialog to replace window.confirm()
 *
 * Provides a non-blocking, styled confirmation dialog for high-risk actions.
 * Uses Radix AlertDialog for accessibility and proper modal behavior.
 */
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';

export interface RiskConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  riskLevel: 'medium' | 'high';
  message: string;
}

export const RiskConfirmationDialog: React.FC<RiskConfirmationDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  riskLevel,
  message,
}) => {
  const isHighRisk = riskLevel === 'high';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className={isHighRisk ? 'border-destructive' : 'border-yellow-500'}>
        <AlertDialogHeader>
          <AlertDialogTitle className={isHighRisk ? 'text-destructive' : 'text-yellow-600'}>
            {isHighRisk ? 'High-Risk Action Warning' : 'Security Warning'}
          </AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-3">
            <span className="whitespace-pre-wrap block">{message}</span>
            <span className="font-medium block">
              {isHighRisk
                ? 'This action could cause system damage. Proceeding is not recommended.'
                : 'Please review this request carefully before proceeding.'}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              isHighRisk
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-yellow-600 text-white hover:bg-yellow-700'
            }
          >
            {isHighRisk ? 'Proceed Anyway' : 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * Hook for using confirmation dialog with Promise-based API
 */
export interface ConfirmationState {
  isOpen: boolean;
  riskLevel: 'medium' | 'high';
  message: string;
  resolve: ((confirmed: boolean) => void) | null;
}

export const useRiskConfirmation = () => {
  const [state, setState] = React.useState<ConfirmationState>({
    isOpen: false,
    riskLevel: 'medium',
    message: '',
    resolve: null,
  });

  // Use ref to avoid dependency issues with resolve function
  const resolveRef = React.useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = React.useCallback(
    (riskLevel: 'medium' | 'high', message: string): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setState({
          isOpen: true,
          riskLevel,
          message,
          resolve,
        });
      });
    },
    [],
  );

  const handleConfirm = React.useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, []);

  const handleCancel = React.useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, []);

  return {
    state,
    confirm,
    handleConfirm,
    handleCancel,
  };
};
