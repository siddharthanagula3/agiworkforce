/**
 * useIsMounted — returns a ref whose `.current` flips to `false` after the
 * component unmounts.
 *
 * **STATUS (2026-05-22)**: this hook exists for HISTORICAL reasons. The
 * "Can't perform a React state update on an unmounted component" warning
 * was REMOVED in React 18 (see
 * https://github.com/reactwg/react-18/discussions/82) — React 19, which
 * this app uses, silently no-ops `setState` on unmounted components. So
 * the unmount race this hook was extracted to handle does NOT actually
 * fire warnings or leak memory in the current React version.
 *
 * **DO NOT migrate additional components to this hook.** An earlier
 * sweep migrated 14 components (BridgeStatusCard, OAuthConnectorCard,
 * SaveToMemoryButton, MemoryCard, ToolLabel, ArtifactToolbar,
 * DataSection, DotfileSettings.ConfigEditorSection, ConnectorDetailView,
 * ArtifactVersionHistory, MemoryImport, ShareConversationDialog,
 * AgentTaskCreator, DatabaseWorkspace.SchemaExplorer). Those are
 * harmless but redundant. The remaining ~50 candidates from the sweep
 * should be left alone.
 *
 * **When the hook IS legitimately useful**: when an async handler's
 * resolved value needs to be applied to fresh state from a new mount
 * (e.g. component re-keyed mid-promise). This is rare; verify the
 * scenario before reaching for the hook.
 *
 * Usage:
 * ```tsx
 * const isMounted = useIsMounted();
 *
 * const handleClick = useCallback(async () => {
 *   setLoading(true);
 *   try {
 *     await doWork();
 *     if (!isMounted.current) return;
 *     setData(result);
 *   } finally {
 *     if (isMounted.current) setLoading(false);
 *   }
 * }, []);
 * ```
 */

import { useEffect, useRef, type RefObject } from 'react';

export function useIsMounted(): RefObject<boolean> {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}
