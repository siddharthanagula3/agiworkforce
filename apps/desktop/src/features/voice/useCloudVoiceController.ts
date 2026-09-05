import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  type ToolApprovalRequest,
} from '@agiworkforce/types';
import {
  useChatStore as useSharedChatStore,
  type ComposerVoiceController,
  type ComposerVoiceState,
} from '@agiworkforce/unified-chat';
import { toast } from 'sonner';

import { useVoiceTranscription } from '../../hooks/useVoiceTranscription';
import { invoke } from '../../lib/tauri-mock';
import { subscribeManagedCloudBoundary } from '../../services/managedCloudBoundary';
import {
  createManagedCloudRequestContext,
  type ManagedCloudRequestContext,
} from '../../services/managedCloudRequestContext';
import { formatOpaCompletionReason, useComputerUseStore } from '../../stores/computerUseStore';
import { useVoiceInputStore } from '../../stores/settingsStore';
import { toProviderLanguage } from '../../lib/voiceLanguage';
import { onGlobalVoiceHotkey } from '../../lib/tauri-electron/voice-hotkey';
import { rewriteCloudVoiceTranscript, type CloudVoiceDecision } from './cloudVoiceService';

type WorkflowState = 'idle' | 'processing' | 'awaiting_action' | 'executing' | 'stopping' | 'error';

function insertVoiceTextIntoDraft(text: string): void {
  if (!text) return;
  const chat = useSharedChatStore.getState();
  const separator = chat.draftContent && !/\s$/.test(chat.draftContent) ? ' ' : '';
  chat.setDraftContent(`${chat.draftContent}${separator}${text}`);
}

export interface CloudVoiceControllerResult {
  controller: ComposerVoiceController;
  pendingAction: string | null;
  pendingApproval: ToolApprovalRequest | null;
  error: string | null;
  isDesktopActionActive: boolean;
  isStopping: boolean;
  requiresComputerUseConsent: boolean;
  consentPromptOpen: boolean;
  approveAction: () => Promise<void>;
  acceptComputerUseConsent: () => Promise<void>;
  dismissComputerUseConsent: () => void;
  useActionAsText: () => void;
  cancelAction: () => Promise<void>;
}

