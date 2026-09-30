import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedAgentLoopOptions {
  signal: AbortSignal;
  assertOwnership: () => Promise<void>;
  resolveOwnedCredential: () => Promise<string>;
  onActionStateChange: (active: boolean) => Promise<void>;
}

const harness = vi.hoisted(() => {
  const EXTENSION_ID = 'agi-background-guard-test';
  const RUN_TAB_ID = 41;
  const RUN_WINDOW_ID = 7;
  const SITE_A = 'https://site-a.example';
  const SITE_B = 'https://site-b.example';
  const SITE_ALLOWLIST_KEY = 'agi_site_allowlist';
  const CONSENT_KEY = 'agi_cu_browser_control_consent';

  const localStore: Record<string, unknown> = {
    agi_dev_bearer_token: 'background-guard-test-token',
  };
  const unreadableKeys = new Set<string>();
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const nativeListeners: Array<(message: unknown) => void> = [];
  const storageListeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];
  const captured: { options: CapturedAgentLoopOptions | null } = { options: null };
  const tab = { id: RUN_TAB_ID, url: `${SITE_A}/start`, windowId: RUN_WINDOW_ID };

  const event = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  });

  const readStore = (keys: unknown): Promise<Record<string, unknown>> => {
    const requested =
      keys === undefined || keys === null
        ? Object.keys(localStore)
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? (keys as string[])
            : Object.keys(keys as Record<string, unknown>);
    if (requested.some((key) => unreadableKeys.has(key))) {
      return Promise.reject(new Error('storage unavailable'));
    }
    const out: Record<string, unknown> =
      keys !== null && typeof keys === 'object' && !Array.isArray(keys)
        ? { ...(keys as Record<string, unknown>) }
        : {};
    for (const key of requested) {
      if (key in localStore) out[key] = localStore[key];
    }
    return Promise.resolve(out);
  };

  const area = (store: Record<string, unknown>) => ({
    get: vi.fn((keys?: unknown) => (store === localStore ? readStore(keys) : Promise.resolve({}))),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      return Promise.resolve();
    }),
    clear: vi.fn(() => Promise.resolve()),
  });

  const debuggerMock = {
    attach: vi.fn((_target: unknown, _version: unknown, callback?: () => void) => callback?.()),
    detach: vi.fn((_target: unknown, callback?: () => void) => callback?.()),
    sendCommand: vi.fn(
      (_target: unknown, _method: string, _params: unknown, callback?: (result: unknown) => void) =>
        callback?.({}),
    ),
    onDetach: event(),
  };

  const chromeMock = {
    runtime: {
      id: EXTENSION_ID,
      lastError: null as { message: string } | null,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      onMessage: {
        addListener: vi.fn((listener: (typeof messageListeners)[number]) => {
          messageListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
      onConnect: event(),
      onInstalled: event(),
      onStartup: event(),
      onSuspend: event(),
      onSuspendCanceled: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
      connectNative: vi.fn(() => ({
        name: 'com.agiworkforce.browser',
        onMessage: {
          addListener: vi.fn((listener: (message: unknown) => void) => {
            nativeListeners.push(listener);
          }),
          removeListener: vi.fn(),
        },
        onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
    },
    storage: {
      local: area(localStore),
      sync: area({}),
      session: area({}),
      onChanged: {
        addListener: vi.fn((listener: (typeof storageListeners)[number]) => {
          storageListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      get: vi.fn((tabId: number) =>
        tabId === tab.id ? Promise.resolve({ ...tab }) : Promise.reject(new Error('no such tab')),
      ),
      query: vi.fn(() => Promise.resolve([{ ...tab }])),
      sendMessage: vi.fn(() => Promise.resolve()),
      onRemoved: event(),
      onUpdated: event(),
      onActivated: event(),
    },
    windows: { get: vi.fn(() => Promise.resolve({ id: RUN_WINDOW_ID })), onFocusChanged: event() },
    alarms: {
      create: vi.fn((_name: string, _info: unknown, callback?: () => void) => callback?.()),
      clear: vi.fn(() => Promise.resolve(true)),
      getAll: vi.fn(() => Promise.resolve([])),
      onAlarm: event(),
    },
    notifications: { create: vi.fn(), onClicked: event(), onButtonClicked: event() },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn((callback?: () => void) => callback?.()),
      onClicked: event(),
    },
    sidePanel: {
      setPanelBehavior: vi.fn(() => Promise.resolve()),
      open: vi.fn(() => Promise.resolve()),
    },
    commands: { onCommand: event() },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
    scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    debugger: debuggerMock,
    permissions: {
      contains: vi.fn(() => Promise.resolve(true)),
      request: vi.fn(() => Promise.resolve(true)),
    },
    i18n: { getMessage: (key: string) => key },
  };

  (globalThis as Record<string, unknown>).chrome = chromeMock;
  (globalThis as Record<string, unknown>).fetch = vi.fn(() =>
    Promise.reject(new Error('offline in tests')),
  );

  const runAgentLoop = vi.fn((_goal: string, _tabId: number, options: CapturedAgentLoopOptions) => {
    captured.options = options;
    return new Promise<never>(() => {});
  });

  return {
    EXTENSION_ID,
    RUN_TAB_ID,
    SITE_A,
    SITE_B,
    SITE_ALLOWLIST_KEY,
    CONSENT_KEY,
    localStore,
    unreadableKeys,
    messageListeners,
    nativeListeners,
    storageListeners,
    captured,
    debuggerMock,
    tab,
    runAgentLoop,
  };
});

vi.mock('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/computer-use/agentLoop', () => ({
  runAgentLoop: harness.runAgentLoop,
}));

import { assertDestinationAllowlisted, navigate } from '/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/computer-use/cdpDriver';

const { EXTENSION_ID, RUN_TAB_ID, SITE_A, SITE_B, SITE_ALLOWLIST_KEY, CONSENT_KEY } = harness;

function putStorage(key: string, value: unknown): void {
  harness.localStore[key] = value;
  for (const listener of harness.storageListeners) {
    listener({ [key]: { newValue: value } }, 'local');
  }
}

function dispatch(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const listener = harness.messageListeners[0];
  if (!listener) throw new Error('background did not register a runtime message listener');
  return new Promise((resolve) => {
    listener(
      message,
      {
        id: EXTENSION_ID,
        url: `chrome-extension://${EXTENSION_ID}/sidepanel.html`,
        origin: `chrome-extension://${EXTENSION_ID}`,
      },
      (response) => resolve((response ?? {}) as Record<string, unknown>),
    );
  });
}

async function startRun(runId: string): Promise<CapturedAgentLoopOptions> {
  harness.captured.options = null;
  const response = await dispatch({
    type: 'AGI_START_COMPUTER_USE',
    goal: 'complete the application',
    tabId: RUN_TAB_ID,
    runId,
  });
  expect(response['success'], String(response['error'])).toBe(true);
  const options = harness.captured.options;
  if (!options) throw new Error('runAgentLoop was never reached');
  return options;
}

function pageNavigations(): string[] {
  return harness.debuggerMock.sendCommand.mock.calls
    .filter((call) => call[1] === 'Page.navigate')
    .map((call) => String((call[2] as { url?: unknown } | undefined)?.url));
}


const audit = vi.hoisted(()=>({owner:{accountId:'account-audit',authIncarnation:'session-audit'},cancel:vi.fn(),execute:vi.fn()}));
vi.mock('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/cloud-bridge/freeTrialClient',async()=>{
 const actual=await vi.importActual<any>('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/cloud-bridge/freeTrialClient');
 return {...actual,getManagedCloudAuthContext:async()=>({owner:audit.owner,token:'audit-only-test-token'}),getAuthToken:async()=> 'audit-only-test-token'};
});
vi.mock('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/cloud-bridge/managedRunControl',async()=>{
 const actual=await vi.importActual<any>('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/cloud-bridge/managedRunControl');
 return {...actual,cancelChromeManagedRun:audit.cancel};
});
beforeAll(async()=>{
 harness.localStore[SITE_ALLOWLIST_KEY]=[SITE_A];
 harness.localStore[CONSENT_KEY]=[SITE_A];
 await import('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/background');
 await new Promise(resolve=>setTimeout(resolve,0));
});
beforeEach(()=>{
 audit.cancel.mockReset();
 (globalThis.chrome.tabs.sendMessage as any).mockClear();
 putStorage(SITE_ALLOWLIST_KEY,[SITE_A]);
 putStorage(CONSENT_KEY,[SITE_A]);
});
it('rejects WebMCP calls targeting an unapproved tab despite a trusted panel sender',async()=>{
 harness.tab.url='https://unapproved.example/form';
 (globalThis.chrome.tabs.sendMessage as any).mockResolvedValue({success:true,result:{executed:true}});
 const response=await dispatch({type:'WEBMCP_CALL_TOOL',tabId:RUN_TAB_ID,toolName:'submit_form',input:{}});
 expect({success:response.success,forwardCount:(globalThis.chrome.tabs.sendMessage as any).mock.calls.length}).toEqual({success:false,forwardCount:0});
});
it('returns a cancellation failure instead of reporting success when the server refused Stop',async()=>{
 audit.cancel.mockResolvedValue({status:'error',code:'server_error',message:'Cancellation service unavailable'});
 const response=await dispatch({type:'CANCEL_STREAM',owner:audit.owner,clientInstanceId:'audit-panel',id:'stream-audit',cloudRun:{runId:'11111111-1111-4111-8111-111111111111',runPath:'/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',lastSequence:0,state:'running'}});
 expect(audit.cancel).toHaveBeenCalledOnce();
 expect(response.success).toBe(false);
 expect(String(response.error)).toContain('Cancellation');
});

it('applies approved boolean form arguments before claiming WebMCP submission succeeded',async()=>{
 const {callTool}=await import('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/webmcp');
 document.body.innerHTML='<form tool-name="newsletter" method="post"><input name="subscribe" type="checkbox"></form>';
 const form=document.querySelector('form')!;
 const submit=vi.spyOn(form,'requestSubmit').mockImplementation(()=>{});
 vi.spyOn(window,'confirm').mockReturnValue(true);
 const result=await callTool({name:'newsletter',arguments:{subscribe:true}});
 expect(result.success).toBe(true);
 expect(submit).toHaveBeenCalledOnce();
 expect((document.querySelector('input') as HTMLInputElement).checked).toBe(true);
});

vi.mock('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/cloud-bridge/managedChatHandler',async()=>{
 const actual=await vi.importActual<any>('/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e/apps/extension/src/features/cloud-bridge/managedChatHandler');
 return {...actual,executeChromeManagedChat:audit.execute};
});
it('detaches a durable AGI Work follower when its panel closes without cancelling the task',async()=>{
 const cloudRun={runId:'22222222-2222-4222-8222-222222222222',runPath:'/api/llm/v1/chat/completions/runs/22222222-2222-4222-8222-222222222222',lastSequence:0,state:'running'};
 audit.cancel.mockResolvedValue({status:'success',run:{state:'cancelled'}});
 audit.execute.mockImplementation(async(request,deps)=>{
  await deps.onRunReference(cloudRun);
  return await new Promise(resolve=>request.signal.addEventListener('abort',()=>resolve({status:'error',code:'cancelled',message:'Cancelled'}),{once:true}));
 });
 const port={name:'agi-managed-chat:audit-panel-work',sender:{id:EXTENSION_ID,url:`chrome-extension://${EXTENSION_ID}/sidepanel.html`,origin:`chrome-extension://${EXTENSION_ID}`},onMessage:{addListener:vi.fn()},onDisconnect:{addListener:vi.fn()},disconnect:vi.fn()};
 const connect=(globalThis.chrome.runtime.onConnect.addListener as any).mock.calls[0][0];
 connect(port);
 expect(port.onDisconnect.addListener).toHaveBeenCalledOnce();
 expect((await dispatch({type:'CHAT_MESSAGE',owner:audit.owner,clientInstanceId:'audit-panel-work',id:'stream-work',text:'finish the task',workMode:'agiwork'})).success).toBe(true);
 await vi.waitFor(()=>expect(audit.execute).toHaveBeenCalledOnce());
 await new Promise(resolve=>setTimeout(resolve,0));
 port.onDisconnect.addListener.mock.calls[0][0]();
 await Promise.resolve();
 expect(audit.cancel).not.toHaveBeenCalled();
});
