'use client';

/**
 * Applies the transcript appearance preferences to the document.
 *
 * These preferences are stamped as data attributes on `<html>` and everything
 * visual happens in `app/globals.css` (`html[data-chat-text-size]`,
 * `html[data-code-block-wrap]`). Doing it in CSS rather than by threading props
 * through the renderer means it reaches every fenced code block and every prose
 * body, including the ones rendered inside artifacts and the shared markdown
 * component, without touching them.
 *
 * This component exists because the previous attempt at a text-size preference
 * stored a value with no stylesheet behind it — the control moved, and nothing
 * on screen changed. The store field and the CSS rule are added together, or
 * neither is.
 *
 * Renders nothing.
 */

import { useEffect } from 'react';

import { useSettingsStore } from '@shared/stores/web-settings-store';

export function AppearancePreferences() {
  const chatTextSize = useSettingsStore((state) => state.chatTextSize);
  const codeBlockWrap = useSettingsStore((state) => state.codeBlockWrap);

  useEffect(() => {
    const root = document.documentElement;
    // 'default' is the stylesheet's own value, so the attribute is REMOVED
    // rather than set — that keeps the default path free of an override rule
    // and makes the DOM honest about whether a preference is in effect.
    if (chatTextSize === 'default') root.removeAttribute('data-chat-text-size');
    else root.setAttribute('data-chat-text-size', chatTextSize);
  }, [chatTextSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (codeBlockWrap) root.setAttribute('data-code-block-wrap', 'on');
    else root.removeAttribute('data-code-block-wrap');
  }, [codeBlockWrap]);

  return null;
}

export default AppearancePreferences;
