import {
  MAX_PHONE_STEP_LOCATION_LENGTH,
  MAX_PHONE_STEP_NOTES_LENGTH,
  MAX_PHONE_STEP_RANGE_DAYS,
  MAX_PHONE_STEP_TITLE_LENGTH,
} from '@agiworkforce/types';
import {
  DEVICE_STEP_DEFINITIONS,
  MAX_DEVICE_CLICK_COUNT,
  MAX_DEVICE_COORDINATE,
  MAX_DEVICE_DISPLAY_ID,
  MAX_DEVICE_REVIEW_LENGTH,
  MAX_DEVICE_SCROLL_DELTA,
  MAX_DEVICE_SEARCH_LENGTH,
  MAX_DEVICE_TYPE_LENGTH,
  MAX_DEVICE_WAIT_MS,
  DEVICE_BROWSER_CONSOLE_LEVELS,
  DEVICE_KEY_MODIFIERS,
  DEVICE_MOUSE_BUTTONS,
  DEVICE_NAMED_KEYS,
  offeredDeviceStepTools,
  deviceStepScope,
  type DesktopHostDeclaration,
  type DeviceStepTool,
} from '@agiworkforce/local-runtime-contract';

/**
 * The device tools offered to the model for one request.
 *
 * Offering is decided entirely by what the host declared it holds: a
 * capability the user has not granted produces no tool, and a caller with no
 * host produces none at all. A browser tab, the CLI and the extensions therefore
 * never see one, because none of them sends a declaration and none of them could
 * carry a step out if they did. The mobile app declares only the phone steps it
 * can run, and a desktop shell only the desktop ones.
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

const REVIEW = {
  type: 'string',
  maxLength: MAX_DEVICE_REVIEW_LENGTH,
  description:
    'Set this when the step pays or buys something, sends a message or a post, submits personal or account details, deletes something, changes a security or privacy setting, or enters a password: one short sentence saying what it will do. The user is asked before the step runs.',
} as const;

function phoneTime(what: string): Record<string, unknown> {
  return {
    type: 'string',
    description: `${what}, as a wall-clock time on the phone like 2026-10-02T15:00.`,
  };
}

function phoneText(maxLength: number, description: string): Record<string, unknown> {
  return { type: 'string', maxLength, description };
}

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
    case 'device_edit_file':
      return {
        type: 'object',
        properties: {
          rootId,
          path: { type: 'string', description: 'Path to the file, relative to the folder.' },
          oldText: {
            type: 'string',
            description: 'The exact passage to replace, copied from the file as it is now.',
          },
          newText: { type: 'string', description: 'The text to put in its place.' },
          replaceAll: {
            type: 'boolean',
            description: 'Replace every occurrence instead of requiring exactly one.',
          },
        },
        required: ['rootId', 'path', 'oldText', 'newText'],
      };
    case 'device_find_files':
      return {
        type: 'object',
        properties: {
          rootId,
          pattern: {
            type: 'string',
            maxLength: MAX_DEVICE_SEARCH_LENGTH,
            description:
              'Glob pattern relative to the folder: * matches within one name and ** matches across folders.',
          },
          path: {
            type: 'string',
            description: 'Subfolder to search, relative to the folder. Omit to search all of it.',
          },
        },
        required: ['rootId', 'pattern'],
      };
    case 'device_search_text':
      return {
        type: 'object',
        properties: {
          rootId,
          query: {
            type: 'string',
            maxLength: MAX_DEVICE_SEARCH_LENGTH,
            description: 'The text to look for, matched literally.',
          },
          ignoreCase: {
            type: 'boolean',
            description: 'Match regardless of upper and lower case.',
          },
          path: {
            type: 'string',
            description: 'Subfolder to search, relative to the folder. Omit to search all of it.',
          },
        },
        required: ['rootId', 'query'],
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
    case 'device_start_command':
      return {
        type: 'object',
        properties: {
          rootId,
          command: {
            type: 'string',
            description: 'The command line to start, such as npm run dev.',
          },
          path: {
            type: 'string',
            description: 'Subfolder to start in, relative to the folder. Omit to start at the top.',
          },
        },
        required: ['rootId', 'command'],
      };
    case 'device_command_output':
      return {
        type: 'object',
        properties: {
          rootId,
          runId: {
            type: 'string',
            description: 'The runId device_start_command returned.',
          },
          input: {
            type: 'string',
            maxLength: MAX_DEVICE_TYPE_LENGTH,
            description:
              'Text to type into the command before reading, such as an answer to its prompt. End it with a newline to press Enter.',
          },
        },
        required: ['rootId', 'runId'],
      };
    case 'device_command_stop':
      return {
        type: 'object',
        properties: {
          rootId,
          runId: {
            type: 'string',
            description: 'The runId device_start_command returned.',
          },
        },
        required: ['rootId', 'runId'],
      };
    case 'device_screenshot':
      return {
        type: 'object',
        properties: {
          display: {
            type: 'integer',
            minimum: 0,
            maximum: MAX_DEVICE_DISPLAY_ID,
            description:
              'Id of the display to capture, from the displays a previous screenshot listed. Omit to capture the screen the last screenshot showed, or the one under the pointer.',
          },
        },
        required: [],
      };
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
          review: REVIEW,
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
          review: REVIEW,
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
          review: REVIEW,
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
          review: REVIEW,
        },
        required: ['key'],
      };
    case 'device_browser_read_page':
    case 'device_browser_screenshot':
      return { type: 'object', properties: {}, required: [] };
    case 'device_browser_console':
      return {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: [...DEVICE_BROWSER_CONSOLE_LEVELS],
            description: 'Only messages of this level. Omit to read every level.',
          },
          pattern: {
            type: 'string',
            description: 'Only messages matching this regular expression, ignoring case.',
          },
        },
        required: [],
      };
    case 'device_browser_network':
      return {
        type: 'object',
        properties: {
          failedOnly: {
            type: 'boolean',
            description: 'Only requests that failed or returned an error status.',
          },
          pattern: {
            type: 'string',
            description: 'Only requests whose address matches this regular expression.',
          },
        },
        required: [],
      };
    case 'device_browser_navigate':
    case 'device_browser_download':
      return {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              tool === 'device_browser_navigate'
                ? 'The http or https address to open.'
                : 'The http or https address of the file to download.',
          },
        },
        required: ['url'],
      };
    case 'device_browser_click':
      return {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the element to click, taken from the page you read.',
          },
          review: REVIEW,
        },
        required: ['selector'],
      };
    case 'device_browser_type':
      return {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the field to type into, taken from the page you read.',
          },
          text: {
            type: 'string',
            maxLength: MAX_DEVICE_TYPE_LENGTH,
            description: 'The text to type.',
          },
          clear: {
            type: 'boolean',
            description: 'Empty the field before typing.',
          },
          review: REVIEW,
        },
        required: ['selector', 'text'],
      };
    case 'device_calendar_events':
    case 'device_calendar_availability':
      return {
        type: 'object',
        properties: {
          start: phoneTime('Start of the range'),
          end: phoneTime(
            `End of the range, at most ${MAX_PHONE_STEP_RANGE_DAYS} days after the start`,
          ),
        },
        required: ['start', 'end'],
      };
    case 'device_calendar_create_event':
      return {
        type: 'object',
        properties: {
          title: phoneText(MAX_PHONE_STEP_TITLE_LENGTH, 'What the event is called.'),
          start: phoneTime('When the event starts; for an all-day event a date like 2026-10-02'),
          end: phoneTime('When the event ends. Required unless allDay is set'),
          allDay: { type: 'boolean', description: 'Make it an all-day event on the start date.' },
          location: phoneText(MAX_PHONE_STEP_LOCATION_LENGTH, 'Where it takes place.'),
          notes: phoneText(MAX_PHONE_STEP_NOTES_LENGTH, 'Notes to save with the event.'),
        },
        required: ['title', 'start'],
      };
    case 'device_reminder_create':
      return {
        type: 'object',
        properties: {
          title: phoneText(MAX_PHONE_STEP_TITLE_LENGTH, 'What to be reminded of.'),
          due: phoneTime('When the reminder is due. Omit for a reminder with no time'),
          notes: phoneText(MAX_PHONE_STEP_NOTES_LENGTH, 'Notes to save with the reminder.'),
        },
        required: ['title'],
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
      description: `${DEVICE_STEP_DEFINITIONS[tool].description} Runs on the user's ${
        deviceStepScope(tool) === 'phone' ? 'phone' : 'own machine'
      } (${declaration.deviceName}); the turn waits while it does.`,
      parameters: parametersFor(tool, roots),
    },
  }));
}
