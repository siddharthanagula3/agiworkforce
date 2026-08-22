'use client';

import { useEffect } from 'react';

import { useSettingsStore } from '@shared/stores/web-settings-store';

export function AppearancePreferences() {
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const highContrast = useSettingsStore((state) => state.highContrast);
  const motion = useSettingsStore((state) => state.motion);
  const chatFont = useSettingsStore((state) => state.chatFont) ?? 'default';

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

  // 'system' leaves the OS preference in charge; 'reduced' is an in-app
  // override for someone who wants calm here without changing their whole
  // machine. There is deliberately no "full motion" option: overriding a user
  // who asked their OS for reduced motion is the one direction that harms.
  useEffect(() => {
    const root = document.documentElement;
    if (motion === 'reduced') root.setAttribute('data-motion', 'reduced');
    else root.removeAttribute('data-motion');
  }, [motion]);

  useEffect(() => {
    const root = document.documentElement;
    if (chatFont === 'default') root.removeAttribute('data-chat-font');
    else root.setAttribute('data-chat-font', chatFont);
  }, [chatFont]);

  return null;
}

export default AppearancePreferences;
