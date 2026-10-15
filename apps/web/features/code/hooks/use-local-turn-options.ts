'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DeveloperAgentMode,
  DeveloperReasoningEffort,
  DeveloperRuntimeModels,
} from '@agiworkforce/local-runtime-contract';
import { LOCAL_FALLBACK_AGENT_MODE, rememberableAgentMode } from '../local-code';

function readRememberedMode(threadId: string): DeveloperAgentMode | null {
  try {
    return rememberableAgentMode(
      window.localStorage.getItem(`agi.code.local.agentMode.${threadId}`),
    );
  } catch {
    return null;
  }
}

function rememberMode(threadId: string, mode: DeveloperAgentMode): void {
  const kept = rememberableAgentMode(mode);
  if (kept === null) return;
  try {
    window.localStorage.setItem(`agi.code.local.agentMode.${threadId}`, kept);
  } catch {
    return;
  }
}

export interface LocalTurnOptionsState {
  agentMode: DeveloperAgentMode;
  reasoningEffort: DeveloperReasoningEffort | undefined;
  chooseMode: (mode: DeveloperAgentMode) => void;
  chooseEffort: (effort: DeveloperReasoningEffort) => void;
  /** Put the picker back on the posture it had before Bypass was chosen. */
  leaveBypass: () => void;
}

/**
 * The posture and reasoning level the next turn in one thread runs with.
 *
 * The CLI keeps a posture on its session from one turn to the next, so every
 * turn names one: a turn left to inherit would run under whatever the previous
 * one chose, bypass included. The thread remembers its posture on this device,
 * except bypass, which is never written anywhere: the shell asks about it in
 * its own dialog before the first such turn, where a page cannot answer.
 */
export function useLocalTurnOptions(
  threadId: string,
  runtime: DeveloperRuntimeModels | null,
): LocalTurnOptionsState {
  const [chosenMode, setChosenMode] = useState<DeveloperAgentMode | null>(() =>
    readRememberedMode(threadId),
  );
  const [chosenEffort, setChosenEffort] = useState<DeveloperReasoningEffort | null>(null);

  useEffect(() => {
    setChosenMode(readRememberedMode(threadId));
    setChosenEffort(null);
  }, [threadId]);

  const beforeBypass = useRef<DeveloperAgentMode | null>(null);

  const chooseMode = useCallback(
    (mode: DeveloperAgentMode) => {
      setChosenMode((current) => {
        if (mode === 'bypass' && current !== 'bypass') beforeBypass.current = current;
        return mode;
      });
      rememberMode(threadId, mode);
    },
    [threadId],
  );

  const leaveBypass = useCallback(() => {
    setChosenMode((current) => (current === 'bypass' ? beforeBypass.current : current));
  }, []);

  return {
    agentMode: chosenMode ?? runtime?.defaultAgentMode ?? LOCAL_FALLBACK_AGENT_MODE,
    reasoningEffort: chosenEffort ?? runtime?.defaultReasoningEffort ?? undefined,
    chooseMode,
    chooseEffort: setChosenEffort,
    leaveBypass,
  };
}
