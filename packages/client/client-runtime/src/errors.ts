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
