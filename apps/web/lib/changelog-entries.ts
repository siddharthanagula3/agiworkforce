import { DESKTOP_LOCAL_RUNTIMES } from './marketing-constants';

export interface Release {
  date: string;
  headline: string;
  body: string[];
}

export const RELEASES: readonly Release[] = [
  {
    date: '2026-09-05',
    headline: 'Model catalogue, route health and the operator console · live',
    body: [
      'Web: a model catalogue behind the composer with favourites, a Recommended short list, plan admission derived from the billing catalogue, and a served-by receipt on every reply.',
      'Routing: Auto now tracks provider, credential and capability health separately, rotates away from an unfunded provider account once, and tells you when a pinned model cannot be served.',
      'Operations: an operator console with feedback triage, user operations, attributed cost, routing health, takedowns and data-rights requests, every action with a reason and an audit row.',
    ],
  },
  {
    date: '2026-07-31',
    headline: 'Agent tooling and platform maturity · live',
    body: [
      'CLI: configurable keybindings, live NDJSON event streaming, named-agent runs, session search by pull request, managed-gateway model discovery.',
      'Desktop: official MCP registry connection, menu bar residency, renderer IPC isolation, secure LLM proxy settings.',
      'Web: centralized approval inbox, live admin security console, virtualized chat transcript, account session management.',
    ],
  },
  {
    date: '2026-07-03',
    headline: 'Desktop local model providers · live',
    body: [
      `Desktop now talks to ${DESKTOP_LOCAL_RUNTIMES.label} as local, self-hosted model providers, alongside the existing BYOK provider set.`,
    ],
  },
  {
    date: '2026-06-24',
    headline: 'Local, BYOK, and cloud trust boundary · live',
    body: [
      'Fail-closed egress separation enforced across all six surfaces: local mode makes no network call to us, BYOK traffic goes straight to the provider you configured, managed cloud is metered against your plan.',
      'Canonical security policy published in SECURITY.md, naming the trust-boundary model and its known gaps.',
    ],
  },
  {
    date: '2026-05-08',
    headline: 'Marketing site redesign · live',
    body: [
      'Site-wide redesign on the new dark theme. Same surface across every marketing route.',
      'Single typeface (Geist Sans), 12-spoke brand mark, single amber accent used surgically.',
      'No version numbers, no model IDs, no vanity counts in marketing copy. /changelog is the explicit exception.',
    ],
  },
  {
    date: '2026-05-04',
    headline: 'OpenClaw porting · complete',
    body: [
      'Provider adapter interface stable. Anthropic, OpenAI, Ollama, Google adapters live.',
      'MCP transport and skills loader landed. Hook events parity in the Rust CLI. Live cross-provider demo runs through the API gateway.',
    ],
  },
  {
    date: '2026-05-03',
    headline: 'CLI v1.0 · live',
    body: [
      'Pure Rust binary on five platforms. GitHub Release, Homebrew tap auto-generated, install.sh tested.',
      'Cleanup pass: removed ~70 codex-rs port crates and a large net of dead code. Audit closed most P0/P1 items.',
    ],
  },
  {
    date: '2026-02 to 2026-05',
    headline: 'Desktop · early releases',
    body: [
      `Tauri + React desktop with release signing and installer publishing aligned to the public release path.`,
      'Public download links open only after verified GitHub release assets or configured signed-asset URLs are available.',
    ],
  },
];
