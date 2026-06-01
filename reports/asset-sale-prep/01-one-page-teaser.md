# AGI Workforce Buyer Teaser

Status: Draft
Owner: Founder
Created: 2026-05-31
Confidentiality: Non-confidential first-contact version

## Headline

AGI Workforce is a local-first, BYOK, multi-provider AI application suite spanning mobile, web, desktop, CLI, Chrome extension, and VS Code extension.

## One-Sentence Pitch

AGI Workforce gives users ChatGPT/Claude-style workflows while letting them choose local models, bring their own provider keys, or join an invite-gated managed-cloud path.

## Why This Exists

Users increasingly rely on multiple AI products, model providers, and surfaces. AGI Workforce packages the application layer around a different trust model:

- Local-first privacy where supported.
- Explicit BYOK provider routing.
- Multi-provider model catalog and capability metadata.
- Managed cloud kept gated until metering, abuse, billing, retention, deletion, and provider-term controls are proven.
- One suite across consumer app surfaces and developer surfaces.

## Current Asset

The asset is a proprietary monorepo and documentation system with:

- Mobile app: local-first chat, local LLM direction, cloud waitlist/invite posture.
- Desktop app: Tauri/React local-private compute host, model/provider UI, artifacts, connectors/MCP direction.
- Web app: account, projects, synced app chats, artifacts, billing/waitlist/admin direction.
- CLI: Rust developer agent engine with privacy modes, hooks, skills, MCP/plugins direction.
- Chrome extension: MV3 browser context, capture, side panel, native bridge direction.
- VS Code extension: IDE-native chat, patches/checkpoints, workspace-scoped context direction.
- Shared packages/crates: types, model catalog, routing, runtime, provider adapters, generated-file and privacy contracts.
- Extensive current product docs, parity matrix, risk ledgers, and guardrail scripts.

## Verification Snapshot

Local verification on 2026-05-31:

- `pnpm check:llm-operability` passed.
- `pnpm typecheck:all` passed.
- `cargo check --workspace` passed.
- `pnpm test` failed in mobile with 4 failed suites / 33 failed tests; failures cluster around drawer rendering, local-model usage tracking, and dispatch/control-message behavior.

## Buyer Fit

This is most relevant to buyers building:

- AI coding agents and IDE workflows.
- Local/private AI applications.
- Multi-provider model routing.
- BYOK developer or prosumer products.
- Browser/computer-use extensions.
- Cross-surface AI application suites.

## Transaction Interest

The founder is exploring a strategic asset sale, acquisition, or structured transition where a buyer can productize, integrate, or accelerate the work faster than rebuilding it internally.

## Suggested Initial Call

30 minutes:

1. Buyer priorities and fit.
2. Founder demo: local-first mobile, desktop/web artifact flow, developer surface.
3. Discussion of transaction shape: asset sale, acquisition, licensing, or transition support.
4. NDA and staged diligence if there is mutual interest.

## Founder Contact

Siddhartha Nagula  
GitHub: `siddharthanagula3`  
Website: `https://agiworkforce.com`
