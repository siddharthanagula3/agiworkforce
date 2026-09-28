'use client';

import { createContext, useContext } from 'react';

const MAX_ANSWER_FILE_TITLE_CHARS = 80;
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\p{Cc}]+/gu;

export interface ProjectAnswerSave {
  projectName: string;
  save: (content: string) => Promise<void>;
}

const ProjectAnswerSaveContext = createContext<ProjectAnswerSave | null>(null);

export const ProjectAnswerSaveProvider = ProjectAnswerSaveContext.Provider;

export function useProjectAnswerSave(): ProjectAnswerSave | null {
  return useContext(ProjectAnswerSaveContext);
}

export function projectAnswerFileName(conversationTitle: string | null | undefined): string {
  const title = (conversationTitle ?? '')
    .replace(UNSAFE_FILE_NAME_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ANSWER_FILE_TITLE_CHARS)
    .trim();
  return title ? `Answer from ${title}.md` : 'Saved answer.md';
}
