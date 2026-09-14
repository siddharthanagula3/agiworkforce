import {
  DEVICE_STEP_DEFINITIONS,
  offeredDeviceStepTools,
  type DesktopHostDeclaration,
  type DeviceStepTool,
} from '@agiworkforce/local-runtime-contract';

/**
 * The device tools offered to the model for one request.
 *
 * Offering is decided entirely by what the desktop shell declared it holds: a
 * capability the user has not granted produces no tool, and a caller with no
 * desktop host produces none at all. A browser tab, the mobile app, the CLI and
 * the extensions therefore never see one, because none of them sends a
 * declaration and none of them could carry a step out if they did.
 */

function rootChoices(declaration: DesktopHostDeclaration): {
  ids: string[];
  described: string;
} {
  return {
    ids: declaration.roots.map((root) => root.id),
    described: declaration.roots
      .map((root) => `${root.id} = "${root.name}" (${root.path})`)
      .join('; '),
  };
}

function parametersFor(
  tool: DeviceStepTool,
  roots: { ids: string[]; described: string },
): Record<string, unknown> {
  const rootId = {
    type: 'string',
    enum: roots.ids,
    description: `Which granted folder to act in. ${roots.described}`,
  };

  switch (tool) {
    case 'device_read_file':
      return {
        type: 'object',
        properties: {
          rootId,
          path: { type: 'string', description: 'Path to the file, relative to the folder.' },
        },
        required: ['rootId', 'path'],
      };
    case 'device_list_folder':
      return {
        type: 'object',
        properties: {
          rootId,
          path: {
            type: 'string',
            description: 'Subfolder to list, relative to the folder. Omit to list the top level.',
          },
        },
        required: ['rootId'],
      };
    case 'device_write_file':
      return {
        type: 'object',
        properties: {
          rootId,
          path: { type: 'string', description: 'Path to the file, relative to the folder.' },
          text: { type: 'string', description: 'The complete new contents of the file.' },
        },
        required: ['rootId', 'path', 'text'],
      };
    case 'device_run_command':
      return {
        type: 'object',
        properties: {
          rootId,
          command: { type: 'string', description: 'The command line to run.' },
          path: {
            type: 'string',
            description: 'Subfolder to run in, relative to the folder. Omit to run at the top.',
          },
        },
        required: ['rootId', 'command'],
      };
  }
}

export interface DeviceToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export function deviceStepToolDefs(declaration: DesktopHostDeclaration): DeviceToolDef[] {
  const offered = offeredDeviceStepTools(declaration);
  if (offered.length === 0) return [];
  const roots = rootChoices(declaration);
  return offered.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool,
      description: `${DEVICE_STEP_DEFINITIONS[tool].description} Runs on the user's own machine (${declaration.deviceName}); the turn waits while it does.`,
      parameters: parametersFor(tool, roots),
    },
  }));
}
