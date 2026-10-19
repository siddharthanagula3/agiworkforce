'use client';

import { createContext, useContext } from 'react';

export const SCHEDULES_PATH = '/chat/schedules';
export const SCHEDULE_PROMPT_QUERY_PARAM = 'fromPrompt';

const SCHEDULE_NAME_MAX_CHARS = 60;

export interface ScheduleFromTurn {
  schedule: (assistantMessageId: string) => void;
}

const ScheduleFromTurnContext = createContext<ScheduleFromTurn | null>(null);

export const ScheduleFromTurnProvider = ScheduleFromTurnContext.Provider;

export function useScheduleFromTurn(): ScheduleFromTurn | null {
  return useContext(ScheduleFromTurnContext);
}

export function scheduleFromPromptHref(prompt: string): string {
  return `${SCHEDULES_PATH}?${SCHEDULE_PROMPT_QUERY_PARAM}=${encodeURIComponent(prompt)}`;
}

export function scheduleNameFromPrompt(prompt: string): string {
  const firstLine = prompt.trim().split('\n', 1)[0]?.trim() ?? '';
  return firstLine.length > SCHEDULE_NAME_MAX_CHARS
    ? `${firstLine.slice(0, SCHEDULE_NAME_MAX_CHARS - 1).trimEnd()}…`
    : firstLine;
}

export function promptBeforeReply(
  messages: ReadonlyArray<{ id: string; role: string; content: string }>,
  assistantMessageId: string,
): string | null {
  const index = messages.findIndex((message) => message.id === assistantMessageId);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor]!;
    if (message.role === 'user') return message.content.trim() || null;
  }
  return null;
}
