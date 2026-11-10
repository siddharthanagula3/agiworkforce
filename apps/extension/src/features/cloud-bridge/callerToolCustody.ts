import { parseTaskTabScope, type TaskTabScope } from '../browser-tools/taskTabScope';
import { CHAT_BROWSER_TASK_TOOL } from '../computer-use/chatBrowserTools';
import {
  parseFormObservationReference,
  type FormObservationReference,
} from '../browser-tools/documentBridge';
import {
  CallerToolResumeRequestSchema,
  ManagedCloudAgentRunReferenceSchema,
  type ManagedCloudAgentRunReference,
  CallerToolResultSchema,
  HostedCallerToolBatchSchema,
  MAX_CALLER_TOOL_STEPS,
  MAX_CHAT_COMPLETION_REQUEST_BYTES,
  MAX_HOSTED_TOOL_CALLS_PER_STEP,
  TOOL_CALL_ID_MAX_LENGTH,
  type CallerToolResumeRequest,
  type CallerToolResultWire,
  type ManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';
import type { ToolDefinition } from '../computer-use/browserToolDefinitions';
import type { CallerToolContinuation } from '../computer-use/toolHandoff';
import { parseCallerBrowserContext, type CallerBrowserContext } from './callerBrowserContext';
import { UUID_PATTERN } from '../../lib/uuid';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './managedCloudAuthority';

export const CALLER_TOOL_CUSTODY_KEY = 'agi_browser_caller_tool_custody_v1';
const CUSTODY_LOCK = 'agi-browser-caller-tool-custody-v1';

export type CallerConversationContext = Required<
  Pick<ManagedCloudConversation, 'id' | 'organizationId' | 'projectId'>
>;

export interface CallerToolCustodyBinding {
  owner: ManagedCloudOwner;
  clientInstanceId: string;
  streamId: string;
  historyConversationId?: string;
  originatingDocumentId?: string;
  browserContext?: CallerBrowserContext;
  conversationContext?: CallerConversationContext;
}

export interface CallerToolCustodyStorage {
  quotaBytes: number;
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ChromeCallerToolCustody {
  admit(
    requestId: string,
    tools: readonly ToolDefinition[],
    observation?: FormObservationReference,
  ): Promise<void>;
  bindRun(runId: string): Promise<void>;
  claim(checkpoint: CallerToolContinuation): Promise<CallerToolResumeRequest | null>;
  claimAction(
    checkpoint: CallerToolContinuation,
    callId: string,
  ): Promise<CallerToolResultWire | null>;
  completeAction(
    checkpoint: CallerToolContinuation,
    receipt: CallerToolResultWire,
    observation?: FormObservationReference | null,
    browserContext?: CallerBrowserContext,
    taskTabs?: TaskTabScope,
  ): Promise<CallerToolResultWire>;
  complete(
    checkpoint: CallerToolContinuation,
    receipt: CallerToolResumeRequest,
  ): Promise<CallerToolResumeRequest>;
  finish(): Promise<void>;
}

type Cursor = Omit<CallerToolResumeRequest, 'tool_results' | 'observations'>;
interface CustodyAction {
  callId: string;
  state: 'in_flight' | 'completed';
  receipt?: CallerToolResultWire;
  observation?: FormObservationReference | null;
  browserContext?: CallerBrowserContext;
  taskTabs?: TaskTabScope;
}
interface CustodyStep {
  initialBrowserContext?: CallerBrowserContext;
  initialTaskTabs?: TaskTabScope;
  cursor: Cursor;
  calls: CallerToolContinuation['calls'];
  state: 'in_flight' | 'completed';
  receipt?: CallerToolResumeRequest;
  actions?: CustodyAction[];
}
interface CustodyEntry {
  binding: CallerToolCustodyBinding;
  requestId: string;
  toolsJson: string;
  runId?: string;
  terminal: boolean;
  completedSteps: number;
  previousCallIds: string[];
  step?: CustodyStep;
  browserObservation?: FormObservationReference;
  currentBrowserContext?: CallerBrowserContext;
  taskTabs?: TaskTabScope;
}
interface CustodyStore {
  version: 1;
  entries: CustodyEntry[];
}

export class CallerToolCustodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallerToolCustodyError';
  }
}

