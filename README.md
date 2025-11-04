# AGI Workforce – Monorepo Overview

AGI Workforce is an autonomous desktop automation platform built on **Tauri 2.0, React 18, TypeScript, and a Rust command layer**. The goal is to ship a secure, low-latency assistant that can orchestrate Windows automation, browser control, API workflows, and marketplace extensions while routing intelligently across multiple LLMs (including local models such as **Ollama**) to minimize cost.

This repository currently contains:

- `apps/desktop` – Tauri + React desktop shell (primary focus)
- `apps/mobile` – React Native / Expo companion (scaffolded, incomplete)
- `apps/extension` – Browser extension bridge (prototype)
- `services/*` – Node-based API gateway, signaling server
- `packages/*` – Shared TypeScript utilities and types
- `infrastructure/` – Docker, deployment scripts
- `docs/` – Product, engineering, and security documentation

## Current Status (November 2025)

- `pnpm install` succeeds, but `pnpm typecheck` still fails with ~1,200 strict-mode errors across desktop, mobile, and services. Build health must be restored before shipping.
- Desktop shell wiring, chat surfaces, and MCP backends are in various stages of implementation; several UIs remain disconnected from the Rust command layer.
- Multi-provider routing scaffolding exists (`OpenAI`, `Anthropic`, `Google`, `Ollama`), yet configuration, API key management, and error handling require fixes before production use.
- Local LLM execution is planned via **Ollama** on Windows; desktop UI and settings must distinguish between token-based cloud providers and on-device models.
- Documentation was previously overly optimistic. Every major `.md` file is being refreshed to reflect real progress, gaps, and the path to outcompeting subscription-first rivals (e.g., Cursor Desktop).

### Priority Gaps

1. Restore TypeScript build health and ensure `pnpm lint`, `pnpm typecheck`, and Tauri builds pass in CI.
2. Finish MCP wiring (filesystem, automation, API, productivity) into the desktop UI with robust error surfaces.
3. Harden multi-LLM router: deterministic provider selection, cost tracking, fallback paths, and local-model routing policies.
4. Flesh out onboarding, secrets storage, and guardrails so the desktop agent can run unattended automation safely.
5. Implement token-pack billing and quotas to monetize premium LLM usage while keeping the local Ollama tier free.

## Getting Started

### Prerequisites

- **Windows 11** with WebView2 runtime (desktop target)
- **Node.js 20 LTS** and **pnpm 8.x** (`npm install -g pnpm@8`)
- **Rust stable** (via `rustup`) and the Tauri prerequisites for Windows
- Optional: **Ollama for Windows** for local model experimentation

### Setup Commands

```powershell
pnpm install
pnpm lint
pnpm typecheck           # Expect failures until strict-mode errors are cleared
pnpm --filter @agiworkforce/desktop dev
```

During development, track type errors in `typecheck.log` and ensure every package exports its own `tsconfig.json` with proper references. The repo uses `moduleResolution: "bundler"`; dependencies like `react`, `lucide-react`, and `@tauri-apps/api` must be resolved through local package manifests.

### Running Local LLMs with Ollama

1. Install [Ollama for Windows](https://ollama.com/download).
2. Pull a supported model, e.g. `ollama pull llama3`.
3. Start the Ollama service (`ollama serve`).
4. Configure the desktop app (once settings UI is repaired) to mark Ollama as a zero-cost provider; API keys are not required but model availability should be enumerated at runtime.

## Multi-LLM Strategy

- **Cloud Providers:** OpenAI, Anthropic, and Google (Gemini) remain available for premium tiers. Token packs will mirror the Cursor model, allowing power users to pay only when they need frontier-quality completions.
- **Local Tier:** Ollama-backed models provide offline, cost-free completions for default workflows. The router must bias toward local inference unless quality thresholds dictate otherwise.
- **Observability:** All executions funnel into the cost dashboard and automation history tables. Instrumentation should capture provider latency, cost per task, and retry paths.
- **Security:** Rust commands enforce permission prompts, sandboxing, and structured logging to prevent prompt-injection takeover. See `SECURITY.md` for threat modeling status and TODOs.

## Key Documents

- Product Requirements: `AGI_Workforce_PRD_v4_0.md`
- Development Plan (market leadership revision): `AGI_Workforce_Complete_Development_Plan.md`
- Status & QA: `PROJECT_STATUS_SUMMARY.md`, `IMPLEMENTATION_AUDIT_REPORT.md`, `MILESTONE_EXECUTION_PLAN.md`
- Automation Architecture: `docs/SYSTEM_AUTOMATION_ARCHITECTURE.md`

All documentation is being actively reconciled with the codebase. When contributing, update the relevant `.md` file in the same pull request that changes functionality.

## Contributing Workflow

1. Create a feature branch.
2. Fix or implement functionality with accompanying tests.
3. Update documentation (README, status reports, runbooks) to reflect the change.
4. Run lint, typecheck, and unit tests; attach logs to PRs until CI is re-enabled.
5. Request review; ensure security-sensitive changes include threat model notes.

The mission is to deliver a desktop agent that **outperforms market leaders on speed, cost, and security**. Reaching that bar requires disciplined engineering, truthful status reporting, and relentless focus on automation quality.
