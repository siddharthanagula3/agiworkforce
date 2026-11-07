'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useReadonlyIdentityLifetime } from '@/lib/identity/useSessionSnapshot';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useProjectStore } from '@features/projects';
import { useLocalModelSelection } from '@features/desktop-host';

interface ClipboardDraftOptions {
  conversationId: string | null;
  projectId: string | null;
  pickerProjectId: string | null;
  pickerOwned: boolean;
  onRetire: () => void;
}

interface ClipboardReadGroup {
  scope: string;
  navigation: string;
  identity: { isCurrent: () => boolean };
  pending: Set<object>;
}

function scopeKey(options: ClipboardDraftOptions): string {
  return JSON.stringify([
    options.conversationId,
    options.conversationId === null ? (options.projectId ?? options.pickerProjectId) : null,
    options.conversationId === null && options.projectId === null && options.pickerOwned,
  ]);
}

function navigationKey(options: ClipboardDraftOptions): string {
  const chat = useChatStore.getState();
  return JSON.stringify([
    options.conversationId === null && options.projectId !== null
      ? null
      : chat.activeConversationId,
    useLocalModelSelection.getState().selected !== null,
    options.conversationId === null
      ? null
      : (chat.conversations.find((entry) => entry.id === options.conversationId)?.projectId ??
        null),
    options.conversationId === null && options.projectId === null && options.pickerOwned
      ? useProjectStore.getState().activeProjectId
      : null,
  ]);
}

export function useClipboardDraftLifetime(options: ClipboardDraftOptions) {
  const captureIdentity = useReadonlyIdentityLifetime();
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mountedRef = useRef(true);
  const groupRef = useRef<ClipboardReadGroup | null>(null);
  const [reading, setReading] = useState<{ group: ClipboardReadGroup; count: number } | null>(null);

  const retire = useCallback(() => {
    optionsRef.current.onRetire();
    groupRef.current = null;
    if (mountedRef.current) setReading(null);
  }, []);

  const isCurrentGroup = useCallback(
    (group: ClipboardReadGroup) => {
      if (!mountedRef.current || groupRef.current !== group) return false;
      if (
        group.scope !== scopeKey(optionsRef.current) ||
        group.navigation !== navigationKey(optionsRef.current) ||
        !group.identity.isCurrent()
      ) {
        retire();
        return false;
      }
      return true;
    },
    [retire],
  );

  const renderedGroup = groupRef.current;
  if (
    renderedGroup &&
    (renderedGroup.scope !== scopeKey(options) ||
      renderedGroup.navigation !== navigationKey(options) ||
      !renderedGroup.identity.isCurrent())
  ) {
    options.onRetire();
    groupRef.current = null;
  }

  useLayoutEffect(() => {
    mountedRef.current = true;
    const observe = () => {
      const group = groupRef.current;
      if (group) isCurrentGroup(group);
    };
    const unsubscribeChat = useChatStore.subscribe(observe);
    const unsubscribeProject = useProjectStore.subscribe(observe);
    const unsubscribeLocalSelection = useLocalModelSelection.subscribe(observe);
    return () => {
      mountedRef.current = false;
      optionsRef.current.onRetire();
      groupRef.current = null;
      unsubscribeChat();
      unsubscribeProject();
      unsubscribeLocalSelection();
    };
  }, [isCurrentGroup]);

  const begin = useCallback(() => {
    let group = groupRef.current;
    if (group && !isCurrentGroup(group)) group = null;
    if (!group) {
      group = {
        scope: scopeKey(optionsRef.current),
        navigation: navigationKey(optionsRef.current),
        identity: captureIdentity(),
        pending: new Set(),
      };
      groupRef.current = group;
    }
    const owner = group;
    const token = {};
    owner.pending.add(token);
    setReading({ group: owner, count: owner.pending.size });
    return {
      isCurrent: () => owner.pending.has(token) && isCurrentGroup(owner),
      finish: () => {
        if (!owner.pending.delete(token)) return;
        if (!isCurrentGroup(owner)) return;
        setReading({ group: owner, count: owner.pending.size });
      },
    };
  }, [captureIdentity, isCurrentGroup]);

  return {
    readingClipboard: reading !== null && reading.group === groupRef.current && reading.count > 0,
    retire,
    begin,
  };
}