const refuse = (message: string): never => {
  throw new CallerToolCustodyError(message);
};
const jsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= TOOL_CALL_ID_MAX_LENGTH &&
  [...value].every(
    (character) => character.charCodeAt(0) > 0x1f && character.charCodeAt(0) !== 0x7f,
  );
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function parseConversationContext(value: unknown): CallerConversationContext {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !['id', 'organizationId', 'projectId'].includes(key)) ||
    !identifier(value['id']) ||
    (value['organizationId'] !== null &&
      (typeof value['organizationId'] !== 'string' ||
        !UUID_PATTERN.test(value['organizationId']))) ||
    (value['projectId'] !== null && !identifier(value['projectId']))
  )
    return refuse('The original browser conversation scope is invalid.');
  return {
    id: value['id'],
    organizationId: value['organizationId'] as string | null,
    projectId: value['projectId'] as string | null,
  };
}

function parseBinding(value: unknown): CallerToolCustodyBinding {
  if (!object(value)) return refuse('Browser recovery has an invalid owner.');
  const owner = normalizeManagedCloudOwner(value['owner']);
  if (
    !owner ||
    !identifier(value['clientInstanceId']) ||
    !identifier(value['streamId']) ||
    (value['historyConversationId'] !== undefined && !identifier(value['historyConversationId'])) ||
    (value['originatingDocumentId'] !== undefined && !identifier(value['originatingDocumentId'])) ||
    (value['conversationContext'] !== undefined && !identifier(value['historyConversationId']))
  )
    return refuse('Browser recovery has an invalid owner.');
  return {
    owner,
    clientInstanceId: value['clientInstanceId'],
    streamId: value['streamId'],
    ...(value['historyConversationId'] !== undefined
      ? { historyConversationId: value['historyConversationId'] as string }
      : {}),
    ...(value['originatingDocumentId'] !== undefined
      ? { originatingDocumentId: value['originatingDocumentId'] as string }
      : {}),
    ...(value['conversationContext'] !== undefined
      ? { conversationContext: parseConversationContext(value['conversationContext']) }
      : {}),
    ...(value['browserContext'] !== undefined
      ? { browserContext: parseCallerBrowserContext(value['browserContext']) }
      : {}),
  };
}

function ownedObservation(
  page: CallerBrowserContext | undefined,
  value: unknown,
): FormObservationReference {
  const observation = parseFormObservationReference(value);
  if (
    !observation ||
    !page?.documentId ||
    observation.tabId !== page.tabId ||
    observation.url !== page.url ||
    observation.documentId !== page.documentId
  )
    return refuse('The saved form observation does not belong to the original browser document.');
  return observation;
}

function ownedTaskContext(
  original: CallerBrowserContext | undefined,
  value: unknown,
): CallerBrowserContext {
  const next = parseCallerBrowserContext(value);
  if (!original?.documentId || !next.documentId || next.windowId !== original.windowId)
    return refuse('The completed browser task context does not belong to its original window.');
  return next;
}

function ownedTaskTabs(
  binding: CallerToolCustodyBinding,
  current: CallerBrowserContext | undefined,
  value: unknown,
  previous?: TaskTabScope,
): TaskTabScope {
  if (!current?.documentId) return refuse('Saved task tabs require a verified current document.');
  const tabs = parseTaskTabScope(value, current);
  if (
    tabs.some(
      (tab) =>
        tab.windowId !== binding.browserContext?.windowId ||
        (tab.closeable &&
          (tab.tabId === binding.browserContext.tabId ||
            previous?.some((old) => old.tabId === tab.tabId && !old.closeable))),
    )
  )
    return refuse('A task cannot gain close authority over a user-owned tab.');
  return tabs;
}

