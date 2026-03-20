/**
 * Runtime errors for capability-aware command dispatch.
 */

import type { CommandCapability } from '@agiworkforce/types';

/**
 * Thrown when a desktop-only command is invoked from a non-desktop runtime.
 * UI layers should catch this and show a "download desktop" CTA.
 */
export class DesktopRequiredError extends Error {
  readonly commandName: string;
  readonly capability: CommandCapability;

  constructor(commandName: string, capability: CommandCapability) {
    super(
      `Command "${commandName}" requires the AGI Workforce desktop app (feature: ${capability.featureGroup}).`,
    );
    this.name = 'DesktopRequiredError';
    this.commandName = commandName;
    this.capability = capability;
  }
}

/**
 * Warning object for desktop-preferred commands that fell back to cloud.
 * Not thrown — returned alongside the result for UI to show a subtle toast.
 */
export interface DesktopPreferredWarning {
  type: 'desktop-preferred';
  commandName: string;
  featureGroup: string;
  message: string;
}

export function createDesktopPreferredWarning(
  commandName: string,
  featureGroup: string,
): DesktopPreferredWarning {
  return {
    type: 'desktop-preferred',
    commandName,
    featureGroup,
    message: `"${commandName}" works better on the desktop app (${featureGroup}).`,
  };
}
