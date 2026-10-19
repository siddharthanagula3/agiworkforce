'use client';

/**
 * Commands one part of the app asks another to carry out.
 *
 * These open overlays the chat surface and the app shell own and render,
 * reachable from a native menu item or any other caller. Naming the events in
 * one place is what makes them a contract instead of matching strings.
 */
export const APP_COMMANDS = ['open-search', 'open-shortcuts', 'open-upgrade'] as const;

export type AppCommand = (typeof APP_COMMANDS)[number];

function eventName(command: AppCommand): string {
  return `agi:${command}`;
}

/** Whether a mounted surface carried the command out. */
export function emitAppCommand(command: AppCommand): boolean {
  if (typeof window === 'undefined') return false;
  const event = new Event(eventName(command), { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function onAppCommand(command: AppCommand, handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    event.preventDefault();
    handler();
  };
  window.addEventListener(eventName(command), listener);
  return () => window.removeEventListener(eventName(command), listener);
}

export const PLANS_PAGE_PATH = '/pricing';

/**
 * Opens the in-app plan dialog where a surface hosts one, and the plans page
 * where none does. In the desktop shell /pricing leaves for the system browser,
 * which may not be signed in.
 */
export function openUpgrade(navigate: (href: string) => void): void {
  if (!emitAppCommand('open-upgrade')) navigate(PLANS_PAGE_PATH);
}