function offeringNames(serialized: string): string[] {
  if (new TextEncoder().encode(serialized).byteLength > MAX_CHAT_COMPLETION_REQUEST_BYTES)
    return refuse('The browser tool offering is too large to retain.');
  let tools: unknown;
  try {
    tools = JSON.parse(serialized);
  } catch {
    return refuse('The saved browser tool offering is invalid.');
  }
  if (!Array.isArray(tools)) return refuse('The saved browser tool offering is invalid.');
  const names: string[] = [];
  for (const tool of tools) {
    if (
      !object(tool) ||
      tool['type'] !== 'function' ||
      !object(tool['function']) ||
      !identifier(tool['function']['name']) ||
      typeof tool['function']['description'] !== 'string' ||
      !object(tool['function']['parameters'])
    )
      return refuse('The saved browser tool offering is invalid.');
    names.push(tool['function']['name']);
  }
  if (new Set(names).size !== names.length)
    return refuse('The saved browser tool offering contains duplicate names.');
  return names;
}

function checkpointFields(value: unknown): Pick<CustodyStep, 'cursor' | 'calls'> {
  if (!object(value)) return refuse('The browser action checkpoint is invalid.');
  const { calls: rawCalls, ...fields } = value;
  const calls = HostedCallerToolBatchSchema.safeParse(rawCalls);
  if (!calls.success) return refuse('The browser action checkpoint is invalid.');
  const parsed = CallerToolResumeRequestSchema.safeParse({
    ...fields,
    tool_results: calls.data.map((call) => ({ tool_call_id: call.id, content: '' })),
  });
  if (!parsed.success || parsed.data.observations !== undefined)
    return refuse('The browser action checkpoint is invalid.');
  const { tool_results: _results, observations: _observations, ...cursor } = parsed.data;
  return { cursor, calls: calls.data };
}

function receiptFor(step: Pick<CustodyStep, 'cursor' | 'calls'>, value: unknown) {
  const parsed = CallerToolResumeRequestSchema.safeParse(value);
  if (!parsed.success) return refuse('The browser action receipt is invalid.');
  const { tool_results, observations: _observations, ...cursor } = parsed.data;
  if (
    !same(cursor, step.cursor) ||
    tool_results.length !== step.calls.length ||
    step.calls.some((call) => !tool_results.some((result) => result.tool_call_id === call.id))
  )
    return refuse('The browser action receipt does not match its checkpoint.');
  return parsed.data;
}

