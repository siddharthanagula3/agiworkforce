import type { CommandCapability } from '@agiworkforce/types';

export class DesktopRequiredError extends Error {
  readonly commandName: string;
  readonly capability: CommandCapability;

  constructor(commandName: string, capability: CommandCapability) {
    super(`Command "${commandName}" requires AGI Desktop (feature: ${capability.featureGroup}).`);
    this.name = 'DesktopRequiredError';
    this.commandName = commandName;
    this.capability = capability;
  }
}