export function useCloudVoiceController(enabled: boolean): CloudVoiceControllerResult {
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [consentPromptOpen, setConsentPromptOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestContextRef = useRef<ManagedCloudRequestContext | null>(null);
  const unsubscribeBoundaryRef = useRef<(() => void) | null>(null);
  const workflowGenerationRef = useRef(0);
  const opaExecutionIdRef = useRef<string | null>(null);
  const transcriptionFailureRef = useRef<string | null>(null);
  const wasEnabledRef = useRef(enabled);
  const computerUseEnabled = useComputerUseStore((state) => state.computerUseEnabled);
  const consentAccepted = useComputerUseStore((state) => state.consentAccepted);
  const cancellingOpaExecutionId = useComputerUseStore((state) => state.cancellingOpaExecutionId);
  const computerUseError = useComputerUseStore((state) => state.error);
  const pendingApproval = useComputerUseStore((state) => state.pendingApproval);
  const voiceLanguage = useVoiceInputStore((state) => state.voiceLanguage);

  const releaseBoundarySubscription = useCallback(() => {
    unsubscribeBoundaryRef.current?.();
    unsubscribeBoundaryRef.current = null;
  }, []);

  const getCloudRequestContext = useCallback(() => {
    const request = requestContextRef.current;
    if (!request) {
      throw new Error('Cloud voice lost its authenticated session boundary.');
    }
    request.assertBoundary();
    return request;
  }, []);

  const handleTranscriptionError = useCallback((message: string) => {
    transcriptionFailureRef.current = message;
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
    language: enabled ? toProviderLanguage(voiceLanguage) : undefined,
    getCloudRequestContext,
    onError: handleTranscriptionError,
  });

  const isCurrentWorkflow = useCallback(
    (request: ManagedCloudRequestContext, generation: number) =>
      requestContextRef.current === request && workflowGenerationRef.current === generation,
    [],
  );

  const stopDesktopAction = useCallback(async (): Promise<boolean> => {
    const executionId =
      opaExecutionIdRef.current ?? useComputerUseStore.getState().cancellingOpaExecutionId;
    if (!executionId) return true;
    const stopped = await useComputerUseStore.getState().cancelOpaTask(executionId);
    if (stopped && opaExecutionIdRef.current === executionId) {
      opaExecutionIdRef.current = null;
    }
    return stopped;
  }, []);

  const resetVoiceSession = useCallback(() => {
    workflowGenerationRef.current += 1;
    useComputerUseStore.getState().clearPendingApproval();
    void stopDesktopAction();
    releaseBoundarySubscription();
    requestContextRef.current = null;
    transcriptionFailureRef.current = null;
    cancelRecording();
    setPendingAction(null);
    setConsentPromptOpen(false);
    setError(null);
    setWorkflowState('idle');
    clearTranscript();
  }, [cancelRecording, clearTranscript, releaseBoundarySubscription, stopDesktopAction]);

  const closeVoiceBoundary = useCallback(() => {
    workflowGenerationRef.current += 1;
    void stopDesktopAction();
    releaseBoundarySubscription();
    requestContextRef.current = null;
    transcriptionFailureRef.current = null;
  }, [releaseBoundarySubscription, stopDesktopAction]);

  useEffect(() => {
    if (enabled) {
      wasEnabledRef.current = true;
      return;
    }
    if (!wasEnabledRef.current) return;
    wasEnabledRef.current = false;
    resetVoiceSession();
  }, [enabled, resetVoiceSession]);

  useEffect(
    () => () => {
      workflowGenerationRef.current += 1;
      void stopDesktopAction();
      releaseBoundarySubscription();
      requestContextRef.current = null;
      cancelRecording();
    },
    [cancelRecording, releaseBoundarySubscription, stopDesktopAction],
  );

  const handleDecision = useCallback(
    (decision: CloudVoiceDecision, request: ManagedCloudRequestContext, generation: number) => {
      if (!isCurrentWorkflow(request, generation)) return;
      if (decision.kind === 'dictation') {
        insertVoiceTextIntoDraft(decision.text);
        closeVoiceBoundary();
        setWorkflowState('idle');
        return;
      }

      setPendingAction(decision.text);
      setWorkflowState('awaiting_action');
    },
    [closeVoiceBoundary, isCurrentWorkflow],
  );

  const onToggle = useCallback(async () => {
    if (!enabled) return;

    const computerUse = useComputerUseStore.getState();
    if (
      opaExecutionIdRef.current !== null ||
      computerUse.activeOpaExecutionId !== null ||
      computerUse.cancellingOpaExecutionId !== null
    ) {
      const message =
        computerUse.error ||
        'A previous desktop-control action must be confirmed stopped before recording another voice action.';
      setError(message);
      setWorkflowState('error');
      toast.error(message);
      return;
    }

    if (!isRecording) {
      let request: ManagedCloudRequestContext | null = null;
      let generation = 0;
      try {
        releaseBoundarySubscription();
        request = createManagedCloudRequestContext('Cloud voice');
        generation = workflowGenerationRef.current + 1;
        workflowGenerationRef.current = generation;
        requestContextRef.current = request;
        const unsubscribe = subscribeManagedCloudBoundary(request.boundary, () => {
          if (requestContextRef.current === request) resetVoiceSession();
        });
        if (!isCurrentWorkflow(request, generation)) {
          unsubscribe();
          return;
        }
        unsubscribeBoundaryRef.current = unsubscribe;
        transcriptionFailureRef.current = null;
        setPendingAction(null);
        setError(null);
        setWorkflowState('idle');
        clearTranscript();
        await startRecording();
        if (!isCurrentWorkflow(request, generation)) return;
      } catch (cause) {
        if (request && !isCurrentWorkflow(request, generation)) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        closeVoiceBoundary();
        setError(message);
        setWorkflowState('error');
      }
      return;
    }

    const request = requestContextRef.current;
    const generation = workflowGenerationRef.current;
    try {
      if (!request) {
        throw new Error('Cloud voice lost its authenticated session boundary.');
      }
      request.assertBoundary();
      const transcript = (await stopRecording()).trim();
      if (!isCurrentWorkflow(request, generation)) return;
      request.assertBoundary();
      if (!transcript) {
        throw new Error(
          transcriptionFailureRef.current ||
            transcriptionError ||
            'No speech was detected. Please try again.',
        );
      }

      setWorkflowState('processing');
      const decision = await rewriteCloudVoiceTranscript(transcript, {
        invoke: (command, args) => invoke(command, args),
        assertBoundary: () => request.assertBoundary(),
      });
      if (!isCurrentWorkflow(request, generation)) return;
      request.assertBoundary();
      handleDecision(decision, request, generation);
    } catch (cause) {
      if (!request || !isCurrentWorkflow(request, generation)) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      closeVoiceBoundary();
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
    closeVoiceBoundary,
    isCurrentWorkflow,
    releaseBoundarySubscription,
    resetVoiceSession,
  ]);

  const runApprovedAction = useCallback(async () => {
    const action = pendingAction;
    const request = requestContextRef.current;
    const generation = workflowGenerationRef.current;
    if (!action || !request) return;

    try {
      request.assertBoundary();
      const computerUse = useComputerUseStore.getState();
      if (opaExecutionIdRef.current !== null) {
        const message =
          computerUse.error ||
          'The previous desktop-control action has not been confirmed stopped. Stop it before starting another action.';
        setError(message);
        setWorkflowState('error');
        return;
      }
      if (!computerUse.consentAccepted || !computerUse.computerUseEnabled) {
        throw new Error('Desktop control has not been turned on for this device.');
      }
      setError(null);
      computerUse.clearPendingApproval();
      setWorkflowState('executing');

      const model = getRoutingSlotModel('computer_use');
      const provider = getModelMetadataById(model)?.provider;
      const executionId = crypto.randomUUID();
      opaExecutionIdRef.current = executionId;
      const result = await computerUse.executeOpaTask(action, {
        executionId,
        model,
        provider,
      });
      if (
        opaExecutionIdRef.current === executionId &&
        useComputerUseStore.getState().cancellingOpaExecutionId !== executionId
      ) {
        opaExecutionIdRef.current = null;
      }
      if (!isCurrentWorkflow(request, generation)) return;
      request.assertBoundary();
      if (!result?.success) {
        const reason = result?.reason
          ? formatOpaCompletionReason(result.reason)
          : useComputerUseStore.getState().error ||
            'Desktop control could not complete this action.';
        throw new Error(reason);
      }

      setPendingAction(null);
      closeVoiceBoundary();
      setWorkflowState('idle');
      toast.success('Voice action completed.');
    } catch (cause) {
      if (!isCurrentWorkflow(request, generation)) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setWorkflowState('error');
      toast.error(message);
    }
  }, [closeVoiceBoundary, isCurrentWorkflow, pendingAction]);

  const approveAction = useCallback(async () => {
    if (!pendingAction || !requestContextRef.current) return;
    const computerUse = useComputerUseStore.getState();
    if (!computerUse.consentAccepted || !computerUse.computerUseEnabled) {
      setConsentPromptOpen(true);
      return;
    }
    await runApprovedAction();
  }, [pendingAction, runApprovedAction]);

  const acceptComputerUseConsent = useCallback(async () => {
    setConsentPromptOpen(false);
    if (!pendingAction || !requestContextRef.current) return;
    const computerUse = useComputerUseStore.getState();
    computerUse.setConsentAccepted(true);
    computerUse.setComputerUseEnabled(true);
    await runApprovedAction();
  }, [pendingAction, runApprovedAction]);

  const dismissComputerUseConsent = useCallback(() => {
    setConsentPromptOpen(false);
  }, []);

  const useActionAsText = useCallback(() => {
    if (!pendingAction) return;
    const request = requestContextRef.current;
    if (!request) return;
    try {
      request.assertBoundary();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setWorkflowState('error');
      toast.error(message);
      return;
    }
    insertVoiceTextIntoDraft(pendingAction);
    setPendingAction(null);
    setConsentPromptOpen(false);
    closeVoiceBoundary();
    setError(null);
    setWorkflowState('idle');
  }, [closeVoiceBoundary, pendingAction]);

  const cancelAction = useCallback(async () => {
    if (opaExecutionIdRef.current !== null || cancellingOpaExecutionId !== null) {
      workflowGenerationRef.current += 1;
      setError(null);
      setWorkflowState('stopping');
      const stopped = await stopDesktopAction();
      if (!stopped) {
        const message =
          useComputerUseStore.getState().error ||
          'Native desktop control did not acknowledge Stop. Try again before starting another action.';
        setError(message);
        setWorkflowState('error');
        toast.error(message);
        return;
      }
    }
    setPendingAction(null);
    setConsentPromptOpen(false);
    closeVoiceBoundary();
    setError(null);
    setWorkflowState('idle');
  }, [cancellingOpaExecutionId, closeVoiceBoundary, stopDesktopAction]);

  const toggleRef = useRef(onToggle);
  useEffect(() => {
    toggleRef.current = onToggle;
  }, [onToggle]);

  // The shell's OS-global accelerator has to reach the same capture this
  // composer runs. Driving the local dictation store instead would transcribe
  // through a Tauri command the cloud shell cannot reach.
  useEffect(() => onGlobalVoiceHotkey(() => void toggleRef.current()), []);

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
    pendingApproval,
    error: error ?? (cancellingOpaExecutionId === null ? null : computerUseError),
    isDesktopActionActive: opaExecutionIdRef.current !== null || cancellingOpaExecutionId !== null,
    isStopping: workflowState === 'stopping',
    requiresComputerUseConsent: !computerUseEnabled || !consentAccepted,
    consentPromptOpen,
    approveAction,
    acceptComputerUseConsent,
    dismissComputerUseConsent,
    useActionAsText,
    cancelAction,
  };
}