function parseStore(value: unknown, quotaBytes: number): CustodyStore {
  if (value === undefined) return { version: 1, entries: [] };
  if (
    !object(value) ||
    value['version'] !== 1 ||
    !Array.isArray(value['entries']) ||
    jsonBytes(value) > quotaBytes
  )
    return refuse('Saved browser recovery state is unavailable. No action was repeated.');
  const entries: CustodyEntry[] = [];
  for (const raw of value['entries']) {
    if (
      !object(raw) ||
      typeof raw['requestId'] !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,128}$/u.test(raw['requestId']) ||
      typeof raw['toolsJson'] !== 'string' ||
      typeof raw['terminal'] !== 'boolean' ||
      !Number.isSafeInteger(raw['completedSteps']) ||
      Number(raw['completedSteps']) < 0 ||
      Number(raw['completedSteps']) > MAX_CALLER_TOOL_STEPS ||
      !Array.isArray(raw['previousCallIds']) ||
      raw['previousCallIds'].length > MAX_CALLER_TOOL_STEPS * MAX_HOSTED_TOOL_CALLS_PER_STEP ||
      !raw['previousCallIds'].every(
        (id) => CallerToolResultSchema.safeParse({ tool_call_id: id, content: '' }).success,
      ) ||
      new Set(raw['previousCallIds']).size !== raw['previousCallIds'].length ||
      (raw['runId'] !== undefined &&
        (typeof raw['runId'] !== 'string' || !UUID_PATTERN.test(raw['runId'])))
    )
      return refuse('Saved browser recovery state is invalid. No action was repeated.');
    offeringNames(raw['toolsJson']);
    const entry: CustodyEntry = {
      binding: parseBinding(raw['binding']),
      requestId: raw['requestId'],
      toolsJson: raw['toolsJson'],
      terminal: raw['terminal'],
      completedSteps: Number(raw['completedSteps']),
      previousCallIds: [...raw['previousCallIds']],
      ...(raw['runId'] ? { runId: raw['runId'] as string } : {}),
    };
    if (raw['currentBrowserContext'] !== undefined) {
      if (entry.terminal) return refuse('A finished browser task retained a live page.');
      entry.currentBrowserContext = ownedTaskContext(
        entry.binding.browserContext,
        raw['currentBrowserContext'],
      );
    }
    if (raw['taskTabs'] !== undefined) {
      if (entry.terminal) return refuse('A finished browser task retained tab authority.');
      entry.taskTabs = ownedTaskTabs(
        entry.binding,
        entry.currentBrowserContext ?? entry.binding.browserContext,
        raw['taskTabs'],
      );
    }
    if (raw['browserObservation'] !== undefined)
      entry.browserObservation = ownedObservation(
        entry.currentBrowserContext ?? entry.binding.browserContext,
        raw['browserObservation'],
      );
    if (raw['step'] !== undefined) {
      const rawStep = raw['step'];
      if (
        !object(rawStep) ||
        (rawStep['state'] !== 'in_flight' && rawStep['state'] !== 'completed') ||
        !object(rawStep['cursor']) ||
        entry.terminal
      )
        return refuse('Saved browser action state is invalid. No action was repeated.');
      const step = checkpointFields({ ...rawStep['cursor'], calls: rawStep['calls'] });
      if (
        step.cursor.run_id !== entry.runId ||
        step.calls.some(
          (call) =>
            !offeringNames(entry.toolsJson).includes(call.function.name) ||
            entry.previousCallIds.includes(call.id),
        )
      )
        return refuse('Saved browser action ownership is invalid. No action was repeated.');
      entry.step = {
        ...step,
        state: rawStep['state'],
        ...(rawStep['state'] === 'completed'
          ? { receipt: receiptFor(step, rawStep['receipt']) }
          : {}),
      };
      if (rawStep['initialBrowserContext'] !== undefined) {
        const initial = parseCallerBrowserContext(rawStep['initialBrowserContext']);
        if (initial.windowId !== entry.binding.browserContext?.windowId)
          return refuse('The browser batch belongs to another window.');
        entry.step.initialBrowserContext = initial;
      }
      if (rawStep['initialTaskTabs'] !== undefined)
        entry.step.initialTaskTabs = ownedTaskTabs(
          entry.binding,
          entry.step.initialBrowserContext ?? entry.binding.browserContext,
          rawStep['initialTaskTabs'],
        );
      let actionTaskTabs = entry.step.initialTaskTabs;
      let actionBrowserContext = entry.step.initialBrowserContext ?? entry.binding.browserContext;
      let promoted = false;
      if (rawStep['actions'] !== undefined) {
        const actions = rawStep['actions'];
        if (
          !Array.isArray(actions) ||
          actions.length > step.calls.length ||
          entry.step.state !== 'in_flight'
        )
          return refuse('Saved individual browser action state is invalid.');
        entry.step.actions = actions.map((rawAction, index): CustodyAction => {
          if (
            !object(rawAction) ||
            Object.keys(rawAction).some(
              (key) =>
                ![
                  'callId',
                  'state',
                  'receipt',
                  'observation',
                  'browserContext',
                  'taskTabs',
                ].includes(key),
            ) ||
            rawAction['callId'] !== step.calls[index]?.id ||
            (rawAction['state'] !== 'in_flight' && rawAction['state'] !== 'completed')
          )
            return refuse('Saved individual browser action ownership is invalid.');
          if (rawAction['state'] === 'in_flight') {
            if (
              index !== actions.length - 1 ||
              rawAction['receipt'] !== undefined ||
              rawAction['observation'] !== undefined ||
              rawAction['browserContext'] !== undefined ||
              rawAction['taskTabs'] !== undefined
            )
              return refuse('Saved individual browser action outcome is uncertain.');
            return { callId: rawAction['callId'] as string, state: 'in_flight' };
          }
          const parsed = CallerToolResultSchema.safeParse(rawAction['receipt']);
          if (!parsed.success || parsed.data.tool_call_id !== rawAction['callId'])
            return refuse('Saved individual browser action receipt is invalid.');
          let browserContext: CallerBrowserContext | undefined;
          if (rawAction['browserContext'] !== undefined) {
            if (step.calls[index]?.function.name !== CHAT_BROWSER_TASK_TOOL)
              return refuse('Only a completed browser task can promote a page context.');
            browserContext = ownedTaskContext(
              entry.binding.browserContext,
              rawAction['browserContext'],
            );
            actionBrowserContext = browserContext;
            promoted = true;
          }
          let taskTabs: TaskTabScope | undefined;
          if (rawAction['taskTabs'] !== undefined) {
            if (!browserContext) return refuse('Task tabs have no native completion context.');
            taskTabs = ownedTaskTabs(
              entry.binding,
              browserContext,
              rawAction['taskTabs'],
              actionTaskTabs,
            );
          }
          if (browserContext) actionTaskTabs = taskTabs;
          return {
            callId: rawAction['callId'] as string,
            state: 'completed',
            receipt: parsed.data,
            ...(browserContext ? { browserContext } : {}),
            ...(taskTabs ? { taskTabs } : {}),
            ...(rawAction['observation'] !== undefined
              ? {
                  observation:
                    rawAction['observation'] === null
                      ? null
                      : ownedObservation(actionBrowserContext, rawAction['observation']),
                }
              : {}),
          };
        });
        if (
          promoted &&
          (!same(actionBrowserContext, entry.currentBrowserContext) ||
            !same(actionTaskTabs, entry.taskTabs))
        )
          return refuse('The saved task destination does not match its completed action.');
      }
    }
    if (
      entries.some(
        (other) =>
          sameManagedCloudOwner(other.binding.owner, entry.binding.owner) &&
          (other.requestId === entry.requestId ||
            (entry.runId !== undefined && other.runId === entry.runId)),
      )
    )
      return refuse('Saved browser recovery identities conflict. No action was repeated.');
    entries.push(entry);
  }
  return { version: 1, entries };
}

