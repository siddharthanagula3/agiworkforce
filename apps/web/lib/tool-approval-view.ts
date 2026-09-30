import {
  PLATFORM_TOOL_METADATA,
  policyAutoApprovesTool,
} from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import {
  TOOL_CALL_GATE_RANKS,
  type ToolCallGateRank,
} from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import {
  TOOL_APPROVAL_POLICIES,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';

export interface ToolApprovalSource {
  toolNames: readonly string[];
  autoApproves: (policy: ToolApprovalPolicy, qualifiedName: string) => boolean;
}

export const PLATFORM_TOOL_APPROVAL_SOURCE: ToolApprovalSource = {
  toolNames: Object.keys(PLATFORM_TOOL_METADATA),
  autoApproves: policyAutoApprovesTool,
};

export interface ToolApprovalToolRow {
  name: string;
  label: string;
  description: string;
  runsWithoutAsking: readonly ToolApprovalPolicy[];
}

export interface ToolApprovalPolicyRow {
  policy: ToolApprovalPolicy;
  label: string;
  summary: string;
  isDefault: boolean;
  runsWithoutAsking: readonly string[];
}

export interface ToolApprovalPrecedenceRow {
  rank: number;
  reason: string;
  condition: string;
  outcome: string;
}

const TOOL_COPY: Readonly<Record<string, { label: string; description: string }>> = {
  web_search: {
    label: 'Web search',
    description:
      'Runs a search and reads the results. Classified as a read that accepts untrusted content and creates an egress path, because a search query is a place secrets can leak and a result page is attacker-influenced text.',
  },
  search_places: {
    label: 'Place search',
    description:
      'Looks up businesses and places by name or kind near a location, with ratings and opening hours, and shows them in the conversation.',
  },
  ask_clarifying_questions: {
    label: 'Ask you a question',
    description:
      'Asks you to choose between options when a request could mean more than one thing, and continues with the answer you give.',
  },
  search_maps: {
    label: 'Map search',
    description:
      'Looks up a place or a route and renders a map card in the conversation. A search, not a verified place identity and not turn-by-turn navigation.',
  },
  plan_itinerary: {
    label: 'Plan an itinerary',
    description:
      'Looks up each stop of a trip plan as a places search and renders the plan as an itinerary card with a map and directions links. It reads place data and books nothing.',
  },
  compare_products: {
    label: 'Compare products',
    description:
      'Renders the products a search found as a comparison card with prices, stores, buy links and specs. It keeps only links this turn retrieved, makes no request of its own and buys nothing.',
  },
  url_fetch: {
    label: 'Fetch a page',
    description:
      'Fetches a single URL through an SSRF-guarded path. Same classification as search, for the same reasons.',
  },
  execute_code: {
    label: 'Run code',
    description:
      'Executes model-authored code in an isolated cloud sandbox belonging to that conversation, not on your device. Classified as an irreversible execute action that creates an egress path.',
  },
  run_command: {
    label: 'Run a shell command',
    description:
      'Runs a shell command inside the Code session cloud sandbox. Commands are checked for denied and destructive operations; their risk and your approval mode decide whether they run or wait for confirmation.',
  },
  write_file: {
    label: 'Write a file',
    description:
      "Writes a file inside the conversation's own sandbox workspace. Not your filesystem, not your cloud storage. Classified as an irreversible write, so no account default runs it on its own.",
  },
  create_folder: {
    label: 'Create a folder',
    description: 'Creates a folder in that same sandbox workspace. Reversible, and no egress path.',
  },
  list_files: {
    label: 'List files',
    description: 'Lists what is in that sandbox workspace. Reads nothing outside it.',
  },
  read_file: {
    label: 'Read a file',
    description:
      'Reads a file back out of that sandbox workspace. Classified as accepting untrusted content, because whatever a previous step wrote there can be attacker-influenced.',
  },
  edit_file: {
    label: 'Edit a file',
    description:
      'Edits a file already in that sandbox workspace. Classified as an irreversible write, so no account default runs it on its own.',
  },
  create_office_file: {
    label: 'Create a document file',
    description:
      'Generates a Word document (.docx), a PowerPoint deck (.pptx), an Excel workbook (.xlsx), a PDF (.pdf) or a CSV (.csv) on our servers and attaches it to the conversation for you to download. Those five formats are the whole of it, and it never edits a file you already have. Reversible, no egress path.',
  },
  generate_image: {
    label: 'Create an image',
    description:
      'Creates an image from a description and shows it in the conversation. It runs the same pipeline as Image mode, with its safety checks, model policy and credit charge, and is offered only when your plan includes image generation. Classified as a reversible write with no egress path.',
  },
  edit_image: {
    label: 'Edit an image',
    description:
      'Makes a new version of an image you attached or one made earlier in the conversation, through the same pipeline as Image mode. The original is kept. Classified as a reversible write with no egress path.',
  },
  read_tool_result: {
    label: 'Read a stored tool result',
    description:
      'Reads back a tool result that was too long to show in full, or that was trimmed from earlier in the conversation, from the copy kept under your account. Classified as accepting untrusted content, because that result came from a page, a file or a sandbox run.',
  },
  skill: {
    label: 'Run a skill',
    description:
      "Loads a skill's instructions into the turn. Skills act through the tools above and are gated by them.",
  },
  save_memory: {
    label: 'Save a memory',
    description:
      'Saves one lasting fact about you to your Memory when you ask it to remember something or state a preference you would want used later. You can review and delete it in Memory settings. Reversible, no egress path.',
  },
  search_memory: {
    label: 'Search memories',
    description:
      'Searches the facts saved in your Memory for ones relevant to the current question. Reads only your own Memory and has no egress path.',
  },
  forget_memory: {
    label: 'Forget memories',
    description:
      'Deletes the saved memories whose text contains the subject you asked it to forget. Classified as an irreversible delete, so no account default runs it on its own.',
  },
  search_files: {
    label: 'Search your files',
    description:
      "Searches the files you uploaded and your project's knowledge for passages about a topic and returns the best excerpts. Classified as accepting untrusted content, because a document can carry attacker-written text.",
  },
  open_file: {
    label: 'Open one of your files',
    description:
      "Reads one of the files you uploaded or your project's knowledge files whole, by the id a file search returned. Classified as accepting untrusted content, because a document can carry attacker-written text.",
  },
  create_schedule: {
    label: 'Create a scheduled task',
    description:
      'Creates a task that runs a prompt on its own at a set time, once or on a repeating cadence, and lists it in Schedules, where you can pause or delete it. Reversible, no egress path.',
  },
  draft_plugin: {
    label: 'Draft a plugin',
    description:
      'Checks a plugin written in the chat the way the create form does and shows it as a draft card. Nothing is saved until you press Save plugin or Save as a skill.',
  },
  agi_work: {
    label: 'Start an AGI Work task',
    description:
      'Offered in a voice session: hands the goal you spoke to the chat as an AGI Work task, which runs in the background and is tracked in Tasks, where you can stop it. Reversible, no egress path.',
  },
  device_read_file: {
    label: 'Read a file on your computer',
    description:
      'Reads a text file in a folder you granted to the desktop app. The contents come back to the chat.',
  },
  device_list_folder: {
    label: 'List a folder on your computer',
    description: 'Lists the files and folders inside a folder you granted to the desktop app.',
  },
  device_find_files: {
    label: 'Find files on your computer',
    description:
      'Finds files by name inside a folder you granted to the desktop app and returns their paths.',
  },
  device_search_text: {
    label: 'Search files on your computer',
    description:
      'Searches the text of files inside a folder you granted to the desktop app and returns matching lines.',
  },
  device_write_file: {
    label: 'Write a file on your computer',
    description:
      'Creates or replaces a text file inside a folder you granted to the desktop app. Not reversible from the chat.',
  },
  device_edit_file: {
    label: 'Edit a file on your computer',
    description:
      'Replaces one exact passage in a text file inside a folder you granted to the desktop app. Not reversible from the chat.',
  },
  device_run_command: {
    label: 'Run a command on your computer',
    description:
      'Runs a terminal command in a folder you granted and returns its output once it exits. The desktop app asks for the exact command first.',
  },
  device_start_command: {
    label: 'Start a command on your computer',
    description:
      'Starts a command that keeps running, such as a dev server, in a folder you granted. The desktop app asks for the exact command first.',
  },
  device_command_output: {
    label: 'Read a running command',
    description:
      'Reads what a command started on your computer printed since the last read, and can type into it after you approve the input.',
  },
  device_command_stop: {
    label: 'Stop a running command',
    description:
      'Stops a command the assistant started on your computer, together with everything it started.',
  },
  device_screenshot: {
    label: 'Take a screenshot',
    description:
      'Captures your screen through the desktop app so the assistant can see what is open. The picture comes back to the chat.',
  },
  device_zoom: {
    label: 'Look closely at the screen',
    description:
      'Captures one region of your screen at full detail through the desktop app. The picture comes back to the chat.',
  },
  device_move: {
    label: 'Move the pointer',
    description:
      'Moves the mouse pointer on your computer without clicking. Used between steps while controlling the screen.',
  },
  device_scroll: {
    label: 'Scroll on your computer',
    description: 'Scrolls the window or area under a point on your screen through the desktop app.',
  },
  device_wait: {
    label: 'Wait on your computer',
    description:
      'Pauses before the next step so a window can open or a page can load. It does nothing on its own.',
  },
  device_click: {
    label: 'Click on your computer',
    description:
      'Clicks at a point on your screen through the desktop app. A click can send, buy or delete in whatever app is open.',
  },
  device_drag: {
    label: 'Drag on your computer',
    description:
      'Presses, moves and releases the mouse on your screen, to drag a file, a selection or a slider.',
  },
  device_type: {
    label: 'Type on your computer',
    description:
      'Types text into whatever has keyboard focus on your computer. Typed text can be sent by the app that receives it.',
  },
  device_key: {
    label: 'Press a key on your computer',
    description:
      'Presses a key or shortcut on your computer, such as Enter or a menu shortcut, in whatever app is in front.',
  },
  device_browser_read_page: {
    label: 'Read your Chrome tab',
    description:
      'Reads the address, title and visible text of the active tab in your paired Chrome, on sites you approved in the extension.',
  },
  device_browser_screenshot: {
    label: 'Capture your Chrome tab',
    description:
      'Captures the visible part of the active tab in your paired Chrome, on sites you approved in the extension.',
  },
  device_browser_console: {
    label: 'Read the Chrome console',
    description:
      'Reads the console messages the active tab in your paired Chrome logged. The desktop app always asks first.',
  },
  device_browser_network: {
    label: 'Read Chrome network activity',
    description:
      'Reads the requests the active tab in your paired Chrome made, with addresses and status. The desktop app always asks first.',
  },
  device_browser_navigate: {
    label: 'Open a page in Chrome',
    description:
      'Opens an address in the active tab of your paired Chrome. Only sites you approved in the extension can be opened.',
  },
  device_browser_click: {
    label: 'Click in Chrome',
    description:
      'Clicks an element on the active tab of your paired Chrome, which can submit a form, on sites you approved.',
  },
  device_browser_type: {
    label: 'Type in Chrome',
    description:
      'Types into a field on the active tab of your paired Chrome, on sites you approved in the extension.',
  },
  device_browser_download: {
    label: 'Download through Chrome',
    description:
      'Downloads a file through your paired Chrome into your downloads folder. The desktop app always asks first.',
  },
  agi_reconnect: {
    label: 'Offer to reconnect an app',
    description:
      'Shows you a button to reconnect a connected app whose sign-in expired or was revoked. None of its tools run until you reconnect it.',
  },
  browser_list_tabs: {
    label: 'List your Chrome tabs',
    description:
      'Lists the titles and addresses of the tabs open in your paired Chrome, so you can choose which one to read.',
  },
  device_calendar_events: {
    label: 'Read your phone calendar',
    description:
      'Reads the events in a date range from the calendars on your phone, after the phone asks for calendar access.',
  },
  device_calendar_availability: {
    label: 'Check your free time',
    description:
      'Reads when you are busy or free in a date range from the calendars on your phone, without the event details.',
  },
  device_calendar_create_event: {
    label: 'Add a calendar event',
    description:
      'Adds an event to a calendar on your phone. Your phone asks for calendar access, and AGI asks before it adds anything.',
  },
  device_reminder_create: {
    label: 'Add a reminder',
    description:
      'Adds a reminder on your phone. Your phone asks for reminders access, and AGI asks before it adds anything.',
  },
  browser_read_page: {
    label: 'Read your Chrome tab',
    description:
      'Reads the address, title and visible text of the active tab in your paired Chrome, on sites you approved in the extension.',
  },
  browser_screenshot: {
    label: 'Capture your Chrome tab',
    description:
      'Captures the visible part of the active tab in your paired Chrome, on sites you approved in the extension.',
  },
  browser_console: {
    label: 'Read the Chrome console',
    description:
      'Reads the console messages the active tab in your paired Chrome logged. AGI always asks first.',
  },
  browser_network: {
    label: 'Read Chrome network activity',
    description:
      'Reads the requests the active tab in your paired Chrome made, with addresses and status. AGI always asks first.',
  },
  browser_navigate: {
    label: 'Open a page in Chrome',
    description:
      'Opens an address in the active tab of your paired Chrome. Only sites you approved in the extension can be opened.',
  },
  browser_click: {
    label: 'Click in Chrome',
    description:
      'Clicks an element on the active tab of your paired Chrome, which can submit a form, on sites you approved.',
  },
  browser_type: {
    label: 'Type in Chrome',
    description:
      'Types into a field on the active tab of your paired Chrome, on sites you approved in the extension.',
  },
  browser_download: {
    label: 'Download through Chrome',
    description:
      'Downloads a file through your paired Chrome into your downloads folder. AGI always asks first.',
  },
  browser_find: {
    label: 'Find on your Chrome tab',
    description:
      'Lists the buttons, links and fields on the active tab of your paired Chrome, optionally matching a search term, on sites you approved in the extension.',
  },
  browser_fill_form: {
    label: 'Fill a form in Chrome',
    description:
      'Fills fields of a form on the active tab of your paired Chrome, on sites you approved in the extension. It does not submit the form.',
  },
  browser_history: {
    label: 'Go back or forward in Chrome',
    description:
      'Moves the active tab of your paired Chrome back or forward in its history, on sites you approved in the extension.',
  },
};

export function buildToolApprovalToolRows(
  source: ToolApprovalSource = PLATFORM_TOOL_APPROVAL_SOURCE,
): readonly ToolApprovalToolRow[] {
  return source.toolNames.map((name) => {
    const copy = TOOL_COPY[name];
    return {
      name,
      label: copy?.label ?? name,
      description: copy?.description ?? '',
      runsWithoutAsking: TOOL_APPROVAL_POLICIES.filter((policy) =>
        source.autoApproves(policy, name),
      ),
    };
  });
}

export function buildToolApprovalPolicyRows(
  source: ToolApprovalSource = PLATFORM_TOOL_APPROVAL_SOURCE,
): readonly ToolApprovalPolicyRow[] {
  const tools = buildToolApprovalToolRows(source);
  return TOOL_APPROVAL_POLICIES.map((policy) => {
    const option = toolApprovalPolicyOption(policy);
    return {
      policy,
      label: option.label,
      summary: option.hint,
      isDefault: policy === WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
      runsWithoutAsking: tools
        .filter((tool) => tool.runsWithoutAsking.includes(policy))
        .map((tool) => tool.label),
    };
  });
}

export function toolApprovalPolicySentence(row: ToolApprovalPolicyRow): string {
  const opening = row.isDefault ? `${row.summary} This is the default.` : row.summary;
  if (row.runsWithoutAsking.length === 0) return `${opening} No built-in tool runs without asking.`;
  return `${opening} Runs without asking: ${row.runsWithoutAsking.join(', ')}.`;
}

// Keyed by the rank number in completions/lib/tool-call-gate.ts, which owns the
// order and the outcomes. Only the sentence is written here.
const PRECEDENCE_CONDITION: Readonly<Record<number, string>> = {
  1: 'You blocked the tool',
  2: 'A step your own device carries out, on a turn that is connected to that device',
  3: 'You saved Always allow, and the injection escalation trips',
  4: 'You saved Always allow',
  5: 'You saved Needs approval',
  6: 'Something else in the turn needs approval, your account default covers this tool, and the escalation has not tripped',
  7: 'Something in the turn needs approval and your account default does not cover this tool',
  8: 'The injection escalation trips',
  9: 'Every tool offered in the turn runs under your account default',
};

const PRECEDENCE_OUTCOME: Readonly<Record<ToolCallGateRank['outcome'], string>> = {
  allow: 'Runs.',
  ask: 'Asks.',
  deny: 'Denied.',
  escalate: 'Asks. On an unattended run there is nobody to ask, so it is denied instead.',
};

export const TOOL_APPROVAL_PRECEDENCE: readonly ToolApprovalPrecedenceRow[] =
  TOOL_CALL_GATE_RANKS.map((rank) => ({
    rank: rank.rank,
    reason: rank.reason,
    condition: PRECEDENCE_CONDITION[rank.rank] ?? '',
    outcome: PRECEDENCE_OUTCOME[rank.outcome],
  }));
