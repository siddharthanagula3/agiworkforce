const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = '/Users/siddhartha/Desktop/agiworkforce/.worktrees/billing-e2e';
const localRequire = createRequire(path.join(root, 'package.json'));
const ts = localRequire('typescript');
let digestGate = null;
const expoCrypto = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (n) => new Uint8Array(crypto.randomBytes(n)),
  getRandomBytesAsync: async (n) => new Uint8Array(crypto.randomBytes(n)),
  digest: async (_algorithm, bytes) => {
    if (digestGate) await digestGate;
    const b = crypto.createHash('sha256').update(Buffer.from(bytes)).digest();
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
};
function load(relative, dependencies = {}, append = '') {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source + append, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const run = vm.runInThisContext('(function(require,module,exports){' + js + '\n})', {
    filename: path.join(root, relative),
  });
  run((id) => Object.hasOwn(dependencies, id) ? dependencies[id] : localRequire(id), module, module.exports);
  return module.exports;
}
const contracts = load('packages/contracts/types/src/dispatch.ts');
const hmac = load('apps/mobile/lib/dispatchHmac.ts', {
  'expo-crypto': expoCrypto,
  '@agiworkforce/types': contracts,
});
const makeState = () => ({ secret: 'a'.repeat(64), nonceCache: new Map() });
const agents = {
  agents: [], pendingApprovals: [],
  setAgents(value) { this.agents = value; },
};
const resettable = { reset() {} };
const parseAgent = load('apps/mobile/lib/dispatchAgentValidator.ts').parseAgent;
const featureFlags = load('apps/mobile/lib/v1FeatureFlags.ts');
const connection = load('apps/mobile/stores/connectionStore.ts', {
  '@/lib/mmkv': {
    mmkvStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    rehydrateWhenMmkvReady: () => {},
  },
  '@agiworkforce/utils/signaling': { SignalingClient: class {}, endsPairing: () => false },
  'react-native-webrtc': { RTCPeerConnection: class {}, RTCSessionDescription: class {}, RTCIceCandidate: class {} },
  'expo-crypto': expoCrypto,
  'expo-constants': { default: { expoConfig: { version: 'test' } } },
  '@/lib/dispatchHmac': hmac,
  '@/lib/dispatchAgentValidator': { parseAgent, MAX_AGENTS_PER_UPDATE: 50 },
  '@/src/integrations/controlAckTracker': { createControlAckTracker: () => ({ clear() {}, resolve() {}, track() {} }) },
  '@/lib/constants': { WS_URL: 'ws://unused.invalid' },
  './agentStore': { useAgentStore: { getState: () => agents } },
  './dispatchTaskStore': { useDispatchTaskStore: { getState: () => resettable } },
  '@/services/companionNotifications': { notifyCompanionMessage() {} },
  '@/lib/v1FeatureFlags': featureFlags,
  '@/src/features/companion/remote-code/store': {
    ingestRemoteCodeControl() {}, useRemoteCodeStore: { getState: () => resettable },
  },
  '@agiworkforce/types': contracts,
  '@/services/manualPairing': {},
}, '\nexport const __audit = { handleControlMessageAsync, setHmac: (state: HmacSessionState) => { hmacState = state; } };');

(async () => {
  const wire = await hmac.signMessage(makeState(), 'task_completed', { action: 'task_completed' });
  const sequential = makeState();
  const sequentialResults = [await hmac.verifyMessage(sequential, wire), await hmac.verifyMessage(sequential, wire)];
  const badMac = await hmac.verifyMessage(makeState(), { ...wire, hmac: '0'.repeat(64) });
  const concurrent = makeState();
  const concurrentResults = await Promise.all([hmac.verifyMessage(concurrent, wire), hmac.verifyMessage(concurrent, wire)]);

  const pairedState = makeState();
  connection.__audit.setHmac(pairedState);
  connection.useConnectionStore.setState({ status: 'connected' });
  const oldAgent = {
    id: 'old-pair-agent', name: 'Old pair confidential task', model: 'fixture-model',
    status: 'running', currentStep: 'private work', progress: 10,
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const oldWire = await hmac.signMessage(makeState(), 'agents_update', { action: 'agents_update', agents: [oldAgent] });
  let releaseDigest;
  digestGate = new Promise((resolve) => { releaseDigest = resolve; });
  const pending = connection.__audit.handleControlMessageAsync(oldWire);
  connection.useConnectionStore.getState().disconnect();
  const afterDisconnect = { status: connection.useConnectionStore.getState().status, agents: agents.agents.length };
  digestGate = null;
  releaseDigest();
  await pending;
  const afterVerification = { status: connection.useConnectionStore.getState().status, agents: agents.agents.map((a) => a.id) };
  console.log(JSON.stringify({
    method: 'Transpiles unchanged full source modules; uses real SHA256/randomness via Node crypto. Native transport/storage and unrelated stores are inert fixtures. Only private function/state access is appended in memory.',
    sequentialResults, badMac, concurrentResults, nonceCount: concurrent.nonceCache.size,
    afterDisconnect, afterVerification,
    sourceHashes: Object.fromEntries(['apps/mobile/lib/dispatchHmac.ts','apps/mobile/stores/connectionStore.ts','packages/contracts/types/src/dispatch.ts'].map((p) => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')])),
  }, null, 2));
  if (!sequentialResults[0].ok || sequentialResults[1].ok || badMac.ok) throw new Error('Harness control cases failed');
  if (!concurrentResults.every((r) => r.ok)) throw new Error('Concurrent replay not reproduced');
  if (afterDisconnect.agents !== 0 || afterVerification.agents[0] !== oldAgent.id) throw new Error('Post-disconnect mutation not reproduced');
})().catch((error) => { console.error(error); process.exitCode = 1; });