let queue: Promise<unknown> = Promise.resolve();
async function mutate<T>(
  storage: CallerToolCustodyStorage,
  operation: (store: CustodyStore) => T,
  assertCurrent: () => void,
): Promise<T> {
  const work = async (): Promise<T> => {
    assertCurrent();
    const raw = await storage.get(CALLER_TOOL_CUSTODY_KEY);
    assertCurrent();
    const store = parseStore(raw[CALLER_TOOL_CUSTODY_KEY], storage.quotaBytes);
    const result = operation(store);
    if (jsonBytes(store) > storage.quotaBytes)
      return refuse('Browser recovery storage is full. Check the page before continuing.');
    assertCurrent();
    await storage.set({ [CALLER_TOOL_CUSTODY_KEY]: store });
    assertCurrent();
    return structuredClone(result);
  };
  const next = queue.then(async (): Promise<T> => {
    if (!Number.isSafeInteger(storage.quotaBytes) || storage.quotaBytes <= 0)
      return refuse('Browser recovery storage is unavailable.');
    if (typeof navigator !== 'undefined' && navigator.locks)
      return await navigator.locks.request(CUSTODY_LOCK, work);
    return await work();
  });
  queue = next.catch(() => undefined);
  return next;
}

function compactCompletedEntry(entry: CustodyEntry): void {
  if (entry.step?.state === 'in_flight')
    return refuse('The browser action outcome is uncertain. Its claim must be retained.');
  delete entry.step;
  delete entry.browserObservation;
  delete entry.currentBrowserContext;
  delete entry.taskTabs;
  entry.previousCallIds = [];
  entry.toolsJson = '[]';
  entry.terminal = true;
}

