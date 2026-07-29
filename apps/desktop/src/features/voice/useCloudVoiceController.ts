import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';
import {
  useChatStore as useSharedChatStore,
  type ComposerVoiceController,
  type ComposerVoiceState,
} from '@agiworkforce/unified-chat';
import { toast } from 'sonner';

import { useVoiceTranscription } from '../../hooks/useVoiceTranscription';
import { invoke } from '../../lib/tauri-mock';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
  type ManagedCloudBoundary,
} from '../../services/managedCloudBoundary';
import { useComputerUseStore } from '../../stores/computerUseStore';
import { rewriteCloudVoiceTranscript, type CloudVoiceDecision } from './cloudVoiceService';

type WorkflowState = 'idle' | 'processing' | 'awaiting_action' | 'executing' | 'error';

function insertVoiceTextIntoDraft(text: string): void {
  if (!text) return;
  const chat = useSharedChatStore.getState();
  const separator = chat.draftContent && !/\s$/.test(chat.draftContent) ? ' ' : '';
  chat.setDraftContent(`${chat.draftContent}${separator}${text}`);
}

export interface CloudVoiceControllerResult {
  controller: ComposerVoiceController;
  pendingAction: string | null;
  error: string | null;
  requiresComputerUseConsent: boolean;
  approveAction: () => Promise<void>;
  useActionAsText: () => void;
  cancelAction: () => void;
}

export function useCloudVoiceController(enabled: boolean): CloudVoiceControllerResult {
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boundaryRef = useRef<ManagedCloudBoundary | null>(null);
  const wasEnabledRef = useRef(enabled);
  const computerUseEnabled = useComputerUseStore((state) => state.computerUseEnabled);
  const consentAccepted = useComputerUseStore((state) => state.consentAccepted);

  const getCloudBoundary = useCallback(() => {
    const boundary = boundaryRef.current;
    if (!boundary) {
      throw new Error('Cloud voice lost its authenticated session boundary.');
    }
    return {
      accessToken: boundary.accessToken,
      assertCurrent: () => assertManagedCloudBoundary(boundary),
    };
  }, []);

  const handleTranscriptionError = useCallback((message: string) => {
    setError(message);
    setWorkflowState('error');
  }, []);

  const {
    cancelRecording,
    clearTranscript,
    error: transcriptionError,
    isRecording,
    isSupported,
    isTranscribing,
    startRecording,
    stopRecording,
  } = useVoiceTranscription({
    preferWhisperCloud: enabled,
    language: enabled ? 'en' : undefined,
    getCloudBoundary,
    onError: handleTranscriptionError,
  });

  useEffect(() => {
    if (enabled) {
      wasEnabledRef.current = true;
      return;
    }
    if (!wasEnabledRef.current) return;
    wasEnabledRef.current = false;
    cancelRecording();
    boundaryRef.current = null;
    setPendingAction(null);
    setError(null);
    setWorkflowState('idle');
    clearTranscript();
  }, [cancelRecording, clearTranscript, enabled]);

  const handleDecision = useCallback((decision: CloudVoiceDecision) => {
    if (decision.kind === 'dictation') {
      insertVoiceTextIntoDraft(decision.text);
      boundaryRef.current = null;
      setWorkflowState('idle');
      return;
    }

    setPendingAction(decision.text);
    setWorkflowState('awaiting_action');
  }, []);

  const onToggle = useCallback(async () => {
    if (!enabled) return;

    if (!isRecording) {
      try {
        boundaryRef.current = captureManagedCloudBoundary('Cloud voice');
        setError(null);
        setWorkflowState('idle');
        clearTranscript();
        await startRecording();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        boundaryRef.current = null;
        setError(message);
        setWorkflowState('error');
      }
      return;
    }

    const boundary = boundaryRef.current;
    try {
      if (!boundary) {
        throw new Error('Cloud voice lost its authenticated session boundary.');
      }
      assertManagedCloudBoundary(boundary);
      const transcript = (await stopRecording()).trim();
      assertManagedCloudBoundary(boundary);
      if (!transcript) {
        throw new Error(transcriptionError || 'No speech was detected. Please try again.');
      }

      setWorkflowState('processing');
      const decision = await rewriteCloudVoiceTranscript(transcript, {
        invoke: (command, args) => invoke(command, args),
        assertBoundary: () => assertManagedCloudBoundary(boundary),
      });
      assertManagedCloudBoundary(boundary);
      handleDecision(decision);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      boundaryRef.current = null;
      setError(message);
      setWorkflowState('error');
      toast.error(message);
    }
  }, [
    enabled,
    handleDecision,
    clearTranscript,
    isRecording,
    startRecording,
    stopRecording,
    transcriptionError,
  ]);

  const approveAction = useCallback(async () => {
    const action = pendingAction;
    const boundary = boundaryRef.current;
    if (!action || !boundary) return;

    try {
      assertManagedCloudBoundary(boundary);
      setError(null);
      setWorkflowState('executing');

      const computerUse = useComputerUseStore.getState();
      if (!computerUse.consentAccepted) computerUse.setConsentAccepted(true);
      if (!computerUse.computerUseEnabled) computerUse.setComputerUseEnabled(true);

      const model = getRoutingSlotModel('computer_use');
      const provider = getModelMetadataById(model)?.provider;
      const result = await computerUse.executeOpaTask(action, {
        model,
        provider,
      });
      assertManagedCloudBoundary(boundary);
      if (!result?.success) {
        const reason =
          result?.reason ||
          useComputerUseStore.getState().error ||
          'Desktop control could not complete this action.';
        throw new Error(reason);
      }

      setPendingAction(null);
      boundaryRef.current = null;
      setWorkflowState('idle');
      toast.success('Voice action completed.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setWorkflowState('error');
      toast.error(message);
    }
  }, [pendingAction]);

  const useActionAsText = useCallback(() => {
    if (!pendingAction) return;
    const boundary = boundaryRef.current;
    if (!boundary) return;
    try {
      assertManagedCloudBoundary(boundary);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setWorkflowState('error');
      toast.error(message);
      return;
    }
    insertVoiceTextIntoDraft(pendingAction);
    setPendingAction(null);
    boundaryRef.current = null;
    setError(null);
    setWorkflowState('idle');
  }, [pendingAction]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
    boundaryRef.current = null;
    setError(null);
    setWorkflowState('idle');
  }, []);

  let controllerState: ComposerVoiceState = workflowState;
  if (isRecording) controllerState = 'listening';
  else if (isTranscribing) controllerState = 'transcribing';
  else if (!isSupported) controllerState = 'unsupported';

  const controller = useMemo<ComposerVoiceController>(
    () => ({
      state: controllerState,
      idleLabel: 'Cloud voice',
      onToggle,
    }),
    [controllerState, onToggle],
  );

  return {
    controller,
    pendingAction,
    error,
    requiresComputerUseConsent: !computerUseEnabled || !consentAccepted,
    approveAction,
    useActionAsText,
    cancelAction,
  };
}
