# Inventory Rollup (Phase 1)

Status: Current
Owner: Lead engineer (autonomous)
Last updated: 2026-05-29
Basis: 18 slices (17 via Wave-1 workflow + `surface-sandbox` manual). Per-slice detail: `reports/audit/inventory/*.md`. Severity-ranked issues + dead-code ledger: `reports/audit/AUDIT.md`.

| Slice | Alive status | ~LOC | Test coverage | Top finding(s) |
| --- | --- | --- | --- | --- |
| surface-web | shipping | ~120k | 175 vitest + 3 e2e | P1 settings hooks fake-success; P2 provider drift; well-hardened auth/XSS/BYOK |
| surface-cli | shipping | ~80k | ~1507 inline | **P1 voice Local→cloud egress**; P1 app-server no `tools/call`; subagent_v2 dead |
| surface-desktop-frontend | mixed (dead-heavy) | ~300k | 151 files (much on dead tree) | **P1 6/7 sidebar nav dead**; P1 Settings IA≠SoT; big dead islands; fabricated-stats already fixed |
| surface-desktop-tauri | shipping | ~379k | 4280 test fns | **P0 ~11 byte-slice aborts**; fabricated trend; tray no-op; security otherwise hardened |
| surface-mobile | shipping (lead) | — | broad | **P0 pinning launch crash**; P1 first-run model inert; P1 memory irrelevant facts |
| surface-chrome-ext | shipping | ~80 files | good | P2 buggy cloud-IPC CI guard; cloud-bridge cluster dead; misleading @deprecated |
| surface-vscode-ext | shipping | — | deep | hardened; 3 stale snapshots fail tests; no orphans |
| surface-sandbox | **unwired** | tiny | none | secure cross-origin renderer unused; shipping uses in-app `ReactPreview` (no CSP) |
| rust-core-crates | shipping (closure) | — | strong | network-proxy/execpolicy = "misleading dead security surface"; zero user-reachable panics in closure |
| rust-utils-crates | shipping (closure) | — | adequate | **P1 utils-cache current-thread panic** (reachable via CLI subagent+image cache) |
| rust-orphan-crates | orphan ×4 | — | tests gate nothing in CI | apply-patch+plugin-runtime DELETE; **app-server KEEP** (fix vehicle); task-runtime KEEP |
| pkg-types-contracts | shipping (spine) | — | strong | clean; the canonical contract — catalog drift is downstream of NOT reading from here |
| pkg-providers | mostly shipping | — | mostly tested | 4 adapters orphaned (deepseek/xai/perplexity/lmstudio) — wire = 4 lines |
| pkg-llm-runtime | shipping | ~6.7k | ~491 tests | **P1 buildFallbackChain dead + latent Local→cloud**; tier2/3 cancel no-op |
| pkg-data-stores | shipping (data-layer) | — | — | **@agiworkforce/stores EMPTY** w/ phantom deps; auth/storage/realtime adapters dead |
| pkg-tools | shipping | — | — | **P2 ReactPreview no CSP** (LLM-artifact egress); browser-tool runner unwired; Tooltip stub |
| pkg-ui-misc | shipping | — | partial | P2 logger redactor untested; vestigial validation exports; worklets stub is intentional |
| services | shipping ("most mature") | — | good | **P1 RLS-claim-not-implemented**; P1 dead per-token revocation; P1 enterprise join returns [] |

**Themes:** (1) model-catalog drift = the test-gate blocker; (2) 2 P0 crash classes; (3) PRIVACY-01 egress gaps; (4) gateway security-comment-vs-reality; (5) lots of well-built-but-unwired code; (6) the locked SoT P0 parity tail (Desktop Cowork/Code, Settings IA, artifacts/connectors/memory/search).

**Coverage caveat:** Wave-1 agents did NOT run tests (lead ran the gate battery separately — see `gate-baseline/`). Coverage notes above are file-presence/density, not measured %.
