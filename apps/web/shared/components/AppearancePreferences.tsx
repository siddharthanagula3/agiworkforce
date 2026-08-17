'use client';

import { useEffect } from 'react';

import { useSettingsStore } from '@shared/stores/web-settings-store';

export function AppearancePreferences() {
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const highContrast = useSettingsStore((state) => state.highContrast);

  useEffect(() => {
    const root = document.documentElement;
    if (chatTextSize === 'default') root.removeAttribute('data-chat-text-size');
    else root.setAttribute('data-chat-text-size', chatTextSize);
  }, [chatTextSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (codeBlockWrap) root.setAttribute('data-code-block-wrap', 'on');
    else root.removeAttribute('data-code-block-wrap');
  }, [codeBlockWrap]);

  useEffect(() => {
    const root = document.documentElement;
    if (accentColor === 'default') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) root.setAttribute('data-contrast', 'more');
    else root.removeAttribute('data-contrast');
  }, [highContrast]);

  return null;
}

export default AppearancePreferences;
