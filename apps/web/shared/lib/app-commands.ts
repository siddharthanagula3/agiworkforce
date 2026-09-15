'use client';

/**
 * Commands one part of the app asks another to carry out.
 *
 * The two below open overlays the chat surface owns and renders. They already
 * travelled as `window` events, which is why this is an event bus rather than a
 * store: the listeners existed with nothing dispatching to them, so a native
 * menu item or any other caller had no way to reach them. Naming the events in
 * one place is what makes the pair a contract instead of two matching strings.
 */
export const APP_COMMANDS = ['open-search', 'open-shortcuts'] as const;

export type AppCommand = (typeof APP_COMMANDS)[number];

function eventName(command: AppCommand): string {
  return `agi:${command}`;
}

export function emitAppCommand(command: AppCommand): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(eventName(command)));
}

export function onAppCommand(command: AppCommand, handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(eventName(command), handler);
  return () => window.removeEventListener(eventName(command), handler);
}
