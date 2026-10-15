import path from 'node:path';
import {
  relativeWithinRoot,
  type DeveloperApprovalDecision,
  type DeveloperApprovalRequest,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { NOT_THIS_APP, shownValue, visibleInDialog } from './dialogText';
import { isProtectedWrite, PathRefused, resolveWithinRoot } from './pathGuard';
import { landingPath } from './shellSandbox';

/**
 * What an approval reaches that a routine one does not: a file outside the
 * session's folder; git metadata, project configuration or a hook manager's
 * files inside it, which decide what runs there later; a git remote the
 * repository is not set up with; a host the request names by address; or
 * something this shell could not read back from the request at all.
 */
export type ApprovalReservation =
  'outside-folder' | 'protected-path' | 'unknown-remote' | 'named-host' | 'unread-request';

export interface PendingApprovalReview {
  request: DeveloperApprovalRequest;
  reserved: readonly ApprovalReservation[];
}

const KIND_NAME = /^[A-Za-z]+/u;

/**
 * The variant name a CLI approval kind starts with. Routine admission and the
 * reading of what a request reaches both key on this one answer, so a kind
 * cannot be admitted under one name and read under another.
 */
export function approvalKindName(rawKind: string): string {
  return KIND_NAME.exec(rawKind)?.[0] ?? '';
}

const STRUCT_BODY = /^[A-Za-z]+ \{(.*)\}$/su;
const QUOTED = /"(?:[^"\\]|\\.)*"/gsu;
const EXEC_COMMAND = /^Exec \{ command: ("(?:[^"\\]|\\.)*") \}$/su;
const PUSH_REMOTE = /^GitPush \{ remote: ("(?:[^"\\]|\\.)*"),/su;
const NETWORK_TOOL = /^Network \{ tool_name: ("(?:[^"\\]|\\.)*"),/su;

/**
 * The tool whose network request lifts the sandbox's block for the one
 * command it was raised for, and names no host of its own. Every other tool
 * that raises one is asking about an address.
 */
const SANDBOXED_COMMAND_TOOL = 'run_command';

function quotedField(pattern: RegExp, rawKind: string): string | null {
  const literal = pattern.exec(rawKind)?.[1];
  if (!literal) return null;
  try {
    const parsed: unknown = JSON.parse(literal);
    return typeof parsed === 'string' && parsed.trim() !== '' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The command an `Exec` approval would run, or `null` when the request is not
 * one or its command cannot be read back. The CLI sends the kind in Rust's
 * debug form, so a value is read only where that quoting is also JSON's.
 */
export function approvalCommand(rawKind: string): string | null {
  return quotedField(EXEC_COMMAND, rawKind);
}

/**
 * The files a write approval names, or `null` when this shell could not read
 * which, which is never the same as "none outside".
 */
export function approvalFilePaths(rawKind: string): string[] | null {
  const body = STRUCT_BODY.exec(rawKind)?.[1];
  if (body === undefined) return null;
  const quoted = body.match(QUOTED) ?? [];
  if (quoted.length === 0) return null;
  const paths: string[] = [];
  for (const literal of quoted) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(literal);
    } catch {
      return null;
    }
    if (typeof parsed !== 'string' || parsed === '') return null;
    paths.push(parsed);
  }
  return paths;
}

type ConfiguredRemotes = () => Promise<readonly string[] | null>;

type ReservationReader = (
  root: WorkspaceRoot,
  rawKind: string,
  configuredRemotes: ConfiguredRemotes,
) => Promise<ApprovalReservation[]>;

const nothingBeyondTheConversation: ReservationReader = async () => [];

const commandReservations: ReservationReader = async (_root, rawKind) =>
  approvalCommand(rawKind) === null ? ['unread-request'] : [];

const fileReservations: ReservationReader = async (root, rawKind) => {
  const paths = approvalFilePaths(rawKind);
  if (paths === null) return ['unread-request'];
  const found = new Set<ApprovalReservation>();
  for (const candidate of paths) {
    const landed = await landedReservation(root, candidate);
    if (landed !== null) found.add(landed);
    const relative = path.relative(root.path, path.resolve(root.path, candidate));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      found.add('outside-folder');
      continue;
    }
    try {
      if (await isProtectedWrite(await resolveWithinRoot(root, relative))) {
        found.add('protected-path');
      }
    } catch (error) {
      found.add(
        error instanceof PathRefused && error.reason === 'outside-workspace'
          ? 'outside-folder'
          : 'unread-request',
      );
    }
  }
  return [...found];
};

