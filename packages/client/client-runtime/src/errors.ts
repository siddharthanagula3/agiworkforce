
import type { CommandCapability } from '@agiworkforce/types';

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
