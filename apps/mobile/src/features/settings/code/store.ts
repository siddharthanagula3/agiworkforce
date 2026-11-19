import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CloudCodeNetworkAccess } from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  DEFAULT_NETWORK_ACCESS,
  isNetworkAccess,
} from '@/src/features/cloud-code/networkAccessOptions';
import {
  DEFAULT_CODE_FONT,
  DEFAULT_TRANSCRIPT_FONT,
  isCodeFontId,
  isTranscriptFontId,
  type CodeFontId,
  type TranscriptFontId,
} from './codeAppearance';

interface CodePreferences {
  wrapLongLines: boolean;
  setWrapLongLines: (wrapLongLines: boolean) => void;
  showDiffSigns: boolean;
  setShowDiffSigns: (showDiffSigns: boolean) => void;
  codeFont: CodeFontId;
  setCodeFont: (codeFont: CodeFontId) => void;
  transcriptFont: TranscriptFontId;
  setTranscriptFont: (transcriptFont: TranscriptFontId) => void;
  defaultNetworkAccess: CloudCodeNetworkAccess;
  setDefaultNetworkAccess: (defaultNetworkAccess: CloudCodeNetworkAccess) => void;
  dismissKeyboardAfterSend: boolean;
  setDismissKeyboardAfterSend: (dismissKeyboardAfterSend: boolean) => void;
  showContextUsage: boolean;
  setShowContextUsage: (showContextUsage: boolean) => void;
  groupSessionsByRepository: boolean;
  setGroupSessionsByRepository: (groupSessionsByRepository: boolean) => void;
  approvalNoticeSeenAccounts: string[];
  markApprovalNoticeSeen: (accountKey: string) => void;
}

const STORE_NAME = 'code-preferences';

export const useCodePreferences = create<CodePreferences>()(
  persist(
    (set) => ({
      wrapLongLines: false,
      setWrapLongLines: (wrapLongLines) => set({ wrapLongLines }),
      showDiffSigns: true,
      setShowDiffSigns: (showDiffSigns) => set({ showDiffSigns }),
      codeFont: DEFAULT_CODE_FONT,
      setCodeFont: (codeFont) => set({ codeFont }),
      transcriptFont: DEFAULT_TRANSCRIPT_FONT,
      setTranscriptFont: (transcriptFont) => set({ transcriptFont }),
      defaultNetworkAccess: DEFAULT_NETWORK_ACCESS,
      setDefaultNetworkAccess: (defaultNetworkAccess) => set({ defaultNetworkAccess }),
      dismissKeyboardAfterSend: false,
      setDismissKeyboardAfterSend: (dismissKeyboardAfterSend) => set({ dismissKeyboardAfterSend }),
      showContextUsage: true,
      setShowContextUsage: (showContextUsage) => set({ showContextUsage }),
      groupSessionsByRepository: false,
      setGroupSessionsByRepository: (groupSessionsByRepository) =>
        set({ groupSessionsByRepository }),
      approvalNoticeSeenAccounts: [],
      markApprovalNoticeSeen: (accountKey) =>
        set((state) =>
          state.approvalNoticeSeenAccounts.includes(accountKey)
            ? state
            : { approvalNoticeSeenAccounts: [...state.approvalNoticeSeenAccounts, accountKey] },
        ),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({
        wrapLongLines: state.wrapLongLines,
        showDiffSigns: state.showDiffSigns,
        codeFont: state.codeFont,
        transcriptFont: state.transcriptFont,
        defaultNetworkAccess: state.defaultNetworkAccess,
        dismissKeyboardAfterSend: state.dismissKeyboardAfterSend,
        showContextUsage: state.showContextUsage,
        groupSessionsByRepository: state.groupSessionsByRepository,
        approvalNoticeSeenAccounts: state.approvalNoticeSeenAccounts,
      }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as {
          wrapLongLines?: unknown;
          showDiffSigns?: unknown;
          codeFont?: unknown;
          transcriptFont?: unknown;
          defaultNetworkAccess?: unknown;
          dismissKeyboardAfterSend?: unknown;
          showContextUsage?: unknown;
          groupSessionsByRepository?: unknown;
          approvalNoticeSeenAccounts?: unknown;
        };
        return {
          ...current,
          ...(typeof stored.wrapLongLines === 'boolean'
            ? { wrapLongLines: stored.wrapLongLines }
            : {}),
          ...(typeof stored.showDiffSigns === 'boolean'
            ? { showDiffSigns: stored.showDiffSigns }
            : {}),
          ...(isCodeFontId(stored.codeFont) ? { codeFont: stored.codeFont } : {}),
          ...(isTranscriptFontId(stored.transcriptFont)
            ? { transcriptFont: stored.transcriptFont }
            : {}),
          ...(isNetworkAccess(stored.defaultNetworkAccess)
            ? { defaultNetworkAccess: stored.defaultNetworkAccess }
            : {}),
          ...(typeof stored.dismissKeyboardAfterSend === 'boolean'
            ? { dismissKeyboardAfterSend: stored.dismissKeyboardAfterSend }
            : {}),
          ...(typeof stored.showContextUsage === 'boolean'
            ? { showContextUsage: stored.showContextUsage }
            : {}),
          ...(typeof stored.groupSessionsByRepository === 'boolean'
            ? { groupSessionsByRepository: stored.groupSessionsByRepository }
            : {}),
          ...(Array.isArray(stored.approvalNoticeSeenAccounts)
            ? {
                approvalNoticeSeenAccounts: stored.approvalNoticeSeenAccounts.filter(
                  (account): account is string => typeof account === 'string',
                ),
              }
            : {}),
        };
      },
    },
  ),
);

rehydrateWhenMmkvReady(useCodePreferences, STORE_NAME);

export function useCodePreferencesHydrated(): boolean {
  return useSyncExternalStore(
    (notify) => useCodePreferences.persist.onFinishHydration(notify),
    () => useCodePreferences.persist.hasHydrated(),
  );
}