/**
 * What a write to `candidate` reaches where it lands, taken from the path
 * exactly as the request wrote it: every link followed and every `..`
 * applied from where the link before it leads, as the kernel does. Taking
 * the `..` out as text first reads `lnk/../config` as `config` when `lnk` is
 * a link to `.git/info` and the write goes to `.git/config`. The spelling
 * with its dots taken out is still judged by the caller, and can only add.
 * A path whose links never settle is protected: nothing says where it lands.
 * Mirrors `is_protected_project_path` in the sandbox-policy crate.
 */
async function landedReservation(
  root: WorkspaceRoot,
  candidate: string,
): Promise<ApprovalReservation | null> {
  if (process.platform === 'win32' || candidate.includes('\0')) return null;
  const landed = await landingPath(
    path.isAbsolute(candidate) ? candidate : `${root.path}/${candidate}`,
  );
  if (landed === null) return 'protected-path';
  const top = (await landingPath(root.path)) ?? root.path;
  const relative = relativeWithinRoot(top, landed, { platform: 'posix' });
  if (relative === null) return 'outside-folder';
  const protectedThere = await isProtectedWrite({
    requested: candidate,
    absolute: landed,
    relative,
    root,
  });
  return protectedThere ? 'protected-path' : null;
}

const pushReservations: ReservationReader = async (_root, rawKind, configuredRemotes) => {
  const remote = quotedField(PUSH_REMOTE, rawKind);
  if (remote === null) return ['unread-request'];
  const remotes = await configuredRemotes();
  return remotes !== null && remotes.includes(remote) ? [] : ['unknown-remote'];
};

const networkReservations: ReservationReader = async (_root, rawKind) => {
  const tool = quotedField(NETWORK_TOOL, rawKind);
  if (tool === null) return ['unread-request'];
  return tool === SANDBOXED_COMMAND_TOOL ? [] : ['named-host'];
};

/**
 * The kinds of request with a reader that says what they reach. A page or a
 * phone may answer one by itself, once, when the CLI rated it low or medium
 * risk, its reader reserves nothing and it is not always confirmed here.
 * A kind is here only together with the reader that says what it reaches, so
 * none can be admitted without one. Every other kind, and any kind a newer
 * CLI adds, is confirmed in main: this list admits, it never excludes.
 *
 * - `Exec`, `Network` and `GitPush` are listed for their readers only, which
 *   say whether the command could be read back, whether a host is named and
 *   whether the remote is one the repository is set up with. None of the
 *   three is ever answered without this computer (`ALWAYS_CONFIRMED_HERE`).
 * - `FileWrite`, `FileEdit`, `Patch`: an edit to files inside the folder that
 *   are neither git metadata nor project configuration.
 * - `LoopDetection`, `AskUser`, `McpElicitation`: nothing outside the
 *   conversation moves; the agent carries on, asks, or is asked a question.
 *
 * Left out on purpose: `McpTool`, whose server acts outside the sandbox with
 * access this shell cannot see; `Git`, which the CLI also uses to ask to run
 * the repository's hooks outside the sandbox and to discard uncommitted work;
 * `Hook` and `Subagent`, which start programs of their own; `WorkspacePolicy`,
 * where the repository's own policy file asked for a person; `TrustDirectory`,
 * a standing grant; and `ComputerUse`.
 */
const ROUTINE_KINDS: ReadonlyMap<string, ReservationReader> = new Map([
  ['Exec', commandReservations],
  ['FileWrite', fileReservations],
  ['FileEdit', fileReservations],
  ['Patch', fileReservations],
  ['LoopDetection', nothingBeyondTheConversation],
  ['AskUser', nothingBeyondTheConversation],
  ['McpElicitation', nothingBeyondTheConversation],
  ['Network', networkReservations],
  ['GitPush', pushReservations],
]);

const KIND_FACTS: ReadonlyMap<string, string> = new Map([
  [
    'Git',
    "A git operation like this can run the repository's hooks outside the sandbox, with your full permissions, or discard work that was never committed.",
  ],
  [
    'McpTool',
    'It calls a tool on a tool server, which acts with whatever that server can reach: accounts, files and services outside this folder.',
  ],
  ['Hook', 'It runs a hook, which is a program of its own.'],
  ['Subagent', 'It starts another agent with tools of its own.'],
  ['WorkspacePolicy', 'The policy file in this repository says a person has to allow this.'],
  [
    'TrustDirectory',
    'Trusting a folder lets the hooks, commands and tool servers it configures run without asking again.',
  ],
  ['ComputerUse', 'It reads the screen or controls the mouse and keyboard.'],
]);

