import { createContext, useContext } from 'react';

export type OpenCodeBlockInEditor = (code: string) => void;

export const CodeBlockEditorContext = createContext<OpenCodeBlockInEditor | null>(null);

export function useCodeBlockEditor(): OpenCodeBlockInEditor | null {
  return useContext(CodeBlockEditorContext);
}