export function createChromeCallerToolCustody(
  input: CallerToolCustodyBinding,
  assertCurrent: () => void,
  storage: CallerToolCustodyStorage = {
    quotaBytes: chrome.storage.local.QUOTA_BYTES,
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  },
): ChromeCallerToolCustody {
  const binding = parseBinding(structuredClone(input));
  let requestId: string | undefined;
  const entryFor = (store: CustodyStore): CustodyEntry => {
    const entry = store.entries.find(
      (entry) =>
        entry.requestId === requestId && sameManagedCloudOwner(entry.binding.owner, binding.owner),
    );
    if (!entry || !same(entry.binding, binding) || entry.terminal)
      return refuse('This browser task has no current recovery admission.');
    return entry;
  };
  const sameStep = (entry: CustodyEntry, checkpoint: CallerToolContinuation): CustodyStep => {
    const next = checkpointFields(checkpoint);
    if (!entry.step || !same(next, { cursor: entry.step.cursor, calls: entry.step.calls }))
      return refuse('The browser action checkpoint changed. No action was repeated.');
    return entry.step;
  };
  return {
    async admit(id, tools, observation) {
      if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(id))
        return refuse('The browser task request identity is invalid.');
      const initialObservation =
        observation === undefined
          ? undefined
          : ownedObservation(binding.browserContext, structuredClone(observation));
      const toolsJson = JSON.stringify(structuredClone(tools));
      offeringNames(toolsJson);
      await mutate(
        storage,
        (store) => {
          const existing = store.entries.find(
            (entry) =>
              entry.requestId === id && sameManagedCloudOwner(entry.binding.owner, binding.owner),
          );
          if (existing) {
            if (existing.terminal)
              return refuse('This browser task already finished. Open its saved result.');
            if (!same(existing.binding, binding) || existing.toolsJson !== toolsJson)
              return refuse('The original browser tool offering or owner changed.');
            return;
          }
          store.entries.push({
            binding,
            requestId: id,
            toolsJson,
            terminal: false,
            completedSteps: 0,
            previousCallIds: [],
            ...(initialObservation ? { browserObservation: initialObservation } : {}),
          });
        },
        assertCurrent,
      );
      requestId = id;
    },
    async bindRun(runId) {
      if (!UUID_PATTERN.test(runId)) return refuse('The browser run identity is invalid.');
      await mutate(
        storage,
        (store) => {
          const entry = entryFor(store);
          if (entry.runId !== undefined && entry.runId !== runId)
            return refuse('The browser task changed runs.');
          if (store.entries.some((other) => other !== entry && other.runId === runId))
            return refuse('The browser run already has a different admission.');
          entry.runId = runId;
        },
        assertCurrent,
      );
    },
    claim(checkpoint) {
      return mutate(
        storage,
        (store) => {
          const entry = entryFor(store);
          const next = checkpointFields(checkpoint);
          if (
            next.cursor.run_id !== entry.runId ||
            next.calls.some((call) => !offeringNames(entry.toolsJson).includes(call.function.name))
          )
            return refuse(
              'The browser actions do not belong to the original run and tool offering.',
            );
          if (entry.step?.cursor.next_event_sequence === next.cursor.next_event_sequence) {
            const current = sameStep(entry, checkpoint);
            if (current.state === 'completed') return current.receipt!;
            return refuse(
              'These browser actions may already have run. Check the page before continuing.',
            );
          }
          if (entry.step) {
            if (
              entry.step.state !== 'completed' ||
              next.cursor.next_event_sequence <= entry.step.cursor.next_event_sequence
            )
              return refuse('The browser task has an unresolved or stale action checkpoint.');
            entry.previousCallIds.push(...entry.step.calls.map((call) => call.id));
            entry.completedSteps += 1;
          }
          if (
            entry.completedSteps >= MAX_CALLER_TOOL_STEPS ||
            next.calls.some((call) => entry.previousCallIds.includes(call.id))
          )
            return refuse('The browser task repeated an action or exceeded its step budget.');
          entry.step = {
            ...next,
            state: 'in_flight',
            actions: [],
            ...(entry.taskTabs ? { initialTaskTabs: entry.taskTabs } : {}),
            ...((entry.currentBrowserContext ?? entry.binding.browserContext)
              ? {
                  initialBrowserContext:
                    entry.currentBrowserContext ?? entry.binding.browserContext,
                }
              : {}),
          };
          return null;
        },
        assertCurrent,
      );
    },
    claimAction(checkpoint, callId) {
      return mutate(
        storage,
        (store) => {
          const step = sameStep(entryFor(store), checkpoint);
          const callIndex = step.calls.findIndex((call) => call.id === callId);
          if (callIndex < 0)
            return refuse('This browser action does not belong to the checkpoint.');
          if (step.state === 'completed')
            return step.receipt!.tool_results.find((result) => result.tool_call_id === callId)!;
          if (!step.actions)
            return refuse(
              'The browser batch has an unknown legacy outcome. No action was repeated.',
            );
          const previous = step.actions[callIndex];
          if (previous?.state === 'completed') return previous.receipt!;
          if (previous)
            return refuse('This browser action may already have run. No action was repeated.');
          if (
            callIndex !== step.actions.length ||
            step.actions.some((action) => action.state !== 'completed')
          )
            return refuse('The previous browser action is unresolved.');
          step.actions.push({ callId, state: 'in_flight' });
          return null;
        },
        assertCurrent,
      );
    },
    completeAction(checkpoint, value, observation, browserContext, taskTabs) {
      observation = observation === undefined ? undefined : structuredClone(observation);
      browserContext = browserContext === undefined ? undefined : structuredClone(browserContext);
      taskTabs = taskTabs === undefined ? undefined : structuredClone(taskTabs);
      const parsed = CallerToolResultSchema.safeParse(value);
      if (!parsed.success)
        return Promise.reject(new CallerToolCustodyError('The browser action receipt is invalid.'));
      return mutate(
        storage,
        (store) => {
          const step = sameStep(entryFor(store), checkpoint);
          if (step.state === 'completed') {
            const saved = step.receipt!.tool_results.find(
              (result) => result.tool_call_id === parsed.data.tool_call_id,
            );
            if (!same(saved, parsed.data))
              return refuse('The browser action already has a different receipt.');
            return saved!;
          }
          const action = step.actions?.find((action) => action.callId === parsed.data.tool_call_id);
          if (!action) return refuse('The browser action has no durable claim.');
          if (action.state === 'completed') {
            if (
              !same(action.receipt, parsed.data) ||
              (observation !== undefined && !same(action.observation, observation)) ||
              (browserContext !== undefined && !same(action.browserContext, browserContext)) ||
              (taskTabs !== undefined && !same(action.taskTabs, taskTabs))
            )
              return refuse('The browser action already has a different receipt or page context.');
            return parsed.data;
          }
          const entry = entryFor(store);
          let nextContext: CallerBrowserContext | undefined;
          if (browserContext !== undefined) {
            const call = step.calls.find((call) => call.id === parsed.data.tool_call_id);
            if (call?.function.name !== CHAT_BROWSER_TASK_TOOL)
              return refuse('Only a completed browser task can promote a page context.');
            nextContext = ownedTaskContext(entry.binding.browserContext, browserContext);
          }
          if (taskTabs !== undefined && !nextContext)
            return refuse('Task tabs have no native completion context.');
          const nextTabs =
            taskTabs === undefined
              ? undefined
              : ownedTaskTabs(entry.binding, nextContext, taskTabs, entry.taskTabs);
          const checkedObservation =
            observation === undefined || observation === null
              ? observation
              : ownedObservation(
                  nextContext ?? entry.currentBrowserContext ?? entry.binding.browserContext,
                  observation,
                );
          action.state = 'completed';
          action.receipt = parsed.data;
          if (nextContext) {
            action.browserContext = nextContext;
            entry.currentBrowserContext = nextContext;
            if (nextTabs) {
              action.taskTabs = nextTabs;
              entry.taskTabs = nextTabs;
            } else delete entry.taskTabs;
            delete entry.browserObservation;
          }
          if (checkedObservation !== undefined) {
            action.observation = checkedObservation;
            if (checkedObservation === null) delete entry.browserObservation;
            else entry.browserObservation = checkedObservation;
          }
          return parsed.data;
        },
        assertCurrent,
      );
    },
    complete(checkpoint, value) {
      return mutate(
        storage,
        (store) => {
          const entry = entryFor(store);
          const step = sameStep(entry, checkpoint);
          const receipt = receiptFor(step, value);
          if (step.state === 'completed' && !same(step.receipt, receipt))
            return refuse('The browser action already has a different receipt.');
          if (
            step.state !== 'completed' &&
            (!step.actions ||
              step.actions.length !== step.calls.length ||
              step.actions.some(
                (action) =>
                  action.state !== 'completed' ||
                  !same(
                    action.receipt,
                    receipt.tool_results.find((result) => result.tool_call_id === action.callId),
                  ),
              ))
          )
            return refuse(
              'Every browser action needs its matching durable receipt before continuation.',
            );
          step.receipt = receipt;
          step.state = 'completed';
          delete step.actions;
          delete step.initialTaskTabs;
          delete step.initialBrowserContext;
          return receipt;
        },
        assertCurrent,
      );
    },
    async finish() {
      await mutate(
        storage,
        (store) => {
          const entry = entryFor(store);
          compactCompletedEntry(entry);
        },
        assertCurrent,
      );
    },
  };
}