const UNLISTED_KIND_FACT = 'Requests of this kind are always confirmed at this computer.';

/**
 * Kinds confirmed at this computer every time, whatever the CLI rates them,
 * each with what this app says of it. A command runs a program with the
 * user's account, and a page sends the turn that asks for it, so a page that
 * could also answer would be allowing its own request. A command allowed
 * onto the network can send what it reads, and a push is seen by others at
 * once. Each keeps its reader, which says what the request reaches.
 */
const ALWAYS_CONFIRMED_HERE: ReadonlyMap<string, string> = new Map([
  [
    'Exec',
    'It runs a program with your account. A command is confirmed at this computer every time.',
  ],
  [
    'Network',
    'It lets a command reach the network: whatever that command can read, it can send to a server elsewhere.',
  ],
  [
    'GitPush',
    'It publishes commits to a remote. Other people and systems see them at once, and that is not taken back from here.',
  ],
]);

/**
 * What a page or a phone answers by itself: a request of a routine kind that
 * is not always confirmed here, rated low or medium risk, reaching nothing
 * reserved. In practice that is an agent's edit to a file inside the
 * approved folder that is not git metadata, project configuration or a hook
 * manager's file, and the three kinds that move nothing outside the
 * conversation.
 *
 * `reversible` is not part of it. The CLI calls no file write reversible,
 * since it keeps no copy of what a file held, so reading that flag would put
 * a native dialog in front of every edit. What covers an edit in the folder
 * is the write guard on protected paths, the session's checkpoints, and that
 * accept-edits mode makes the same edits with no approval at all.
 */
function isRoutine({ request, reserved }: PendingApprovalReview, answeredHere: boolean): boolean {
  const confirmedHere =
    ALWAYS_CONFIRMED_HERE.has(request.kind) && !(answeredHere && request.kind === 'Exec');
  return (
    ROUTINE_KINDS.has(request.kind) &&
    !confirmedHere &&
    (request.riskLevel === 'low' || request.riskLevel === 'medium') &&
    reserved.length === 0
  );
}

/**
 * Whether an allow must be confirmed by the person at this computer, in a
 * native dialog, before it is sent. A page is a website and a paired phone is
 * another device, so an allow from either is only as good as whatever is
 * running there. The default is that it must: only a request `isRoutine`
 * admits, answered for this one time, goes through without it. This is the
 * one place that decides it, for the page, the phone and the notification
 * banner.
 *
 * `answeredHere` is the banner. The system draws it at this computer, it
 * shows the whole command or offers no Approve, and it offers one only for a
 * command the CLI says changes nothing (`answerableFromNotification`). The
 * person pressing Approve there is the answer a dialog would have asked for,
 * so a command is not sent to a dialog a second time. Everything else that
 * is reserved for main is reserved for the banner too.
 */
export function approvalNeedsMain(
  review: PendingApprovalReview,
  decision: DeveloperApprovalDecision,
  answeredHere = false,
): boolean {
  return decision === 'approve_for_session' || !isRoutine(review, answeredHere);
}

const RESERVATION_FACTS: Record<ApprovalReservation, (root: WorkspaceRoot) => string> = {
  'outside-folder': (root) => `It changes files outside ${visibleInDialog(root.name)}.`,
  'protected-path': () =>
    "It changes git metadata, project configuration or a hook manager's files, which decide what runs in this folder later: hooks, commands and tool servers.",
  'unknown-remote': () => 'It pushes to a remote this repository is not set up with.',
  'named-host': () => 'It connects to a host the request names by address.',
  'unread-request': () =>
    'This app could not read what the request would run, change or reach, so it cannot be checked before you allow it.',
};

const SUMMARY_SHOWN = { head: 400, tail: 200 };
const COMMAND_SHOWN = { head: 1_500, tail: 700 };
const DETAIL_SHOWN = { head: 700, tail: 300 };
const DEVICE_SHOWN = { head: 80, tail: 0 };
const READ_IT_ALL = (hidden: number) =>
  ` [${hidden} characters not shown; open the session to read all of it] `;

