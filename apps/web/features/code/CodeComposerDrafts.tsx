'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/identity/client';

interface CodeComposerDrafts {
  drafts: ReadonlyMap<string | null, string>;
  setDraftText: (sessionId: string | null, text: string) => void;
}

const CodeComposerDraftContext = createContext<CodeComposerDrafts | null>(null);

function AccountCodeComposerDrafts({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState(() => new Map<string | null, string>());
  const setDraftText = useCallback((sessionId: string | null, text: string) => {
    setDrafts((current) => {
      if ((current.get(sessionId) ?? '') === text) return current;
      const next = new Map(current);
      if (text) next.set(sessionId, text);
      else next.delete(sessionId);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ drafts, setDraftText }), [drafts, setDraftText]);

  return (
    <CodeComposerDraftContext.Provider value={value}>{children}</CodeComposerDraftContext.Provider>
  );
}

export function CodeComposerDraftProvider({ children }: { children: ReactNode }) {
  const inherited = useContext(CodeComposerDraftContext);
  const { isLoaded, isSignedIn, userId, sessionId } = useSession();
  if (inherited) return children;
  return (
    <AccountCodeComposerDrafts key={JSON.stringify([isLoaded, isSignedIn, userId, sessionId])}>
      {children}
    </AccountCodeComposerDrafts>
  );
}

export function useCodeComposerDrafts(): CodeComposerDrafts {
  const drafts = useContext(CodeComposerDraftContext);
  if (!drafts) throw new Error('Code composer drafts require the Code layout.');
  return drafts;
}
