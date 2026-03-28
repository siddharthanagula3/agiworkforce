export { RuntimeEnv, isTauri, isCloudWeb, isTest, getRuntimeEnv } from './detect';

export { command, commandWithWarning } from './desktop-command';
export type { CommandResult } from './desktop-command';

export { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
export type { DesktopPreferredWarning } from './errors';

export { resolveCommandCapability } from './registry';

export { listen, once, emit } from './events';
export type { EventCallback, UnlistenFn } from './events';

export { routeToCloud } from './http';