const KIND_LABELS: ReadonlyMap<string, string> = new Map([
  ['Exec', 'run a command'],
  ['FileWrite', 'write a file'],
  ['FileEdit', 'edit a file'],
  ['Patch', 'change files'],
  ['LoopDetection', 'carry on after repeating itself'],
  ['AskUser', 'ask you a question'],
  ['McpElicitation', 'pass on a question from a tool server'],
  ['McpTool', 'call a tool on a tool server'],
  ['Network', 'use the network'],
  ['Git', 'run a git operation'],
  ['GitPush', 'push commits'],
  ['Hook', 'run a hook'],
  ['Subagent', 'start another agent'],
  ['WorkspacePolicy', 'do something the project policy asks a person about'],
  ['TrustDirectory', 'trust a folder'],
  ['ComputerUse', 'use the screen, mouse or keyboard'],
]);

export interface ApprovalConfirmation {
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
 * The question main asks before sending such an allow. What this app knows
 * comes first, in its own words: who is asking, the folder, the kind of
 * request, why it is asked here and what allowing does. The request as the
 * CLI holds it comes after a line that says so, each part on one line this
 * app labelled, so nothing in it can pass for the lines above. `device` names
 * a paired phone when the answer came from one.
 */
export function approvalConfirmation(
  root: WorkspaceRoot,
  { request, reserved }: PendingApprovalReview,
  decision: DeveloperApprovalDecision,
  device?: string,
): ApprovalConfirmation {
  const forSession = decision === 'approve_for_session';
  const kind = KIND_LABELS.get(request.kind);
  const facts = [
    kind === undefined
      ? 'The agent asks for something of a kind this app does not know.'
      : `The agent asks to ${kind}.`,
    request.riskLevel === 'high' ? 'The AGI CLI rates this high risk.' : null,
    request.riskLevel === null ? 'The AGI CLI did not rate the risk of this.' : null,
    ...reserved.map((reservation) => RESERVATION_FACTS[reservation](root)),
    ROUTINE_KINDS.has(request.kind)
      ? (ALWAYS_CONFIRMED_HERE.get(request.kind) ?? null)
      : (KIND_FACTS.get(request.kind) ?? UNLISTED_KIND_FACT),
    request.reversible === false
      ? 'It cannot be undone: what it changes, deletes or sends stays that way.'
      : null,
    request.reversible === null ? 'The AGI CLI did not say whether this can be undone.' : null,
    forSession
      ? 'Allowing it for the session lets the agent do this again, and run commands that start the same way, without asking, until its runtime for this folder stops.'
      : 'Allowing it once lets the agent do this one time.',
  ].filter((fact): fact is string => fact !== null);
  const asked = [
    `Summary: ${shownValue(request.summary, SUMMARY_SHOWN, READ_IT_ALL)}`,
    request.command
      ? `Command: $ ${shownValue(request.command, COMMAND_SHOWN, READ_IT_ALL)}`
      : null,
    request.detail ? `Detail: ${shownValue(request.detail, DETAIL_SHOWN, READ_IT_ALL)}` : null,
  ].filter((line): line is string => line !== null);
  const body = [
    device === undefined
      ? null
      : `${shownValue(device, DEVICE_SHOWN)} sent this answer over Remote Control. It is applied only if you allow it here.`,
    `Folder: ${visibleInDialog(root.path)}`,
    facts.join(' '),
    `What the agent asked for, as the AGI CLI holds it. ${NOT_THIS_APP}`,
    asked.join('\n'),
  ].filter((part): part is string => part !== null);
  return {
    type: 'warning',
    buttons: ['Cancel', forSession ? 'Allow for this session' : 'Allow once'],
    defaultId: 0,
    cancelId: 0,
    title: forSession ? 'Allow this for the rest of the session?' : 'Allow the agent to do this?',
    message:
      device === undefined
        ? `Allow this in ${visibleInDialog(root.name)}?`
        : `Allow what your phone approved in ${visibleInDialog(root.name)}?`,
    detail: body.join('\n\n'),
    noLink: true,
  };
}

/**
 * What one approval reaches beyond the routine, read from the kind the CLI
 * sent by that kind's own reader. A write is followed through links the way
 * the write itself would be. A kind whose command, paths, remote or tool this
 * cannot read back in the shape it expects is reserved, never waved through.
 * A kind with no reader is never routine, so nothing rides on its answer.
 */
export async function approvalReservations(
  root: WorkspaceRoot,
  rawKind: string,
  configuredRemotes: ConfiguredRemotes,
): Promise<ApprovalReservation[]> {
  const read = ROUTINE_KINDS.get(approvalKindName(rawKind));
  return read ? read(root, rawKind, configuredRemotes) : [];
}
