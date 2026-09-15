import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * Window chrome for the cloud shell.
 *
 * The three values below are injected by `build-main.mjs`, which reads them out
 * of `packages/ui/design-tokens/src` at build time. They are not defaults: a
 * literal here would let the window and the page it loads disagree about the
 * page background and about where the title strip ends, which is exactly the
 * drift that put the brand mark under the traffic lights the first time the
 * native title bar was hidden.
 */
declare const AGI_PAGE_BACKGROUND_LIGHT: string;
declare const AGI_PAGE_BACKGROUND_DARK: string;
declare const AGI_TITLE_STRIP_HEIGHT: number;

/**
 * AppKit's own metrics for the window buttons, not ours to choose: the group is
 * 16px tall including its focus ring, and a standard title bar leaves 13px of
 * leading space before the close button.
 */
const MACOS_WINDOW_BUTTON_HEIGHT = 16;
const MACOS_WINDOW_BUTTON_LEADING_INSET = 13;
const MACOS_WINDOW_BUTTON_DIAMETER = 12;
const MACOS_WINDOW_BUTTON_PITCH = 23;

/**
 * Where the window buttons stop, so a page can be told where it may start.
 *
 * Measured off a real window rather than taken from the AppKit documentation:
 * `hiddenInset` spaces the group wider than a plain title bar does, and the
 * documented 20px pitch put the trailing edge 7px left of where it actually is,
 * which is how a brand mark ended up flush against the zoom button.
 */
export function windowButtonsTrailingEdge(): number {
  return (
    MACOS_WINDOW_BUTTON_LEADING_INSET + MACOS_WINDOW_BUTTON_PITCH * 2 + MACOS_WINDOW_BUTTON_DIAMETER
  );
}

/**
 * The gap the page must leave after the window buttons. A trailing gutter equal
 * to the platform's own leading inset; Claude's desktop app measures 13.5px in
 * the same place.
 */
export function windowButtonsTrailingGutter(): number {
  return MACOS_WINDOW_BUTTON_LEADING_INSET;
}

export function titleStripHeight(): number {
  return AGI_TITLE_STRIP_HEIGHT;
}

export function pageBackgroundColor(prefersDark: boolean): string {
  return prefersDark ? AGI_PAGE_BACKGROUND_DARK : AGI_PAGE_BACKGROUND_LIGHT;
}

export function trafficLightPosition(stripHeight: number): { x: number; y: number } {
  return {
    x: MACOS_WINDOW_BUTTON_LEADING_INSET,
    y: Math.round((stripHeight - MACOS_WINDOW_BUTTON_HEIGHT) / 2),
  };
}

/**
 * macOS hands the title strip back to the page and floats the window buttons
 * over it; every other platform keeps its native frame, where the page owns
 * nothing above the content area.
 */
export function titleBarChrome(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  if (platform !== 'darwin') return {};
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: trafficLightPosition(titleStripHeight()),
  };
}
