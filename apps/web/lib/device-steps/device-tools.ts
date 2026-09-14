import {
  DEVICE_STEP_DEFINITIONS,
  MAX_DEVICE_CLICK_COUNT,
  MAX_DEVICE_COORDINATE,
  MAX_DEVICE_SCROLL_DELTA,
  MAX_DEVICE_TYPE_LENGTH,
  MAX_DEVICE_WAIT_MS,
  DEVICE_KEY_MODIFIERS,
  DEVICE_MOUSE_BUTTONS,
  DEVICE_NAMED_KEYS,
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

const COORDINATE_RANGE = { type: 'integer', minimum: 0, maximum: MAX_DEVICE_COORDINATE } as const;

function coordinate(axis: 'x' | 'y', what: string): Record<string, unknown> {
  return {
    ...COORDINATE_RANGE,
    description: `${axis === 'x' ? 'Distance from the left edge' : 'Distance from the top edge'} of the last screenshot, in its own pixels, ${what}.`,
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
    case 'device_screenshot':
      return { type: 'object', properties: {}, required: [] };
    case 'device_zoom':
      return {
        type: 'object',
        properties: {
          region: {
            type: 'object',
            description: 'The rectangle to look at, in the coordinates of the last screenshot.',
            properties: {
              x: coordinate('x', 'of the left edge of the rectangle'),
              y: coordinate('y', 'of the top edge of the rectangle'),
              width: { type: 'integer', minimum: 1, maximum: MAX_DEVICE_COORDINATE },
              height: { type: 'integer', minimum: 1, maximum: MAX_DEVICE_COORDINATE },
            },
            required: ['x', 'y', 'width', 'height'],
          },
        },
        required: ['region'],
      };
    case 'device_move':
      return {
        type: 'object',
        properties: {
          x: coordinate('x', 'of the point to move to'),
          y: coordinate('y', 'of the point to move to'),
        },
        required: ['x', 'y'],
      };
    case 'device_click':
      return {
        type: 'object',
        properties: {
          x: coordinate('x', 'of the point to click'),
          y: coordinate('y', 'of the point to click'),
          button: {
            type: 'string',
            enum: [...DEVICE_MOUSE_BUTTONS],
            description: 'Which button to press. Defaults to left.',
          },
          count: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_DEVICE_CLICK_COUNT,
            description: '1 for a single click, 2 to open something, 3 to select a line.',
          },
        },
        required: ['x', 'y'],
      };
    case 'device_drag':
      return {
        type: 'object',
        properties: {
          x: coordinate('x', 'where the drag starts'),
          y: coordinate('y', 'where the drag starts'),
          toX: coordinate('x', 'where the drag ends'),
          toY: coordinate('y', 'where the drag ends'),
        },
        required: ['x', 'y', 'toX', 'toY'],
      };
    case 'device_scroll':
      return {
        type: 'object',
        properties: {
          x: coordinate('x', 'of the point to scroll over'),
          y: coordinate('y', 'of the point to scroll over'),
          deltaY: {
            type: 'integer',
            minimum: -MAX_DEVICE_SCROLL_DELTA,
            maximum: MAX_DEVICE_SCROLL_DELTA,
            description: 'Negative scrolls up, positive scrolls down. About 300 is one screenful.',
          },
          deltaX: {
            type: 'integer',
            minimum: -MAX_DEVICE_SCROLL_DELTA,
            maximum: MAX_DEVICE_SCROLL_DELTA,
            description: 'Negative scrolls left, positive scrolls right.',
          },
        },
        required: ['x', 'y'],
      };
    case 'device_type':
      return {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            maxLength: MAX_DEVICE_TYPE_LENGTH,
            description: 'The text to type where the keyboard focus already is.',
          },
        },
        required: ['text'],
      };
    case 'device_key':
      return {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: `One printable character, or one of: ${DEVICE_NAMED_KEYS.join(', ')}.`,
          },
          modifiers: {
            type: 'array',
            items: { type: 'string', enum: [...DEVICE_KEY_MODIFIERS] },
            description: 'Modifiers held while the key is pressed.',
          },
        },
        required: ['key'],
      };
    case 'device_wait':
      return {
        type: 'object',
        properties: {
          ms: {
            type: 'integer',
            minimum: 0,
            maximum: MAX_DEVICE_WAIT_MS,
            description: 'How long to wait, in milliseconds.',
          },
        },
        required: ['ms'],
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
