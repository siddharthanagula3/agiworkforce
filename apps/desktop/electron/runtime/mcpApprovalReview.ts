import type {
  DeveloperMcpApprovalScope,
  WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import type { McpApprovalNetwork, McpApprovalSandbox } from '@agiworkforce/types/protocol';
import { NOT_THIS_APP, shownValue, visibleInDialog } from './dialogText';

/**
 * A project server's launch in the parts the CLI's hash pins, read off the
 * wire. A local server has `program`, `sandbox` and `network`; a remote one
 * has `url`. `unknown` is a containment or a reach a newer CLI named that
 * this build has no words for.
 */
export interface McpApprovalLaunchShown {
  project: string;
  program: string | null;
  args: string[];
  /**
   * `notPassed`: the entry sets the variable and the CLI does not hand it to
   * the server, so it is never shown as if it applied.
   */
  env: Array<{ name: string; value: string | null; notPassed: boolean }>;
  workingFolder: string | null;
  files: string[];
  sandbox: McpApprovalSandbox | 'unknown' | null;
  network: McpApprovalNetwork | 'unknown' | null;
  url: string | null;
  headerNames: string[];
  authorizeUrl: string | null;
  tokenUrl: string | null;
  oauthScope: string | null;
  oauthClientId: string | null;
  oauthRedirectUri: string | null;
  /** The entry holds a client secret for the sign-in. Its value never leaves the CLI. */
  oauthClientSecretSet: boolean;
  /**
   * The CLI could not pin part of this launch, so it keeps no yes for it and
   * asks at every start. Read from the CLI's own field, never from the text
   * of a file entry, which a project chooses.
   */
  askedAtEveryStart: boolean;
}

/**
 * What the CLI asks about one project server, and the hash of the launch it
 * describes. `launch` is null from a CLI that sends only the question.
 */
export interface McpApprovalAsked {
  name: string;
  scope: DeveloperMcpApprovalScope;
  question: string;
  fingerprint: string;
  launch: McpApprovalLaunchShown | null;
}

const QUESTION_SHOWN = { head: 1_500, tail: 700 };
const VALUE_SHOWN = { head: 160, tail: 60 };
const ARGUMENTS_SHOWN = { head: 16, tail: 8 };
const NAMES_SHOWN = 16;
const NAME_SHOWN = { head: 120, tail: 0 };

function shown(value: string): string {
  return shownValue(value, VALUE_SHOWN);
}

/**
 * Where the whole entry can be read when this dialog had to leave part of it
 * out. The CLI says which kind of file names the server, not which file.
 */
function readInFull(project: string, scope: DeveloperMcpApprovalScope): string {
  return scope === 'project'
    ? `Read the whole entry in ${project}/.mcp.json or ${project}/mcp.json before you allow it.`
    : `Read the whole entry in the plugin under ${project} that names this server before you allow it.`;
}

/**
 * Each argument on its own numbered line and in quotes, so one argument
 * holding spaces cannot pass for several, an empty one is still seen, and one
 * holding line breaks stays on its line. A long list keeps its first and its
 * last arguments, where the program and anything appended to its command sit.
 */
function argumentLines(args: readonly string[], whereInFull: string): string[] {
  if (args.length === 0) return ['Arguments: none'];
  const numbered = args.map((argument, index) => `  ${index + 1}. "${shown(argument)}"`);
  const { head, tail } = ARGUMENTS_SHOWN;
  if (numbered.length <= head + tail) return [`Arguments (${args.length}):`, ...numbered];
  return [
    `Arguments (${args.length}):`,
    ...numbered.slice(0, head),
    `  [${numbered.length - head - tail} arguments in the middle are not shown. ${whereInFull}]`,
    ...numbered.slice(-tail),
  ];
}

function listed(
  label: string,
  items: readonly string[],
  none: string,
  whereInFull: string,
): string {
  if (items.length === 0) return `${label}: ${none}`;
  const first = items.slice(0, NAMES_SHOWN).map(shown).join(', ');
  return items.length <= NAMES_SHOWN
    ? `${label}: ${first}`
    : `${label}: ${first} [${items.length - NAMES_SHOWN} more are not shown. ${whereInFull}]`;
}

const SANDBOX_WORDS: Record<McpApprovalSandbox | 'unknown', string> = {
  sandboxed: 'inside the operating system sandbox',
  kept_sandboxed: 'inside the operating system sandbox, though its entry asks to leave it',
  unavailable:
    'only inside the operating system sandbox, and the tool that makes one is not installed here, so it does not start yet',
  opted_out: 'outside the sandbox, as its entry asks: it runs with your full user rights',
  turned_off:
    'outside the sandbox, which is turned off for this run: it runs with your full user rights',
  no_sandbox: 'no sandbox, because this system has none: it runs with your full user rights',
  unknown: 'this app could not read how it is contained, so assume it is not',
};

const NETWORK_WORDS: Record<McpApprovalNetwork | 'unknown', string> = {
  internet: 'the internet, and not services on this computer',
  internet_and_local: 'the internet and services on this computer, such as databases and Docker',
  unconfined: 'everything you can reach',
  unknown: 'this app could not read what it can reach, so assume everything you can',
};

function localEntryLines(
  launch: McpApprovalLaunchShown,
  program: string,
  whereInFull: string,
): string[] {
  return [
    `Program: ${shown(program)}`,
    ...argumentLines(launch.args, whereInFull),
    launch.workingFolder === null
      ? 'Starts in: the AGI CLI did not say'
      : `Starts in: ${shown(launch.workingFolder)}`,
    listed(
      'Environment',
      launch.env
        .filter((variable) => !variable.notPassed)
        .map(({ name, value }) =>
          value === null ? `${name} (value not shown)` : `${name}=${value}`,
        ),
      'nothing from its entry',
      whereInFull,
    ),
    ...(launch.env.some((variable) => variable.notPassed)
      ? [
          listed(
            'Set in the config but not passed to the server',
            launch.env.filter((variable) => variable.notPassed).map(({ name }) => name),
            'none',
            whereInFull,
          ),
        ]
      : []),
    listed('Files checked for changes', launch.files, 'none', whereInFull),
  ];
}

function remoteEntryLines(
  launch: McpApprovalLaunchShown,
  url: string,
  whereInFull: string,
): string[] {
  return [
    `URL: ${shown(url)}`,
    listed('Headers sent (values not shown)', launch.headerNames, 'none', whereInFull),
    ...(launch.authorizeUrl === null ? [] : [`Sign-in page: ${shown(launch.authorizeUrl)}`]),
    ...(launch.tokenUrl === null ? [] : [`Token endpoint: ${shown(launch.tokenUrl)}`]),
    ...(launch.oauthScope === null
      ? []
      : [`Access the sign-in asks for: ${shown(launch.oauthScope)}`]),
    ...(launch.oauthClientId === null
      ? []
      : [`Signs in as client: ${shown(launch.oauthClientId)}`]),
    ...(launch.oauthRedirectUri === null
      ? []
      : [`Sign-in sends you back to: ${shown(launch.oauthRedirectUri)}`]),
  ];
}

const DECLARED_BY: Record<DeveloperMcpApprovalScope, string> = {
  project: "This project's MCP file names this server.",
  plugin: "One of this project's plugins names this server.",
};

const NO_LAUNCH_PARTS =
  'This version of the AGI CLI describes the launch only in one sentence, so this app could not show the full command, its arguments or its files separately, or say how it is contained.';

/**
 * Where a remote server is, said by this app from the address in its entry:
 * the scheme, the host in ASCII, so a look-alike letter shows as the code it
 * is, and the port. No user name, path or query, which the entry's own line
 * shows below as written.
 */
function connectsTo(url: string): string {
  try {
    const { protocol, hostname, port } = new URL(url);
    return hostname === ''
      ? 'an address this app could not read'
      : `${protocol}//${hostname}${port === '' ? '' : `:${port}`}`;
  } catch {
    return 'an address this app could not read';
  }
}

const CLIENT_SECRET_SET =
  'OAuth client secret: one is configured for this server in its entry. It is not shown here.';

const WHAT_IT_IS = {
  local: 'It is a program that runs on this computer.',
  remote: 'The AGI CLI on this computer connects to it and sends it what the agent chooses to.',
  unstated: 'It is a program that runs on this computer, or a server this computer connects to.',
};

/**
 * What a yes does, which depends on whether the CLI can pin the launch. It
 * says which in a field of its own (`askedAtEveryStart`). The text of a
 * `files` entry says the same for a file it could not check, and is never
 * read for this: a project names its own files, and one named to end the
 * same way would have this app promise a question that never comes.
 */
const WHEN_IT_STARTS = {
  remembered:
    'If you allow it, it starts with the next coding session in this folder, not in one that is already open, and with every session after that without asking again, for as long as this exact launch stays the same.',
  everyStart:
    'If you allow it, it starts with the next coding session in this folder, not in one that is already open. The AGI CLI could not check part of what this launch runs, so it does not remember this answer: you are asked about this server again at every start. What it runs can change between starts without this dialog looking any different.',
};

export interface McpApprovalConfirmation {
  type: 'warning';
  buttons: string[];
  defaultId: 0;
  cancelId: 0;
  title: string;
  message: string;
  detail: string;
  noLink: true;
}

/**
 * The one place a project server's launch is allowed from this app. A page is
 * a website and a paired phone is another device, so neither is shown a
 * button for it. What this app says comes first, in its own words: the
 * folder, how the launch is contained and what it can reach, what the server
 * is and what allowing it does. The project's entry comes after a line that
 * says so, each value on one line this app labelled, so an argument that
 * holds line breaks cannot draw a `Sandbox:` line of its own above the real
 * one. `changed` says the CLI refused the last yes because the entry was
 * edited while that question was open, and what follows is the entry now.
 */
export function mcpApprovalConfirmation(
  root: WorkspaceRoot,
  asked: McpApprovalAsked,
  changed: boolean,
): McpApprovalConfirmation {
  const name = shownValue(asked.name, NAME_SHOWN);
  const { launch } = asked;
  const project = visibleInDialog(launch?.project ?? root.path);
  const whereInFull = readInFull(project, asked.scope);
  const local = launch !== null && launch.program !== null;
  const remote = launch !== null && launch.program === null && launch.url !== null;
  const entry = !launch
    ? []
    : launch.program !== null
      ? localEntryLines(launch, launch.program, whereInFull)
      : launch.url !== null
        ? remoteEntryLines(launch, launch.url, whereInFull)
        : [];
  const facts = [
    `Project folder: ${project}`,
    ...(local && launch
      ? [
          `Sandbox: ${SANDBOX_WORDS[launch.sandbox ?? 'unknown']}`,
          `Network: ${NETWORK_WORDS[launch.network ?? 'unknown']}`,
        ]
      : []),
    ...(remote && launch?.url ? [`Connects to: ${connectsTo(launch.url)}`] : []),
    ...(remote && launch?.oauthClientSecretSet ? [CLIENT_SECRET_SET] : []),
  ];
  const kind = local ? WHAT_IT_IS.local : remote ? WHAT_IT_IS.remote : WHAT_IT_IS.unstated;
  const body = [
    changed
      ? "This server's configuration changed while you were reviewing it, so nothing was allowed. This is what it would start now."
      : null,
    facts.join('\n'),
    `${DECLARED_BY[asked.scope]} ${kind} ${
      launch?.askedAtEveryStart === true ? WHEN_IT_STARTS.everyStart : WHEN_IT_STARTS.remembered
    }`,
    entry.length === 0 ? `${NO_LAUNCH_PARTS} ${whereInFull}` : null,
    `What the project's entry says, as the AGI CLI read it. ${NOT_THIS_APP}`,
    [
      ...entry,
      `The AGI CLI describes it as: ${shownValue(
        asked.question,
        QUESTION_SHOWN,
        (hidden) => ` [${hidden} characters in the middle are not shown. ${whereInFull}] `,
      )}`,
    ].join('\n'),
  ].filter((part): part is string => part !== null);
  return {
    type: 'warning',
    buttons: ['Cancel', 'Allow this server'],
    defaultId: 0,
    cancelId: 0,
    title: 'Let this MCP server run on this computer?',
    message: `Allow the MCP server ${name} in ${visibleInDialog(root.name)}?`,
    detail: body.join('\n\n'),
    noLink: true,
  };
}

export interface McpApprovalNotRecorded {
  type: 'info';
  buttons: string[];
  title: string;
  message: string;
  detail: string;
}

/** What the person who just chose Allow is told when the CLI recorded nothing. */
export function mcpApprovalNotRecorded(
  asked: Pick<McpApprovalAsked, 'name'>,
  reason: string,
): McpApprovalNotRecorded {
  return {
    type: 'info',
    buttons: ['OK'],
    title: 'The server was not allowed',
    message: `The MCP server ${shownValue(asked.name, NAME_SHOWN)} was not allowed.`,
    detail: `The AGI CLI said: ${shownValue(reason, QUESTION_SHOWN)}`,
  };
}