export async function readChromeCallerToolCustody(
  owner: ManagedCloudOwner,
  runId: string,
  assertCurrent: () => void,
  storage: CallerToolCustodyStorage = {
    quotaBytes: chrome.storage.local.QUOTA_BYTES,
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  },
): Promise<Readonly<CustodyEntry & { originalToolNames: readonly string[] }> | null> {
  const normalized = normalizeManagedCloudOwner(owner);
  if (!normalized || !UUID_PATTERN.test(runId))
    return refuse('The saved browser run identity is invalid.');
  if (!Number.isSafeInteger(storage.quotaBytes) || storage.quotaBytes <= 0)
    return refuse('Browser recovery storage is unavailable.');
  assertCurrent();
  const raw = await storage.get(CALLER_TOOL_CUSTODY_KEY);
  assertCurrent();
  const store = parseStore(raw[CALLER_TOOL_CUSTODY_KEY], storage.quotaBytes);
  const entry = store.entries.find(
    (candidate) =>
      candidate.runId === runId && sameManagedCloudOwner(candidate.binding.owner, normalized),
  );
  return entry
    ? structuredClone({ ...entry, originalToolNames: offeringNames(entry.toolsJson) })
    : null;
}

export async function acknowledgeCompletedCallerRun(
  owner: ManagedCloudOwner,
  completedRun: ManagedCloudAgentRunReference,
  expectedCursor: number,
  assertCurrent: () => void,
  storage: CallerToolCustodyStorage = {
    quotaBytes: chrome.storage.local.QUOTA_BYTES,
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  },
): Promise<boolean> {
  const normalized = normalizeManagedCloudOwner(owner);
  const parsed = ManagedCloudAgentRunReferenceSchema.safeParse(completedRun);
  if (
    !normalized ||
    !parsed.success ||
    parsed.data.state !== 'completed' ||
    !Number.isSafeInteger(expectedCursor) ||
    expectedCursor <= 0 ||
    parsed.data.lastSequence < expectedCursor
  )
    return false;
  return mutate(
    storage,
    (store) => {
      const entry = store.entries.find(
        (entry) =>
          entry.runId === parsed.data.runId &&
          sameManagedCloudOwner(entry.binding.owner, normalized),
      );
      if (
        !entry ||
        entry.terminal ||
        entry.step?.state !== 'completed' ||
        entry.step.cursor.next_event_sequence !== expectedCursor
      )
        return false;
      compactCompletedEntry(entry);
      return true;
    },
    assertCurrent,
  );
}
