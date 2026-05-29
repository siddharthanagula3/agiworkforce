import type { CodeSession } from './types';

export const CODE_SESSIONS: CodeSession[] = [];

export function getCodeSessionById(id: string | undefined): CodeSession | undefined {
  return CODE_SESSIONS.find((session) => session.id === id);
}
